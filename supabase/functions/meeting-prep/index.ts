import { meetingPrepSchema } from '@da/validation'
import { z } from 'zod'
import { uuidSchema } from '@da/validation'
import { AppError, systemClock } from '../_shared/domain.ts'
import { completeJson, isAiConfigured } from '../_shared/ai.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { checkAiBudget, loadEntitlements, requireFeature } from '../_shared/limits.ts'
import { searchMemory } from '../_shared/memory.ts'
import { meetingPrepSystem } from '../_shared/prompts.ts'

const requestSchema = z.object({ eventId: uuidSchema })

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

interface Attendee {
  email?: string
  name?: string
  isSelf?: boolean
}

/**
 * Meeting Prep — the product's signature screen.
 *
 * Everything shown is assembled from records the user can open: recent threads
 * with the attendees, commitments in both directions, and memory chunks about
 * the people involved. When there is nothing to say, the prep says so with a
 * low confidence rather than filling the page with generic meeting advice.
 *
 * The result is cached on the event because it costs a reasoning-tier call and
 * reopening the screen must not re-bill it.
 */
serveFunction('meeting-prep', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()

  const entitlements = await loadEntitlements(user.id, now)
  requireFeature(entitlements, 'meeting_prep')

  const event = await client
    .from('calendar_events')
    .select('id, title, description, location, starts_at, ends_at, attendees, conference_url')
    .eq('id', body.eventId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (event.error) throw dbError(event.error)
  if (!event.data) throw new AppError('not_found', { detail: 'event_missing' })

  const attendees = (
    Array.isArray(event.data.attendees) ? (event.data.attendees as Attendee[]) : []
  ).filter((a) => !a.isSelf && a.email)

  const emails = attendees.map((a) => (a.email ?? '').toLowerCase()).filter(Boolean)

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
      .select('id, text, direction, person_name, due_at, status')
      .eq('user_id', user.id)
      .in('status', ['open', 'overdue'])
      .limit(20),
    searchMemory(
      user.id,
      `${event.data.title ?? ''} ${attendees.map((a) => a.name ?? '').join(' ')}`,
      6,
    ),
  ])

  const relevantCommitments = (commitments.data ?? []).filter((row) => {
    const name = ((row.person_name as string | null) ?? '').toLowerCase()
    return (
      name === '' ||
      attendees.some(
        (a) =>
          (a.name ?? '').toLowerCase().includes(name) ||
          name.includes((a.name ?? '').toLowerCase()),
      )
    )
  })

  const sources = {
    event: {
      title: event.data.title,
      startsAt: event.data.starts_at,
      endsAt: event.data.ends_at,
      location: event.data.location,
      description: event.data.description,
    },
    attendees: attendees.map((a) => ({ name: a.name ?? null, email: a.email ?? null })),
    contacts: contacts.data ?? [],
    recentThreads: (threads.data ?? []).map((t) => ({
      id: t.id,
      subject: t.subject,
      summary: t.summary,
      at: t.last_message_at,
    })),
    commitments: relevantCommitments.map((c) => ({
      id: c.id,
      text: c.text,
      direction: c.direction,
      dueAt: c.due_at,
    })),
    memory: memory.hits.map((h) => ({ id: h.sourceId, label: h.sourceLabel, content: h.content })),
  }

  if (!isAiConfigured()) {
    // A useful prep without a model: the raw material, honestly labelled.
    return jsonResponse(
      {
        prep: {
          purpose: null,
          lastContactSummary: null,
          openLoops: [],
          userOwes: relevantCommitments
            .filter((c) => c.direction === 'user_owes')
            .map((c) => String(c.text)),
          otherOwes: relevantCommitments
            .filter((c) => c.direction === 'other_owes')
            .map((c) => String(c.text)),
          talkingPoints: (threads.data ?? []).slice(0, 3).map((t) => String(t.subject ?? '')),
          twoMinuteSummary: '',
          confidence: 0,
        },
        sources,
        generated: false,
      },
      200,
      origin,
    )
  }

  await checkAiBudget(user.id, entitlements, now)

  const prep = await completeJson({
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

  return jsonResponse({ prep, sources, generated: true }, 200, origin)
})
