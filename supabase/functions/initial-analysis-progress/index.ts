import { systemClock, toIsoDate } from '../_shared/domain.ts'
import { loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'

/** Phase order, so progress can be reported as a fraction. */
const PHASES = ['queued', 'mail', 'analysis', 'calendar', 'follow_ups', 'briefing', 'done'] as const

/**
 * Progress for the onboarding analysis screen.
 *
 * Derived from what actually exists rather than from a stored counter: a
 * progress bar that keeps moving after the job died is worse than one that
 * stalls honestly.
 */
serveFunction('initial-analysis-progress', async ({ request, origin }) => {
  const user = await requireUser(request)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()
  const forDate = toIsoDate(now, profile.timeZone)

  const [messages, threads, events, followUps, briefing, syncState] = await Promise.all([
    client
      .from('email_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    client
      .from('email_threads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('importance', ['critical', 'high']),
    client
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    client
      .from('follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'waiting'),
    client
      .from('briefings')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('kind', 'morning')
      .eq('for_date', forDate)
      .maybeSingle(),
    client
      .from('sync_states')
      .select('status, last_error')
      .eq('user_id', user.id)
      .eq('resource', 'mail')
      .order('last_run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const emailsFound = messages.count ?? 0
  const meetingsFound = events.count ?? 0
  const briefingReady = briefing.data?.status === 'ready'

  const phase = briefingReady
    ? 'done'
    : meetingsFound > 0
      ? 'briefing'
      : emailsFound > 0
        ? 'analysis'
        : syncState.data?.status === 'syncing'
          ? 'mail'
          : 'queued'

  return jsonResponse(
    {
      phase,
      emailsFound,
      importantFound: threads.count ?? 0,
      meetingsFound,
      followUpsFound: followUps.count ?? 0,
      progress: PHASES.indexOf(phase as (typeof PHASES)[number]) / (PHASES.length - 1),
      briefingId: briefing.data?.id ?? null,
      errorCode: (syncState.data?.last_error as string | null) ?? null,
    },
    200,
    origin,
  )
})
