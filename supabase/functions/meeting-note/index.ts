import { z } from 'zod'
import { uuidSchema } from '@da/validation'
import { AppError, extractDates, systemClock } from '../_shared/domain.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

const requestSchema = z.object({
  eventId: uuidSchema,
  /** What the user typed or dictated after the meeting. */
  note: z.string().min(1).max(4000),
})

/**
 * The post-meeting note.
 *
 * The note is stored as memory, and any commitment sentence it contains is
 * turned into a *proposal* rather than a record: the user confirms before it
 * starts counting against them. Dates are read with the deterministic
 * extractor, so a commitment never claims a deadline the note did not state.
 */
serveFunction('meeting-note', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
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

  const dates = extractDates(body.note, now, profile.timeZone)
  const dueAt = dates[0]?.at ?? null

  const attendees = Array.isArray(event.data.attendees)
    ? (event.data.attendees as Array<{ name?: string; email?: string; isSelf?: boolean }>)
    : []
  const other = attendees.find((a) => !a.isSelf)

  await client.from('memory_chunks').upsert(
    {
      user_id: user.id,
      content: `${event.data.title ?? ''}\n${body.note}`,
      source_type: 'calendar_event',
      source_id: body.eventId,
      source_label: (event.data.title as string | null) ?? '',
      occurred_at: (event.data.starts_at as string | null) ?? now.toISOString(),
      topic: 'meeting_note',
    },
    { onConflict: 'user_id,source_type,source_id' },
  )

  // The proposal is returned rather than written: the client turns it into an
  // approval card so the user confirms the wording and the date.
  return jsonResponse(
    {
      saved: true,
      proposedCommitment: {
        text: body.note.slice(0, 300),
        direction: 'user_owes' as const,
        personName: other?.name ?? other?.email ?? null,
        dueAt,
        quote: dates[0]?.quote ?? body.note.slice(0, 200),
        sourceType: 'calendar_event' as const,
        sourceId: body.eventId,
      },
      extractedDates: dates.map((d) => ({ at: d.at, quote: d.quote, confidence: d.confidence })),
    },
    200,
    origin,
  )
})
