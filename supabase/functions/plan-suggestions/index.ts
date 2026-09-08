import {
  planSuggestionsRequest,
  type PlanSuggestion,
  type PlanSuggestionsResponse,
} from '@da/validation'
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

/** How far ahead to look. Past this a gap is a guess, not a plan. */
const WINDOW_DAYS = 2
/** Deadlines to consider when naming what the free time is for. */
const DEADLINE_LIMIT = 5

type PlanRow = Record<string, unknown>

function textAt(row: PlanRow, column: string): string | null {
  const value = row[column]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function instantAt(row: PlanRow, column: string): number | null {
  const value = row[column]
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Schedule suggestions: real gaps on the user's calendar, and the outstanding
 * work they could be spent on. Acting on one still opens an approval, so
 * nothing here writes to a calendar.
 *
 * Every suggestion travels as an i18n key plus its values rather than as a
 * sentence — the server has no business deciding which language the user reads.
 */
serveFunction('plan-suggestions', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, planSuggestionsRequest)
  const profile = await loadUserContext(user.id)
  const timeZone = body.timeZone ?? profile.timeZone
  const now = systemClock.now()

  // Midday in UTC lands on the intended calendar date in every zone.
  const anchor = body.date ? new Date(`${body.date}T12:00:00Z`) : now

  const client = serviceClient()
  const windowStart = startOfLocalDay(anchor, timeZone)
  const windowEnd = endOfLocalDay(addLocalDays(anchor, WINDOW_DAYS, timeZone), timeZone)

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
      .limit(DEADLINE_LIMIT),
  ])

  if (events.error) throw dbError(events.error)
  if (commitments.error) throw dbError(commitments.error)

  const timed: TimedEvent[] = toTimedEvents(events.data ?? [])
  const suggestions: PlanSuggestion[] = []

  // Only suggest from now onward: a gap that has already passed is not a plan.
  const searchStart = new Date(Math.max(windowStart.getTime(), now.getTime()))
  const focus = suggestFocusBlock(timed, searchStart, windowEnd, body.desiredMinutes)
  if (focus) {
    suggestions.push({
      // Derived from the gap itself, so re-asking for the same day proposes
      // the same block and the approval's idempotency key still matches.
      id: `focus:${focus.startsAt}`,
      kind: 'focus_block',
      messageKey: focus.messageKey,
      values: focus.values,
      startsAt: focus.startsAt,
      endsAt: focus.endsAt,
      minutes: focus.minutes,
      relatedEventId: null,
    })
  }

  // The nearest deadline inside the window. This is what makes the free time
  // worth protecting, so it is surfaced rather than counted and discarded.
  const commitmentRows: PlanRow[] = commitments.data ?? []
  const nextDue = commitmentRows.find((row) => {
    const dueAt = instantAt(row, 'due_at')
    return dueAt !== null && dueAt <= windowEnd.getTime()
  })
  const nextDueId = nextDue ? textAt(nextDue, 'id') : null
  const nextDueText = nextDue ? textAt(nextDue, 'text') : null
  if (nextDueId && nextDueText) {
    suggestions.push({
      id: `deadline:${nextDueId}`,
      kind: 'prepare',
      messageKey: 'plan.suggestion.moveDeadlineWork',
      values: { title: nextDueText },
      startsAt: null,
      endsAt: null,
      minutes: null,
      relatedEventId: null,
    })
  }

  const payload: PlanSuggestionsResponse = { suggestions }

  return jsonResponse(payload, 200, origin)
})
