import {
  initialAnalysisProgressFor,
  initialAnalysisRequest,
  type InitialAnalysisResponse,
} from '@da/validation'
import { systemClock, toAppError, toIsoDate, type ErrorCode } from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { listSyncableAccounts, syncCalendar, syncMail, type SyncOutcome } from '../_shared/sync.ts'
import { briefingStats, buildBriefing, collectBriefingInputs } from '../_shared/briefing-builder.ts'

/**
 * The onboarding pass.
 *
 * Deliberately narrow: the last N hours only, so the user reaches their first
 * real briefing in a minute rather than waiting on a full mailbox. The deeper
 * history is left to the background backfill, which the sync cursor already
 * knows how to resume.
 *
 * A single failing account does not stop it — the user still gets a briefing
 * from the accounts that worked, and the integrations screen is where the
 * broken one is offered a reconnect. A pass where *every* account it tried
 * failed is a different thing: it writes no briefing and reports
 * `phase: 'failed'` with the provider's error code, so the screen offers the
 * retry it has always had copy for. Writing a `ready` briefing out of a pass
 * that read nothing is how "İşte bugün bilmen gerekenler" came to sit above an
 * empty day.
 */
serveFunction('initial-analysis', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, initialAnalysisRequest)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()

  const hours = body.hours
  const historyDays = Math.max(1, Math.ceil(hours / 24))

  // Progress is derived from the data that exists rather than from a phase
  // counter: `sync_states` is keyed by connected account, and a synthetic row
  // with no account would both violate that key and keep "progressing" after a
  // failed run. `initial-analysis-progress` reads the real rows instead.

  await audit({ userId: user.id, action: 'sync.started', metadata: { hours } })

  const outcomes: SyncOutcome[] = []
  const failureCodes: ErrorCode[] = []

  for (const account of await listSyncableAccounts(user.id, 'mail')) {
    try {
      outcomes.push(await syncMail(user.id, account, historyDays, now))
    } catch (error) {
      failureCodes.push(toAppError(error).code)
    }
  }

  for (const account of await listSyncableAccounts(user.id, 'calendar')) {
    try {
      outcomes.push(await syncCalendar(user.id, account, now))
    } catch (error) {
      failureCodes.push(toAppError(error).code)
    }
  }

  // Tried, and nothing came back. Not slow — over.
  const failed = outcomes.length === 0 && failureCodes.length > 0

  const forDate = toIsoDate(now, profile.timeZone)
  let briefingId: string | null = null

  if (!failed) {
    const collected = await collectBriefingInputs(
      user.id,
      'morning',
      forDate,
      profile.timeZone,
      now,
    )
    const built = await buildBriefing(
      user.id,
      'morning',
      profile.locale,
      profile.givenName ?? profile.displayName,
      profile.timeZone,
      now,
      collected.inputs,
    )

    const briefing = await client
      .from('briefings')
      .upsert(
        {
          user_id: user.id,
          kind: 'morning',
          for_date: forDate,
          status: 'ready',
          headline: built.headline,
          narrative: built.narrative,
          duration_seconds: built.durationSeconds,
          generated_at: now.toISOString(),
          content_hash: collected.contentHash,
          stats: briefingStats(collected.inputs),
        },
        { onConflict: 'user_id,kind,for_date' },
      )
      .select('id')
      .single()
    if (briefing.error) throw dbError(briefing.error)

    briefingId = briefing.data.id as string
    await client.from('briefing_items').delete().eq('briefing_id', briefingId)
    if (built.items.length > 0) {
      await client.from('briefing_items').insert(
        built.items.map((item, index) => ({
          user_id: user.id,
          briefing_id: briefingId,
          section: item.section,
          position: index,
          title: item.title,
          detail: item.detail,
          source_type: item.sourceType,
          source_id: item.sourceId,
          related_entity_type: item.sourceType,
          related_entity_id: item.sourceId,
          importance: item.importance,
        })),
      )
    }
  }

  // The same four counts `initial-analysis-progress` reports, read the same
  // way. The screen renders whichever of the two answers arrived last, so a
  // count that means "this pass" here and "everything stored" there would show
  // the user two different numbers two seconds apart.
  const [messages, threads, events, followUps] = await Promise.all([
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
  ])

  await audit({
    userId: user.id,
    action: failed ? 'sync.failed' : 'sync.completed',
    metadata: {
      hours,
      processed: outcomes.reduce((sum, outcome) => sum + outcome.processed, 0),
      analyzed: outcomes.reduce((sum, outcome) => sum + outcome.analyzed, 0),
      failures: failureCodes.length,
    },
  })

  const payload: InitialAnalysisResponse = {
    phase: failed ? 'failed' : 'done',
    emailsFound: messages.count ?? 0,
    importantFound: threads.count ?? 0,
    meetingsFound: events.count ?? 0,
    followUpsFound: followUps.count ?? 0,
    progress: initialAnalysisProgressFor(failed ? 'queued' : 'done'),
    briefingId,
    errorCode: failed ? (failureCodes[0] ?? null) : null,
  }

  return jsonResponse(payload, 200, origin)
})
