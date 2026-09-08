import {
  initialAnalysisProgressFor,
  type InitialAnalysisOrderedPhase,
  type InitialAnalysisProgressResponse,
} from '@da/validation'
import { systemClock, toIsoDate, type ErrorCode } from '../_shared/domain.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'

/** One `sync_states` row, reduced to the three columns this endpoint reads. */
interface SyncStateProgressRow {
  resource: string
  status: string
  last_error: string | null
}

/**
 * What a failure is called when the sync state recorded one without a code —
 * the same fallback `_shared/sync.ts` writes, so the two cannot disagree.
 */
const UNKNOWN_SYNC_ERROR: ErrorCode = 'provider_unavailable'

/**
 * Progress for the onboarding analysis screen.
 *
 * Derived from what actually exists rather than from a stored counter: a
 * progress bar that keeps moving after the job died is worse than one that
 * stalls honestly. Every phase below is reported on evidence — rows that
 * landed, or a sync state that finished — so the bar can only advance because
 * something advanced.
 *
 * The failure rule is the one `sync-start` uses: the pass tried, every mail
 * account it tried is in error, and nothing landed. One broken mailbox beside
 * a working one is not a dead end, so it keeps going; the integrations screen
 * is where that account is surfaced for reconnection.
 */
serveFunction('initial-analysis-progress', async ({ request, origin }) => {
  const user = await requireUser(request)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()
  const forDate = toIsoDate(now, profile.timeZone)

  const [messages, threads, events, followUps, briefing, syncStates] = await Promise.all([
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
    // Every mail and calendar state, not the single most recent one: whether
    // the pass is dead is a question about all of the accounts, and
    // `last_run_at` is null until an account has run at least once, so
    // "the newest row" was not even well defined before the first run.
    client
      .from('sync_states')
      .select('resource, status, last_error')
      .eq('user_id', user.id)
      .in('resource', ['mail', 'calendar']),
  ])

  if (syncStates.error) throw dbError(syncStates.error)
  if (briefing.error) throw dbError(briefing.error)

  const states = (syncStates.data ?? []) as SyncStateProgressRow[]
  const mailStates = states.filter((state) => state.resource === 'mail')
  const calendarStates = states.filter((state) => state.resource === 'calendar')

  const emailsFound = messages.count ?? 0
  const importantFound = threads.count ?? 0
  const meetingsFound = events.count ?? 0
  const followUpsFound = followUps.count ?? 0
  const briefingReady = briefing.data?.status === 'ready'

  /** A resource whose run came to rest without an error has finished. */
  const finished = (rows: readonly SyncStateProgressRow[]): boolean =>
    rows.some((state) => state.status === 'idle')
  const running = (rows: readonly SyncStateProgressRow[]): boolean =>
    rows.some((state) => state.status === 'syncing' || state.status === 'backfilling')

  const reached: InitialAnalysisOrderedPhase = briefingReady
    ? 'done'
    : finished(calendarStates)
      ? // The calendar is read; what is left is the follow-up scan and then
        // writing the briefing. A follow-up that exists proves the scan ran.
        followUpsFound > 0
        ? 'briefing'
        : 'follow_ups'
      : finished(mailStates)
        ? 'calendar'
        : emailsFound > 0
          ? 'analysis'
          : running(mailStates)
            ? 'mail'
            : 'queued'

  // Nothing landed and every mailbox it tried is in error: the pass is not slow,
  // it is over, and the screen should offer to retry rather than spin.
  const nothingLanded = emailsFound === 0 && meetingsFound === 0 && !briefingReady
  const allMailErrored =
    mailStates.length > 0 && mailStates.every((state) => state.status === 'error')
  const failed = nothingLanded && allMailErrored
  const errorCode = failed
    ? (mailStates.find((state) => state.last_error !== null)?.last_error ?? UNKNOWN_SYNC_ERROR)
    : null

  const payload: InitialAnalysisProgressResponse = {
    phase: failed ? 'failed' : reached,
    emailsFound,
    importantFound,
    meetingsFound,
    followUpsFound,
    // The fraction the run actually reached, failed or not, so a failure does
    // not erase the steps that did complete.
    progress: initialAnalysisProgressFor(reached),
    briefingId: (briefing.data?.id as string | null) ?? null,
    errorCode,
  }

  return jsonResponse(payload, 200, origin)
})
