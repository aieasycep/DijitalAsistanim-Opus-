import { redeemReferralRequestSchema } from '@da/validation'
import {
  evaluateReferralRedemption,
  normalizeReferralCode,
  systemClock,
} from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { consumeRateLimit } from '../_shared/limits.ts'

/**
 * Redeem a referral code.
 *
 * Every eligibility rule is evaluated server-side against real counts, so the
 * abuse cases the client cannot be trusted on — self-referral, a second
 * redemption, an old account claiming to be new — are all decided here.
 * A rejection is a normal 200 with a reason, not an error.
 */
serveFunction('referral-redeem', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, redeemReferralRequestSchema)
  await consumeRateLimit(user.id, 'referralRedeem')

  const now = systemClock.now()
  const client = serviceClient()
  const code = normalizeReferralCode(body.code)

  const [owner, priorRedemptions, profile] = await Promise.all([
    client.from('referrals').select('user_id, redemption_count').eq('code', code).maybeSingle(),
    client
      .from('referral_credits')
      .select('id', { count: 'exact', head: true })
      .eq('referee_user_id', user.id),
    client.from('profiles').select('created_at').eq('id', user.id).maybeSingle(),
  ])

  if (owner.error) throw dbError(owner.error)
  if (priorRedemptions.error) throw dbError(priorRedemptions.error)

  const decision = evaluateReferralRedemption({
    code,
    referrerUserId: (owner.data?.user_id as string | null) ?? null,
    refereeUserId: user.id,
    refereePriorRedemptions: priorRedemptions.count ?? 0,
    referrerRedemptionCount: (owner.data?.redemption_count as number | null) ?? 0,
    refereeCreatedAt: (profile.data?.created_at as string | null) ?? now.toISOString(),
    now,
  })

  if (!decision.ok) {
    await audit({
      userId: user.id,
      action: 'referral.rejected',
      metadata: { reason: decision.reason },
    })
    return jsonResponse(
      { granted: false, bonusDays: 0, expiresAt: null, reason: decision.reason },
      200,
      origin,
    )
  }

  const referrerId = owner.data?.user_id as string

  // Both sides are credited in one batch; the unique index on
  // (referee_user_id, code) is what makes a double submit a no-op.
  const { error } = await client.from('referral_credits').insert([
    {
      user_id: user.id,
      code,
      referrer_user_id: referrerId,
      referee_user_id: user.id,
      bonus_days: decision.bonusDays,
      granted_at: now.toISOString(),
      expires_at: decision.expiresAt,
    },
    {
      user_id: referrerId,
      code,
      referrer_user_id: referrerId,
      referee_user_id: user.id,
      bonus_days: decision.bonusDays,
      granted_at: now.toISOString(),
      expires_at: decision.expiresAt,
    },
  ])

  if (error) {
    if (error.code === '23505') {
      return jsonResponse(
        { granted: false, bonusDays: 0, expiresAt: null, reason: 'already_redeemed' },
        200,
        origin,
      )
    }
    throw dbError(error)
  }

  await client
    .from('referrals')
    .update({ redemption_count: ((owner.data?.redemption_count as number | null) ?? 0) + 1 })
    .eq('code', code)

  await audit({
    userId: user.id,
    action: 'referral.redeemed',
    metadata: { bonus_days: decision.bonusDays },
  })

  return jsonResponse(
    { granted: true, bonusDays: decision.bonusDays, expiresAt: decision.expiresAt, reason: null },
    200,
    origin,
  )
})
