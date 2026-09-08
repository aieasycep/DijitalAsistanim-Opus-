import { eventAttendees, meetingNoteRequest, type MeetingNoteResponse } from '@da/validation'
import { AppError, extractDates, systemClock, type CommitmentDirection } from '../_shared/domain.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/** A line the user themselves marked as an item. */
const LIST_MARKER = /^\s*(?:[-–—*•·]|\d{1,2}[.)])\s+/
/** End of a sentence, keeping the punctuation with the sentence it closes. */
const SENTENCE_BREAK = /(?<=[.!?…])\s+/

const MIN_ACTION_LENGTH = 3
const MAX_ACTIONS = 20
const MAX_TEXT = 500
const MAX_QUOTE = 600

interface Segment {
  text: string
  /** True when the user wrote it as a list item rather than as prose. */
  listed: boolean
}

/**
 * The note, cut the way the user wrote it: one segment per list item, and one
 * per sentence everywhere else.
 */
function segmentsOf(note: string): Segment[] {
  const segments: Segment[] = []
  for (const line of note.split(/\r?\n/)) {
    if (LIST_MARKER.test(line)) {
      const text = line.replace(LIST_MARKER, '').trim()
      if (text.length > 0) segments.push({ text, listed: true })
      continue
    }
    for (const sentence of line.split(SENTENCE_BREAK)) {
      const text = sentence.trim()
      if (text.length > 0) segments.push({ text, listed: false })
    }
  }
  return segments
}

interface NoteAction {
  text: string
  /** Verbatim from the note, so the promise can be read back to its source. */
  quote: string
  dueAt: string | null
  direction: CommitmentDirection
  personName: string | null
}

/**
 * How a segment may open when the promise is someone else's, and who that is.
 *
 * Both the full name and the first name count, because a note says "Mehmet"
 * where the invite says "Mehmet Yılmaz". The stored counterparty is always the
 * name as the invite spells it, not the lower-cased form used to match.
 */
interface NameCandidate {
  prefix: string
  name: string
}

function nameCandidates(attendeeNames: readonly string[]): NameCandidate[] {
  const candidates = new Map<string, string>()
  for (const name of attendeeNames) {
    const trimmed = name.trim()
    if (trimmed.length < MIN_ACTION_LENGTH) continue
    candidates.set(trimmed.toLowerCase(), trimmed)
    const first = trimmed.split(/\s+/)[0] ?? ''
    if (first.length >= MIN_ACTION_LENGTH && !candidates.has(first.toLowerCase())) {
      candidates.set(first.toLowerCase(), trimmed)
    }
  }
  // Longest first, so "Mehmet Yılmaz" wins over "Mehmet" for the same line.
  return [...candidates.entries()]
    .map(([prefix, name]) => ({ prefix, name }))
    .sort((a, b) => b.prefix.length - a.prefix.length)
}

/**
 * What the note commits to.
 *
 * A segment is an action when the user listed it, or when it names a date the
 * deterministic extractor can find. Everything else in the note is context: it
 * is kept as memory, but it does not become a promise the app will chase the
 * user about. Nothing here is inferred — the text is the user's sentence, the
 * quote is that same sentence, and the date is one the sentence states.
 *
 * A segment that opens with an attendee's name is that person's promise; every
 * other action is the user's own, which is the reading the post-meeting screen
 * ("Sende" / "Onlarda") is built around.
 */
function actionsFrom(
  note: string,
  attendeeNames: readonly string[],
  counterpart: string | null,
  now: Date,
  timeZone: string,
): NoteAction[] {
  const candidates = nameCandidates(attendeeNames)
  const actions: NoteAction[] = []
  const seen = new Set<string>()

  for (const segment of segmentsOf(note)) {
    if (segment.text.length < MIN_ACTION_LENGTH) continue
    const dated = extractDates(segment.text, now, timeZone)[0] ?? null
    if (!segment.listed && dated === null) continue

    const quote = segment.text.slice(0, MAX_QUOTE)
    if (seen.has(quote)) continue
    seen.add(quote)

    const lower = segment.text.toLowerCase()
    const owner = candidates.find((candidate) => lower.startsWith(candidate.prefix)) ?? null
    actions.push({
      text: segment.text.slice(0, MAX_TEXT),
      quote,
      dueAt: dated?.at ?? null,
      direction: owner === null ? 'user_owes' : 'other_owes',
      personName: owner === null ? counterpart : owner.name,
    })
    if (actions.length === MAX_ACTIONS) break
  }

  return actions
}

/**
 * The post-meeting note.
 *
 * The note is stored as memory in full, and each item the user listed — plus
 * any sentence that names a date — becomes a commitment row they can open. It
 * used to return a single unsaved proposal instead, which the client's schema
 * accepted as an empty list, so the extraction reported success and the screen
 * said "no actions came out of it" every time. The rows are what the screen
 * links to, so the rows are what crosses the wire.
 *
 * They are written confirmed: the sentence is the user's own, typed minutes
 * ago, and the screen quotes each one back before they leave. Dates are read
 * with the deterministic extractor, so a commitment never claims a deadline
 * the note did not state.
 *
 * Re-extracting the same note is idempotent. `commitments_user_source_quote_key`
 * makes a quoted sentence unique per source, so the function reuses the rows it
 * already wrote for this event rather than cloning a promise on a second tap.
 */
serveFunction('meeting-note', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, meetingNoteRequest)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()

  const event = await client
    .from('calendar_events')
    .select('id, title, starts_at, attendees')
    .eq('id', body.eventId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (event.error) throw dbError(event.error)
  if (!event.data) throw new AppError('not_found', { detail: 'event_missing' })

  const eventRow = event.data as Record<string, unknown>
  const title = typeof eventRow['title'] === 'string' ? eventRow['title'] : ''
  const others = eventAttendees.parse(eventRow['attendees']).filter((attendee) => !attendee.isSelf)
  const attendeeNames = others.flatMap((attendee) =>
    attendee.name === null ? [] : [attendee.name],
  )
  // Only an unambiguous counterparty is named: with three people in the room,
  // "who I owe this to" is not something the note answers.
  const soleOther = others.length === 1 ? others[0] : undefined
  const counterpart = soleOther ? (soleOther.name ?? soleOther.email) : null

  const memory = await client.from('memory_chunks').upsert(
    {
      user_id: user.id,
      content: `${title}\n${body.note}`,
      source_type: 'calendar_event',
      source_id: body.eventId,
      source_label: title,
      occurred_at:
        typeof eventRow['starts_at'] === 'string' ? eventRow['starts_at'] : now.toISOString(),
      topic: 'meeting_note',
    },
    { onConflict: 'user_id,source_type,source_id' },
  )
  if (memory.error) throw dbError(memory.error)

  const actions = actionsFrom(body.note, attendeeNames, counterpart, now, profile.timeZone)

  const existing = await client
    .from('commitments')
    .select('*')
    .eq('user_id', user.id)
    .eq('source_type', 'calendar_event')
    .eq('source_id', body.eventId)
  if (existing.error) throw dbError(existing.error)

  const byQuote = new Map<string, Record<string, unknown>>()
  for (const row of (existing.data ?? []) as Record<string, unknown>[]) {
    const quote = row['source_quote']
    if (typeof quote === 'string') byQuote.set(quote, row)
  }

  const fresh = actions.filter((action) => !byQuote.has(action.quote))
  if (fresh.length > 0) {
    const inserted = await client
      .from('commitments')
      .insert(
        fresh.map((action) => ({
          user_id: user.id,
          text: action.text,
          direction: action.direction,
          person_name: action.personName,
          due_at: action.dueAt,
          status: 'open',
          source_type: 'calendar_event',
          source_id: body.eventId,
          source_quote: action.quote,
          confidence: 1,
          confirmed_by_user: true,
        })),
      )
      .select('*')
    if (inserted.error) throw dbError(inserted.error)
    for (const row of (inserted.data ?? []) as Record<string, unknown>[]) {
      const quote = row['source_quote']
      if (typeof quote === 'string') byQuote.set(quote, row)
    }
  }

  // In the order the note states them, so the list reads like the note.
  const payload: MeetingNoteResponse = {
    commitments: actions.flatMap((action) => {
      const row = byQuote.get(action.quote)
      return row === undefined ? [] : [row]
    }),
    createdApprovalIds: [],
  }

  return jsonResponse(payload, 200, origin)
})
