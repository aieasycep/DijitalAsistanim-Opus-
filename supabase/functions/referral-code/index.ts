import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'

/**
 * The user's own referral code, plus how their bonus currently stands.
 *
 * The code is minted by a database trigger at signup; this backfills one only
 * for an account created before that trigger existed.
 */
serveFunction('referral-code', async ({ request, origin }) => {
  const user = await requireUser(request)
  const now = systemClock.now()
  const client = serviceClient()

  const existing = await client
    .from('referrals')
    .select('code, redemption_count')
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing.error) throw dbError(existing.error)

  let code = (existing.data?.code as string | null) ?? null
  let redemptionCount = (existing.data?.redemption_count as number | null) ?? 0

  if (!code) {
    // Backfill for an account created before the signup trigger minted codes.
    const generated = await client.rpc('generate_referral_code')
    if (generated.error) throw dbError(generated.error)
    const inserted = await client
      .from('referrals')
      .insert({ user_id: user.id, code: generated.data as string, redemption_count: 0 })
      .select('code, redemption_count')
      .single()
    if (inserted.error) throw dbError(inserted.error)
    code = inserted.data.code as string
    redemptionCount = (inserted.data.redemption_count as number | null) ?? 0
  }

  const credits = await client
    .from('referral_credits')
    .select('expires_at, bonus_days, referrer_user_id, referee_user_id')
    .or(`referrer_user_id.eq.${user.id},referee_user_id.eq.${user.id}`)
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
    .order('expires_at', { ascending: false })

  if (credits.error) throw dbError(credits.error)

  return jsonResponse(
    {
      code,
      redemptionCount,
      bonusExpiresAt: credits.data?.[0]?.expires_at ?? null,
      activeBonuses: credits.data?.length ?? 0,
    },
    200,
    origin,
  )
})
