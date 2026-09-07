import { z } from 'zod'
import { isoDateSchema, timeZoneSchema } from '@da/validation'
import {
  addLocalDays,
  endOfLocalDay,
  startOfLocalDay,
  suggestFocusBlock,
  systemClock,
  type TimedEvent,
} from '../_shared/domain.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { toTimedEvents } from '../_shared/plan.ts'

const requestSchema = z.object({
  forDate: isoDateSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  desiredMinutes: z.number().int().min(15).max(480).default(90),
})

/**
 * Schedule suggestions: real gaps on the user's calendar, sized to the work
 * that is actually outstanding. Committing to one still goes through an
 * approval, so nothing here writes to a calendar.
 */
serveFunction('plan-suggestions', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
  const profile = await loadUserContext(user.id)
  const timeZone = body.timeZone ?? profile.timeZone
  const now = systemClock.now()
  const anchor = body.forDate ? new Date(`${body.forDate}T12:00:00Z`) : now

  const client = serviceClient()
  const windowStart = startOfLocalDay(anchor, timeZone)
  const windowEnd = endOfLocalDay(addLocalDays(anchor, 2, timeZone), timeZone)

  const [events, commitments] = await Promise.all([
    client
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .gte('ends_at', windowStart.toISOString())
      .lte('starts_at', windowEnd.toISOString()),
    client
      .from('commitments')
      .select('id, text, due_at')
      .eq('user_id', user.id)
      .in('status', ['open', 'overdue'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(5),
  ])

  if (events.error) throw dbError(events.error)
  if (commitments.error) throw dbError(commitments.error)

  const timed: TimedEvent[] = toTimedEvents(events.data ?? [])

  // Only suggest from now onward: a gap that has already passed is not a plan.
  const searchStart = new Date(Math.max(windowStart.getTime(), now.getTime()))
  const focus = suggestFocusBlock(timed, searchStart, windowEnd, body.desiredMinutes)

  return jsonResponse(
    {
      suggestions: focus ? [focus] : [],
      outstandingCommitments: commitments.data ?? [],
    },
    200,
    origin,
  )
})
