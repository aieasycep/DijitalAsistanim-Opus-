import { initialAnalysisRequestSchema } from '@da/validation'
import { systemClock, toIsoDate } from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import {
  listSyncableAccounts,
  syncCalendar,
  syncMail,
  type SyncOutcome,
} from '../_shared/sync.ts'
import {
  briefingStats,
  buildBriefing,
  collectBriefingInputs,
} from '../_shared/briefing-builder.ts'

/**
 * The onboarding pass.
 *
 * Deliberately narrow: the last N hours only, so the user reaches their first
 * real briefing in a minute rather than waiting on a full mailbox. The deeper
 * history is left to the background backfill, which the sync cursor already
 * knows how to resume.
 */
serveFunction('initial-analysis', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, initialAnalysisRequestSchema)
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

  for (const account of await listSyncableAccounts(user.id, 'mail')) {
    try {
      outcomes.push(await syncMail(user.id, account, historyDays, now))
    } catch {
      // A failing account must not stop onboarding; the user sees the
      // reconnect prompt on the integrations screen instead.
    }
  }

  for (const account of await listSyncableAccounts(user.id, 'calendar')) {
    try {
      outcomes.push(await syncCalendar(user.id, account, now))
    } catch {
      // Same reasoning.
    }
  }

  const forDate = toIsoDate(now, profile.timeZone)
  const collected = await collectBriefingInputs(user.id, 'morning', forDate, profile.timeZone, now)
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

  const briefingId = briefing.data.id as string
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

  await audit({
    userId: user.id,
    action: 'sync.completed',
    metadata: {
      hours,
      processed: outcomes.reduce((sum, o) => sum + o.processed, 0),
      analyzed: outcomes.reduce((sum, o) => sum + o.analyzed, 0),
    },
  })

  return jsonResponse(
    {
      phase: 'done',
      emailsFound: outcomes.reduce((sum, o) => sum + o.processed, 0),
      importantFound: collected.inputs.insights.length,
      meetingsFound: collected.inputs.events.length,
      followUpsFound: collected.inputs.followUps.length,
      progress: 1,
      briefingId,
      errorCode: null,
    },
    200,
    origin,
  )
})
