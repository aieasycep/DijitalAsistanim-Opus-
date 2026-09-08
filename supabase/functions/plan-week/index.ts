import { planWeekRequest, type PlanDayResponse, type PlanWeekResponse } from '@da/validation'
import {
  addLocalDays,
  detectConflicts,
  endOfLocalDay,
  findFreeBlocks,
  startOfLocalDay,
  startOfLocalWeek,
  summarizeDayLoad,
  systemClock,
  toIsoDate,
  type TimedEvent,
} from '../_shared/domain.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { toTimedEvents, type CalendarEventRow } from '../_shared/plan.ts'

const DAYS_IN_WEEK = 7
/** A gap shorter than this is not usable time, so it is not reported as one. */
const MIN_FREE_BLOCK_MINUTES = 30

/**
 * A row from `select('*')`: an open record whose date columns the bucketing
 * below reads by name. The contract keeps rows permissive on purpose — adding
 * a column must not require a contract change — so this is the only shape the
 * function needs to know about.
 */
type PlanRow = Record<string, unknown>
type EventRow = PlanRow & CalendarEventRow

/** The instant in a row's column, or null when it is absent or unparseable. */
function instantAt(row: PlanRow, column: string): number | null {
  const value = row[column]
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/** Rows whose `column` instant falls inside the local day. */
function datedWithin<T extends PlanRow>(
  rows: readonly T[],
  column: string,
  dayStart: Date,
  dayEnd: Date,
): T[] {
  return rows.filter((row) => {
    const at = instantAt(row, column)
    return at !== null && at >= dayStart.getTime() && at <= dayEnd.getTime()
  })
}

/** Events touching the local day, including ones that started before it. */
function eventsWithin(rows: readonly EventRow[], dayStart: Date, dayEnd: Date): EventRow[] {
  return rows.filter((row) => {
    const startsAt = instantAt(row, 'starts_at')
    const endsAt = instantAt(row, 'ends_at')
    if (startsAt === null || endsAt === null) return false
    return endsAt >= dayStart.getTime() && startsAt <= dayEnd.getTime()
  })
}

/**
 * A Monday-start week as seven complete day plans.
 *
 * Each day is exactly what `plan-day` would return for it — same fields, same
 * analysis, same scoping — because the screen renders one range by rendering
 * the other: a week is a list of days, so anything a day carries a week has to
 * carry too. Returning `{ date, load }` stubs is what left the week view with
 * no events, no conflicts and nothing to open.
 */
serveFunction('plan-week', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, planWeekRequest)
  const profile = await loadUserContext(user.id)
  const timeZone = body.timeZone ?? profile.timeZone
  const now = systemClock.now()

  // Midday in UTC lands on the intended calendar date in every zone.
  const anchor = body.startDate ? new Date(`${body.startDate}T12:00:00Z`) : now
  const weekStart = startOfLocalWeek(anchor, timeZone)
  const lastDay = addLocalDays(weekStart, DAYS_IN_WEEK - 1, timeZone)
  const weekEnd = endOfLocalDay(lastDay, timeZone)
  const from = weekStart.toISOString()
  const to = weekEnd.toISOString()

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

  const eventRows: EventRow[] = events.data ?? []
  const taskRows: PlanRow[] = tasks.data ?? []
  const commitmentRows: PlanRow[] = commitments.data ?? []
  const reminderRows: PlanRow[] = reminders.data ?? []

  const days: PlanDayResponse[] = Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
    const dayAnchor = addLocalDays(weekStart, index, timeZone)
    const dayStart = startOfLocalDay(dayAnchor, timeZone)
    const dayEnd = endOfLocalDay(dayAnchor, timeZone)
    const dayEvents = eventsWithin(eventRows, dayStart, dayEnd)
    const timed: TimedEvent[] = toTimedEvents(dayEvents)

    return {
      date: toIsoDate(dayAnchor, timeZone),
      events: dayEvents,
      tasks: datedWithin(taskRows, 'due_at', dayStart, dayEnd),
      commitments: datedWithin(commitmentRows, 'due_at', dayStart, dayEnd),
      reminders: datedWithin(reminderRows, 'remind_at', dayStart, dayEnd),
      freeBlocks: findFreeBlocks(timed, dayStart, dayEnd, MIN_FREE_BLOCK_MINUTES),
      conflicts: detectConflicts(timed),
      load: summarizeDayLoad(timed, dayAnchor, timeZone),
    }
  })

  const payload: PlanWeekResponse = {
    startDate: toIsoDate(weekStart, timeZone),
    endDate: toIsoDate(lastDay, timeZone),
    days,
  }

  return jsonResponse(payload, 200, origin)
})
