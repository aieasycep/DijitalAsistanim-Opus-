import { generateBriefingRequestSchema } from '@da/validation'
import { systemClock, toZonedParts } from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import {
  checkAiBudget,
  consumeRateLimit,
  loadEntitlements,
  requireFeature,
} from '../_shared/limits.ts'
import {
  briefingDateFor,
  briefingStats,
  buildBriefing,
  collectBriefingInputs,
} from '../_shared/briefing-builder.ts'

const PRO_KINDS = {
  midday: 'midday_pulse',
  evening: 'evening_close',
  weekly: 'weekly_review',
} as const

/**
 * Generate a briefing.
 *
 * The midday pulse is the interesting case: it is only produced when the day's
 * inputs have actually changed since the last briefing. Sending an unchanged
 * pulse would be the fastest way to teach users to ignore the app.
 */
serveFunction('briefing-generate', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, generateBriefingRequestSchema)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()

  const entitlements = await loadEntitlements(user.id, now)
  const proFeature = PRO_KINDS[body.kind as keyof typeof PRO_KINDS]
  if (proFeature) requireFeature(entitlements, proFeature)

  await consumeRateLimit(user.id, 'briefingGenerate')
  await checkAiBudget(user.id, entitlements, now)

  const forDate = body.forDate ?? briefingDateFor(body.kind, now, profile.timeZone)

  const prefs = await client
    .from('user_preferences')
    .select('quiet_days, briefing_on_weekends')
    .eq('user_id', user.id)
    .maybeSingle()
  if (prefs.error) throw dbError(prefs.error)

  const weekday = toZonedParts(now, profile.timeZone).weekday
  const quietDays = (prefs.data?.quiet_days as number[] | null) ?? []
  const isWeekend = weekday === 0 || weekday === 6
  const suppressed =
    !body.force &&
    (quietDays.includes(weekday) || (isWeekend && prefs.data?.briefing_on_weekends === false))

  if (suppressed) {
    await audit({
      userId: user.id,
      action: 'briefing.skipped',
      metadata: { kind: body.kind, reason: 'quiet_day' },
    })
    return jsonResponse({ status: 'skipped', reason: 'quiet_day', briefing: null }, 200, origin)
  }

  const existing = await client
    .from('briefings')
    .select('id, status, content_hash')
    .eq('user_id', user.id)
    .eq('kind', body.kind)
    .eq('for_date', forDate)
    .maybeSingle()
  if (existing.error) throw dbError(existing.error)

  if (existing.data?.status === 'ready' && !body.force) {
    const full = await client.from('briefings').select('*').eq('id', existing.data.id).single()
    return jsonResponse({ status: 'ready', reason: 'cached', briefing: full.data }, 200, origin)
  }

  const collected = await collectBriefingInputs(user.id, body.kind, forDate, profile.timeZone, now)

  // The midday pulse exists to report change. No change, no pulse.
  if (body.kind === 'midday' && !body.force) {
    const morning = await client
      .from('briefings')
      .select('content_hash')
      .eq('user_id', user.id)
      .eq('kind', 'morning')
      .eq('for_date', forDate)
      .maybeSingle()

    if (collected.isEmpty || morning.data?.content_hash === collected.contentHash) {
      await client.from('briefings').upsert(
        {
          user_id: user.id,
          kind: body.kind,
          for_date: forDate,
          status: 'skipped',
          content_hash: collected.contentHash,
        },
        { onConflict: 'user_id,kind,for_date' },
      )
      await audit({
        userId: user.id,
        action: 'briefing.skipped',
        metadata: { kind: body.kind, reason: 'no_change' },
      })
      return jsonResponse({ status: 'skipped', reason: 'no_change', briefing: null }, 200, origin)
    }
  }

  const built = await buildBriefing(
    user.id,
    body.kind,
    profile.locale,
    profile.givenName ?? profile.displayName,
    profile.timeZone,
    now,
    collected.inputs,
  )

  const saved = await client
    .from('briefings')
    .upsert(
      {
        user_id: user.id,
        kind: body.kind,
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
    .select('*')
    .single()
  if (saved.error) throw dbError(saved.error)

  const briefingId = saved.data.id as string

  // Items are replaced wholesale: a regenerated briefing must not accumulate
  // yesterday's rows alongside today's.
  await client.from('briefing_items').delete().eq('briefing_id', briefingId)

  if (built.items.length > 0) {
    const { error } = await client.from('briefing_items').insert(
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
    if (error) throw dbError(error)
  }

  await audit({
    userId: user.id,
    action: 'briefing.generated',
    entityType: 'briefing',
    entityId: briefingId,
    metadata: { kind: body.kind, items: built.items.length },
  })

  const items = await client
    .from('briefing_items')
    .select('*')
    .eq('briefing_id', briefingId)
    .order('position', { ascending: true })

  return jsonResponse(
    { status: 'ready', reason: null, briefing: saved.data, items: items.data ?? [] },
    200,
    origin,
  )
})
