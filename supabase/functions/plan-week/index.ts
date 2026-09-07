import { z } from 'zod'
import { isoDateSchema, timeZoneSchema } from '@da/validation'
import {
  addLocalDays,
  detectConflicts,
  startOfLocalWeek,
  summarizeDayLoad,
  systemClock,
  toIsoDate,
  type TimedEvent,
} from '../_shared/domain.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { toTimedEvents } from '../_shared/plan.ts'

const requestSchema = z.object({
  forDate: isoDateSchema.optional(),
  timeZone: timeZoneSchema.optional(),
})

/** A Monday-start week, with each day's load summarised separately. */
serveFunction('plan-week', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
  const profile = await loadUserContext(user.id)
  const timeZone = body.timeZone ?? profile.timeZone
  const now = systemClock.now()
  const anchor = body.forDate ? new Date(`${body.forDate}T12:00:00Z`) : now

  const weekStart = startOfLocalWeek(anchor, timeZone)
  const weekEnd = addLocalDays(weekStart, 7, timeZone)

  const client = serviceClient()
  const [events, commitments] = await Promise.all([
    client
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .gte('ends_at', weekStart.toISOString())
      .lte('starts_at', weekEnd.toISOString())
      .order('starts_at', { ascending: true }),
    client
      .from('commitments')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['open', 'overdue'])
      .order('due_at', { ascending: true, nullsFirst: false }),
  ])

  if (events.error) throw dbError(events.error)
  if (commitments.error) throw dbError(commitments.error)

  const timed: TimedEvent[] = toTimedEvents(events.data ?? [])

  const days = Array.from({ length: 7 }, (_, index) => {
    const dayAnchor = addLocalDays(weekStart, index, timeZone)
    return {
      date: toIsoDate(dayAnchor, timeZone),
      load: summarizeDayLoad(timed, dayAnchor, timeZone),
    }
  })

  return jsonResponse(
    {
      range: 'week',
      forDate: toIsoDate(weekStart, timeZone),
      timeZone,
      events: events.data ?? [],
      commitments: commitments.data ?? [],
      days,
      conflicts: detectConflicts(timed),
    },
    200,
    origin,
  )
})
