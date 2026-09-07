import { z } from 'zod'
import { isoDateSchema, timeZoneSchema } from '@da/validation'
import {
  detectConflicts,
  endOfLocalDay,
  findFreeBlocks,
  startOfLocalDay,
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

/**
 * A single day's plan: events, tasks, commitments, and the derived shape of the
 * day. The analysis is computed here rather than on the device so both clients
 * and the briefing generator agree about what "busy" means.
 */
serveFunction('plan-day', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
  const profile = await loadUserContext(user.id)
  const timeZone = body.timeZone ?? profile.timeZone
  const now = systemClock.now()
  const forDate = body.forDate ?? toIsoDate(now, timeZone)

  const anchor = new Date(`${forDate}T12:00:00Z`)
  const dayStart = startOfLocalDay(anchor, timeZone)
  const dayEnd = endOfLocalDay(anchor, timeZone)

  const client = serviceClient()
  const [events, tasks, commitments] = await Promise.all([
    client
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .gte('ends_at', dayStart.toISOString())
      .lte('starts_at', dayEnd.toISOString())
      .order('starts_at', { ascending: true }),
    client
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(50),
    client
      .from('commitments')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['open', 'overdue'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(50),
  ])

  for (const result of [events, tasks, commitments]) {
    if (result.error) throw dbError(result.error)
  }

  const timed: TimedEvent[] = toTimedEvents(events.data ?? [])

  return jsonResponse(
    {
      range: 'day',
      forDate,
      timeZone,
      events: events.data ?? [],
      tasks: tasks.data ?? [],
      commitments: commitments.data ?? [],
      freeBlocks: findFreeBlocks(timed, dayStart, dayEnd, 30),
      conflicts: detectConflicts(timed),
      load: summarizeDayLoad(timed, anchor, timeZone),
    },
    200,
    origin,
  )
})
