import { planDayRequest, type PlanDayResponse } from '@da/validation'
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

/** A gap shorter than this is not usable time, so it is not reported as one. */
const MIN_FREE_BLOCK_MINUTES = 30

/**
 * A single day's plan: what is on the calendar, what is due, and the derived
 * shape of the day. The analysis is computed here rather than on the device so
 * the app, the briefing generator and the widget agree about what "busy" means.
 *
 * Everything in the response is scoped to the day. A task with no due date, or
 * one due next week, is part of the backlog rather than part of today's plan —
 * `commitments.list()` and the Today feed answer that question — and keeping
 * the scope tight is what lets `plan-week` return seven of these without
 * repeating the same backlog seven times.
 */
serveFunction('plan-day', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, planDayRequest)
  const profile = await loadUserContext(user.id)
  const timeZone = body.timeZone ?? profile.timeZone
  const date = body.date ?? toIsoDate(systemClock.now(), timeZone)

  // Midday in UTC lands on the intended calendar date in every zone, so the
  // day boundaries below are the user's, not the server's.
  const anchor = new Date(`${date}T12:00:00Z`)
  const dayStart = startOfLocalDay(anchor, timeZone)
  const dayEnd = endOfLocalDay(anchor, timeZone)
  const from = dayStart.toISOString()
  const to = dayEnd.toISOString()

  const client = serviceClient()
  const [events, tasks, commitments, reminders] = await Promise.all([
    client
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .gte('ends_at', from)
      .lte('starts_at', to)
      .order('starts_at', { ascending: true }),
    client
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .gte('due_at', from)
      .lte('due_at', to)
      .order('due_at', { ascending: true }),
    client
      .from('commitments')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['open', 'overdue'])
      .gte('due_at', from)
      .lte('due_at', to)
      .order('due_at', { ascending: true }),
    client
      .from('reminders')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .gte('remind_at', from)
      .lte('remind_at', to)
      .order('remind_at', { ascending: true }),
  ])

  for (const result of [events, tasks, commitments, reminders]) {
    if (result.error) throw dbError(result.error)
  }

  const timed: TimedEvent[] = toTimedEvents(events.data ?? [])

  const payload: PlanDayResponse = {
    date,
    events: events.data ?? [],
    tasks: tasks.data ?? [],
    commitments: commitments.data ?? [],
    reminders: reminders.data ?? [],
    freeBlocks: findFreeBlocks(timed, dayStart, dayEnd, MIN_FREE_BLOCK_MINUTES),
    conflicts: detectConflicts(timed),
    load: summarizeDayLoad(timed, anchor, timeZone),
  }

  return jsonResponse(payload, 200, origin)
})
