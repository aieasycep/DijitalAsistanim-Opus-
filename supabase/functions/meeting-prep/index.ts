import {
  eventAttendees,
  meetingPrepRequest,
  meetingPrepSchema,
  type MeetingPrep,
  type MeetingPrepAttendee,
  type MeetingPrepResponse,
} from '@da/validation'
import { AppError, systemClock } from '../_shared/domain.ts'
import { completeJson, isAiConfigured } from '../_shared/ai.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { checkAiBudget, loadEntitlements, requireFeature } from '../_shared/limits.ts'
import { searchMemory } from '../_shared/memory.ts'
import { meetingPrepSystem } from '../_shared/prompts.ts'

const PREP_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'purpose',
    'lastContactSummary',
    'openLoops',
    'userOwes',
    'otherOwes',
    'talkingPoints',
    'twoMinuteSummary',
    'confidence',
  ],
  properties: {
    purpose: { type: ['string', 'null'], maxLength: 400 },
    lastContactSummary: { type: ['string', 'null'], maxLength: 400 },
    openLoops: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 200 } },
    userOwes: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 200 } },
    otherOwes: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 200 } },
    talkingPoints: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: { type: 'string', maxLength: 240 },
    },
    twoMinuteSummary: { type: 'string', maxLength: 1200 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
}

/** The columns of `contacts` this brief reads. */
interface ContactRow {
  email: string
  name: string | null
  company: string | null
  role: string | null
  last_contact_at: string | null
  is_vip: boolean
}

/** The columns of `email_threads` this brief reads. */
interface ThreadRow {
  id: string
  subject: string | null
  summary: string | null
  last_message_at: string | null
  participant_emails: string[] | null
}

/** A line the invite itself marked as a list item. */
const LIST_MARKER = /^\s*(?:[-–—*•·]|\d{1,2}[.)])\s+/
const LINK = /https?:\/\//i

const MAX_AGENDA_ITEMS = 12

/**
 * The agenda, read off the invite rather than written for it.
 *
 * Only lines the organiser marked as list items count — the screen labels the
 * section "taken from the invite", so a paragraph of prose is context and a
 * join link is plumbing. An invite with no list has no agenda, and the screen
 * says exactly that.
 */
function agendaFrom(description: string | null): string[] {
  if (description === null) return []
  // A set, because the screen keys the list by its text and an invite that
  // repeats a line would collide.
  const items = new Set<string>()
  for (const line of description.split(/\r?\n/)) {
    if (!LIST_MARKER.test(line)) continue
    const text = line.replace(LIST_MARKER, '').trim()
    if (text.length === 0 || LINK.test(text)) continue
    items.add(text.slice(0, 300))
    if (items.size === MAX_AGENDA_ITEMS) break
  }
  return [...items]
}

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Whether a promise belongs to someone in the room.
 *
 * The section says "nothing is open with these people", so a promise with no
 * counterparty is not one of them. Matching is done on the name in either
 * direction — the extractor stores "Mehmet" where the contact is "Mehmet
 * Yılmaz" — and on the address' local part, which is what the name is missing
 * from when the promise came out of a thread with no display name.
 */
function belongsToRoom(personName: unknown, names: readonly string[]): boolean {
  const name = normalize(personName)
  if (name.length === 0) return false
  return names.some((candidate) => candidate.includes(name) || name.includes(candidate))
}

/**
 * Meeting Prep — the product's signature screen.
 *
 * Everything shown is assembled from records the user can open: the agenda off
 * the invite, the people from `contacts`, the open items from real commitment
 * rows and the threads from their own mailbox. The model contributes exactly
 * two things — the two-minute paragraph and the points worth raising — and
 * when it is unavailable the rest of the brief still stands on its own.
 *
 * The response is the brief the screen renders, section for section, not this
 * function's working notes: it used to answer `{ prep, sources, generated }`
 * while the client required the brief, so every "Hazırla" opened an error
 * screen. `MeetingPrepResponse` is now the same object on both sides.
 *
 * The call is reasoning-tier and is not cached server-side; `useMeetingPrep`
 * holds the answer for ten minutes, so reopening the screen does not re-bill
 * it while an explicit "prepare again" does.
 */
serveFunction('meeting-prep', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, meetingPrepRequest)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()

  const entitlements = await loadEntitlements(user.id, now)
  requireFeature(entitlements, 'meeting_prep')

  const event = await client
    .from('calendar_events')
    .select('*')
    .eq('id', body.eventId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (event.error) throw dbError(event.error)
  if (!event.data) throw new AppError('not_found', { detail: 'event_missing' })

  const eventRow = event.data as Record<string, unknown>
  // One entry per address: the screen keys the list by it, and a provider that
  // lists an invitee twice must not put them in the room twice.
  const addresses = new Set<string>()
  const attendees = eventAttendees.parse(eventRow['attendees']).filter((attendee) => {
    if (attendee.isSelf || attendee.email.length === 0) return false
    const address = attendee.email.toLowerCase()
    if (addresses.has(address)) return false
    addresses.add(address)
    return true
  })

  const emails = [...addresses]

  const [contacts, threads, commitments, memory] = await Promise.all([
    emails.length > 0
      ? client
          .from('contacts')
          .select('id, name, email, company, role, last_contact_at, is_vip')
          .eq('user_id', user.id)
          .in('email', emails)
      : Promise.resolve({ data: [], error: null }),
    emails.length > 0
      ? client
          .from('email_threads')
          .select('id, subject, summary, last_message_at, participant_emails')
          .eq('user_id', user.id)
          .overlaps('participant_emails', emails)
          .order('last_message_at', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    client
      .from('commitments')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['open', 'overdue'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20),
    searchMemory(
      user.id,
      `${textOf(eventRow['title']) ?? ''} ${attendees.map((a) => a.name ?? '').join(' ')}`,
      6,
    ),
  ])

  // A brief assembled from three queries, one of which quietly failed, is the
  // kind of half-truth this screen exists to avoid: say so instead.
  if (contacts.error) throw dbError(contacts.error)
  if (threads.error) throw dbError(threads.error)
  if (commitments.error) throw dbError(commitments.error)

  const contactRows = (contacts.data ?? []) as ContactRow[]
  const threadRows = (threads.data ?? []) as ThreadRow[]
  const commitmentRows = (commitments.data ?? []) as Record<string, unknown>[]

  /** Every name and address local part the room answers to. */
  const roomNames = [
    ...attendees.map((attendee) => normalize(attendee.name)),
    ...attendees.map((attendee) => normalize(attendee.email.split('@')[0])),
    ...contactRows.map((contact) => normalize(contact.name)),
  ].filter((name) => name.length > 0)

  const openCommitments = commitmentRows.filter((row) =>
    belongsToRoom(row['person_name'], roomNames),
  )

  const attendeeBriefs: MeetingPrepAttendee[] = attendees.map((attendee) => {
    const address = attendee.email.toLowerCase()
    const contact = contactRows.find((row) => normalize(row.email) === address) ?? null
    // Threads come back newest first, so the first match is the last exchange.
    const thread =
      threadRows.find((row) =>
        (row.participant_emails ?? []).some((email) => normalize(email) === address),
      ) ?? null
    return {
      email: attendee.email,
      name: contact?.name ?? attendee.name,
      company: contact?.company ?? null,
      role: contact?.role ?? null,
      isVip: contact?.is_vip === true,
      lastContactAt: contact?.last_contact_at ?? null,
      recentContext: thread?.summary ?? null,
    }
  })

  const agenda = agendaFrom(textOf(eventRow['description']))

  // What the model is allowed to reason from, and nothing else.
  const sources = {
    event: {
      title: textOf(eventRow['title']),
      startsAt: textOf(eventRow['starts_at']),
      endsAt: textOf(eventRow['ends_at']),
      location: textOf(eventRow['location']),
      description: textOf(eventRow['description']),
      agenda,
    },
    attendees: attendeeBriefs.map((attendee) => ({
      name: attendee.name,
      email: attendee.email,
      company: attendee.company,
      role: attendee.role,
      lastContactAt: attendee.lastContactAt,
      recentContext: attendee.recentContext,
    })),
    recentThreads: threadRows.map((thread) => ({
      subject: thread.subject,
      summary: thread.summary,
      at: thread.last_message_at,
    })),
    commitments: openCommitments.map((row) => ({
      text: row['text'],
      direction: row['direction'],
      dueAt: row['due_at'],
    })),
    memory: memory.hits.map((hit) => ({ label: hit.sourceLabel, content: hit.content })),
  }

  let prep: MeetingPrep | null = null
  if (isAiConfigured()) {
    await checkAiBudget(user.id, entitlements, now)
    prep = await completeJson({
      userId: user.id,
      operation: 'meeting_prep',
      parse: (value) => meetingPrepSchema.safeParse(value),
      request: {
        tier: 'reasoning',
        schemaName: 'meeting_prep',
        jsonSchema: PREP_JSON_SCHEMA,
        system: meetingPrepSystem({
          locale: profile.locale,
          nowIso: now.toISOString(),
          timeZone: profile.timeZone,
        }),
        messages: [{ role: 'user', content: JSON.stringify(sources, null, 2) }],
        maxOutputTokens: 1400,
        temperature: 0.3,
      },
    })
  }

  // Without a model the brief is thinner, not broken: the agenda, the people,
  // the open promises and the threads are all records the user already has.
  const payload: MeetingPrepResponse = {
    eventId: body.eventId,
    event: eventRow,
    summary: prep?.twoMinuteSummary ?? '',
    agenda,
    attendees: attendeeBriefs,
    openCommitments,
    relatedThreadIds: threadRows.map((thread) => thread.id),
    suggestedQuestions: prep?.talkingPoints ?? [],
  }

  return jsonResponse(payload, 200, origin)
})
