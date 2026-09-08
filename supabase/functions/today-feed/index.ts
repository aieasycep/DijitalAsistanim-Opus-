import { todayFeedRequest, type TodayFeedResponse } from '@da/validation'
import {
  addLocalDays,
  endOfLocalDay,
  startOfLocalDay,
  systemClock,
  toIsoDate,
} from '../_shared/domain.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * The Today feed.
 *
 * One round trip that returns everything the home screen renders, because the
 * screen is what the user opens first and a waterfall of six requests would be
 * felt on every cold start. Each list is bounded — Today is meant to end.
 */
serveFunction('today-feed', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, todayFeedRequest)
  const profile = await loadUserContext(user.id)

  const timeZone = body.timeZone ?? profile.timeZone
  const now = systemClock.now()
  const forDate = body.forDate ?? toIsoDate(now, timeZone)

  // The window belongs to the requested day, not to the server's idea of now.
  // Midday in UTC lands on the intended calendar date in every zone, so the
  // boundaries below are the user's. This used to be anchored on `now`, which
  // meant asking for any day but today returned that day's briefing and
  // insights wrapped around *today's* calendar.
  const anchor = new Date(`${forDate}T12:00:00Z`)
  const dayStart = startOfLocalDay(anchor, timeZone)
  const dayEnd = endOfLocalDay(anchor, timeZone)
  // Tomorrow's first event is part of an evening's answer, so the event window
  // runs a day past the requested date rather than stopping at midnight.
  const eventWindowEnd = addLocalDays(dayEnd, 1, timeZone)

  const client = serviceClient()

  const [briefing, insights, events, commitments, followUps, lifeEvents, approvals] =
    await Promise.all([
      client
        .from('briefings')
        .select('*')
        .eq('user_id', user.id)
        .eq('for_date', forDate)
        .in('kind', ['morning', 'midday', 'evening'])
        .order('generated_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),

      client
        .from('insights')
        .select('*')
        .eq('user_id', user.id)
        .eq('for_date', forDate)
        .is('dismissed_at', null)
        .order('priority_score', { ascending: false })
        .limit(12),

      client
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .gte('ends_at', dayStart.toISOString())
        .lte('starts_at', eventWindowEnd.toISOString())
        .order('starts_at', { ascending: true })
        .limit(20),

      // Not day-scoped on purpose: what is expected of the user is a backlog,
      // and a promise that came due last week is still today's problem.
      client
        .from('commitments')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['open', 'overdue'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(15),

      // Both live statuses, and due by the end of the day being shown. A feed
      // that carried only `waiting` made the card disappear the moment the
      // user drafted a nudge from it, because drafting moves the row to
      // `nudged` — the same mismatch `followUps.list()` documents.
      client
        .from('follow_ups')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['waiting', 'nudged'])
        .lte('due_at', dayEnd.toISOString())
        .order('due_at', { ascending: true })
        .limit(10),

      client
        .from('life_events')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('occurs_at', { ascending: true, nullsFirst: false })
        .limit(10),

      // Approvals expire in real time rather than by calendar day, so this one
      // is measured against `now` whichever day is being asked for.
      client
        .from('approval_actions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .gt('expires_at', now.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
    ])

  for (const result of [insights, events, commitments, followUps, lifeEvents, approvals]) {
    if (result.error) throw dbError(result.error)
  }
  if (briefing.error) throw dbError(briefing.error)

  const briefingRow = briefing.data
  let briefingItems: Record<string, unknown>[] = []
  if (briefingRow) {
    const items = await client
      .from('briefing_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('briefing_id', briefingRow.id)
      .order('position', { ascending: true })
    if (items.error) throw dbError(items.error)
    briefingItems = items.data ?? []
  }

  const payload: TodayFeedResponse = {
    forDate,
    generatedAt: now.toISOString(),
    briefing: briefingRow,
    briefingItems,
    insights: insights.data ?? [],
    events: events.data ?? [],
    commitments: commitments.data ?? [],
    followUps: followUps.data ?? [],
    lifeEvents: lifeEvents.data ?? [],
    pendingApprovals: approvals.data ?? [],
  }

  return jsonResponse(payload, 200, origin)
})
