import type { ReferralCodeResponse } from '@da/validation'
import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'

/**
 * The user's own referral code, plus how their bonus currently stands.
 *
 * The code is minted by a database trigger at signup; this backfills one only
 * for an account created before that trigger existed. Either way the answer
 * always carries a code, which is what `referralCodeResponse` pins — a screen
 * offering a blank code to copy and share is worse than a visible failure.
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

  /**
   * The bonuses running on *this* account.
   *
   * `user_id` is the account the days were applied to, which is why a
   * redemption writes two rows — one for each side. Selecting on the referrer
   * and referee columns instead matched both rows of every redemption this
   * user referred, so a single invite reported two active bonuses.
   */
  const credits = await client
    .from('referral_credits')
    .select('expires_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
    .order('expires_at', { ascending: false })

  if (credits.error) throw dbError(credits.error)

  const payload: ReferralCodeResponse = {
    code,
    redemptionCount,
    activeBonuses: credits.data?.length ?? 0,
    bonusExpiresAt: (credits.data?.[0]?.expires_at as string | null | undefined) ?? null,
  }

  return jsonResponse(payload, 200, origin)
})
