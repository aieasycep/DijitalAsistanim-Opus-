import { describe, expect, it } from 'vitest'
import { DAY_MS } from './clock.ts'
import {
  checkLimit,
  FEATURES,
  hasFeature,
  PLAN_LIMITS,
  PRO_ENTITLEMENT_ID,
  PRODUCT_IDS,
  REFERRAL_BONUS_DAYS,
  resolveEntitlements,
  type EntitlementInput,
} from './entitlements.ts'
import {
  evaluateReferralRedemption,
  extendBonus,
  isValidReferralCode,
  MAX_REDEMPTIONS_PER_REFERRER,
  normalizeReferralCode,
  REFERRAL_CODE_LENGTH,
  referralCodeFromBytes,
  REFEREE_ELIGIBILITY_DAYS,
  type ReferralRedeemInput,
} from './referral.ts'

const now = new Date('2026-09-07T12:00:00.000Z')

const input = (over: Partial<EntitlementInput> = {}): EntitlementInput => ({
  subscriptionStatus: 'free',
  activeEntitlement: null,
  referralBonusExpiresAt: null,
  now,
  ...over,
})

describe('resolveEntitlements', () => {
  it('is free with no subscription and no bonus', () => {
    const result = resolveEntitlements(input())
    expect(result).toMatchObject({ plan: 'free', source: 'none', isTrial: false })
  })

  it('is Pro on an active subscription', () => {
    expect(
      resolveEntitlements(
        input({ subscriptionStatus: 'active', activeEntitlement: PRO_ENTITLEMENT_ID }),
      ),
    ).toMatchObject({ plan: 'pro', source: 'subscription', isTrial: false })
  })

  it('is Pro, and says so, during a trial', () => {
    expect(
      resolveEntitlements(
        input({ subscriptionStatus: 'trialing', activeEntitlement: PRO_ENTITLEMENT_ID }),
      ),
    ).toMatchObject({ plan: 'pro', source: 'trial', isTrial: true })
  })

  it('keeps Pro through a billing grace period', () => {
    // The card failed; taking the product away the same hour is the wrong
    // response to a bank's retry policy.
    expect(
      resolveEntitlements(
        input({ subscriptionStatus: 'grace_period', activeEntitlement: PRO_ENTITLEMENT_ID }),
      ),
    ).toMatchObject({ plan: 'pro', source: 'subscription' })
  })

  it('drops to free once the subscription expires or is revoked', () => {
    for (const status of ['expired', 'billing_issue'] as const) {
      expect(resolveEntitlements(input({ subscriptionStatus: status }))).toMatchObject({
        plan: 'free',
      })
    }
  })

  it('ignores an entitlement id that is not ours', () => {
    expect(
      resolveEntitlements(input({ subscriptionStatus: 'active', activeEntitlement: 'plus' })),
    ).toMatchObject({ plan: 'free' })
  })

  it('grants Pro from an unexpired referral bonus', () => {
    const expiresAt = new Date(now.getTime() + 3 * DAY_MS).toISOString()
    expect(resolveEntitlements(input({ referralBonusExpiresAt: expiresAt }))).toMatchObject({
      plan: 'pro',
      source: 'referral_bonus',
      expiresAt,
    })
  })

  it('does not grant Pro from an expired bonus', () => {
    const expiresAt = new Date(now.getTime() - 1).toISOString()
    expect(resolveEntitlements(input({ referralBonusExpiresAt: expiresAt }))).toMatchObject({
      plan: 'free',
    })
  })

  it('reports a real subscription rather than the bonus when both apply', () => {
    // The banner would otherwise tell a paying subscriber their access is
    // about to run out.
    expect(
      resolveEntitlements(
        input({
          subscriptionStatus: 'active',
          activeEntitlement: PRO_ENTITLEMENT_ID,
          referralBonusExpiresAt: new Date(now.getTime() + DAY_MS).toISOString(),
        }),
      ),
    ).toMatchObject({ plan: 'pro', source: 'subscription', expiresAt: null })
  })

  it('ignores an unparseable bonus expiry rather than granting Pro forever', () => {
    expect(resolveEntitlements(input({ referralBonusExpiresAt: 'whenever' }))).toMatchObject({
      plan: 'free',
    })
  })
})

describe('features and limits', () => {
  it('gates every Pro feature behind the Pro plan', () => {
    const free = resolveEntitlements(input())
    const pro = resolveEntitlements(
      input({ subscriptionStatus: 'active', activeEntitlement: PRO_ENTITLEMENT_ID }),
    )
    for (const feature of FEATURES) {
      expect(hasFeature(free, feature)).toBe(false)
      expect(hasFeature(pro, feature)).toBe(true)
    }
  })

  it('gives Pro a strictly more generous limit everywhere', () => {
    for (const key of Object.keys(PLAN_LIMITS.free) as Array<keyof typeof PLAN_LIMITS.free>) {
      const free = PLAN_LIMITS.free[key]
      const pro = PLAN_LIMITS.pro[key]
      if (free === null) continue
      expect(pro === null || pro >= free).toBe(true)
    }
  })

  it('reports remaining quota and stops at the limit', () => {
    const free = resolveEntitlements(input())
    const key = 'priorityRules' as const
    const limit = PLAN_LIMITS.free[key]
    if (limit === null) return
    expect(checkLimit(free, key, 0)).toEqual({ allowed: true, limit, used: 0, remaining: limit })
    expect(checkLimit(free, key, limit - 1).allowed).toBe(true)
    expect(checkLimit(free, key, limit)).toMatchObject({ allowed: false, remaining: 0 })
    expect(checkLimit(free, key, limit + 5).remaining).toBe(0)
  })

  it('treats a null limit as unbounded', () => {
    const pro = resolveEntitlements(
      input({ subscriptionStatus: 'active', activeEntitlement: PRO_ENTITLEMENT_ID }),
    )
    for (const key of Object.keys(PLAN_LIMITS.pro) as Array<keyof typeof PLAN_LIMITS.pro>) {
      if (PLAN_LIMITS.pro[key] !== null) continue
      expect(checkLimit(pro, key, 1_000_000)).toMatchObject({ allowed: true, remaining: null })
    }
  })

  it('names both store products', () => {
    expect(PRODUCT_IDS.monthly).toMatch(/^da_pro_/)
    expect(PRODUCT_IDS.annual).toMatch(/^da_pro_/)
    expect(PRODUCT_IDS.monthly).not.toBe(PRODUCT_IDS.annual)
  })
})

describe('referral codes', () => {
  it('accepts a well-formed code and rejects the rest', () => {
    expect(isValidReferralCode('ABCD2345')).toBe(true)
    // Case is not part of the code: someone reading it off a screen and
    // typing it in lower case has typed the right code.
    expect(isValidReferralCode('abcd2345')).toBe(true)
    expect(isValidReferralCode('ABCD234')).toBe(false)
    expect(isValidReferralCode('ABCD 2345')).toBe(false)
    expect(isValidReferralCode('ABCD23O5')).toBe(false)
    expect(isValidReferralCode('')).toBe(false)
  })

  it('normalises how a person actually types a code', () => {
    expect(normalizeReferralCode(' abcd-2345 ')).toBe('ABCD2345')
    expect(isValidReferralCode(normalizeReferralCode('abcd 2345'))).toBe(true)
  })

  it('generates codes of the right length from random bytes', () => {
    const code = referralCodeFromBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH)
    expect(isValidReferralCode(code)).toBe(true)
  })

  it('avoids the characters people confuse when reading a code aloud', () => {
    const alphabet = new Set<string>()
    for (let i = 0; i < 256; i++) {
      const bytes = new Uint8Array(16).fill(i)
      for (const ch of referralCodeFromBytes(bytes)) alphabet.add(ch)
    }
    for (const confusable of ['O', '0', 'I', '1', 'L']) {
      expect(alphabet.has(confusable)).toBe(false)
    }
  })
})

describe('referral redemption', () => {
  const redeem = (over: Partial<ReferralRedeemInput> = {}): ReferralRedeemInput => ({
    code: 'ABCD2345',
    referrerUserId: 'referrer',
    refereeUserId: 'referee',
    refereeCreatedAt: new Date(now.getTime() - DAY_MS).toISOString(),
    refereePriorRedemptions: 0,
    referrerRedemptionCount: 0,
    now,
    ...over,
  })

  it('grants the bonus to a new user with a valid code', () => {
    const decision = evaluateReferralRedemption(redeem())
    expect(decision.ok).toBe(true)
    if (decision.ok) {
      expect(decision.bonusDays).toBe(REFERRAL_BONUS_DAYS)
      expect(new Date(decision.expiresAt).getTime() - now.getTime()).toBe(
        REFERRAL_BONUS_DAYS * DAY_MS,
      )
    }
  })

  it.each([
    ['invalid_code', { code: 'nope' }],
    ['unknown_code', { referrerUserId: null }],
    ['self_referral', { referrerUserId: 'referee' }],
    ['already_redeemed', { refereePriorRedemptions: 1 }],
    ['referee_not_new', { refereeCreatedAt: new Date(now.getTime() - 30 * DAY_MS).toISOString() }],
    ['referrer_limit_reached', { referrerRedemptionCount: MAX_REDEMPTIONS_PER_REFERRER }],
  ])('rejects with %s', (reason, over) => {
    const decision = evaluateReferralRedemption(redeem(over as Partial<ReferralRedeemInput>))
    expect(decision).toEqual({ ok: false, reason })
  })

  it('accepts a referee on the last eligible day and refuses the day after', () => {
    const onTheEdge = new Date(now.getTime() - REFEREE_ELIGIBILITY_DAYS * DAY_MS + 1).toISOString()
    expect(evaluateReferralRedemption(redeem({ refereeCreatedAt: onTheEdge })).ok).toBe(true)

    const justPast = new Date(now.getTime() - REFEREE_ELIGIBILITY_DAYS * DAY_MS - 1).toISOString()
    expect(evaluateReferralRedemption(redeem({ refereeCreatedAt: justPast }))).toEqual({
      ok: false,
      reason: 'referee_not_new',
    })
  })

  it('accepts a code typed in lower case with a dash', () => {
    expect(evaluateReferralRedemption(redeem({ code: 'abcd-2345' })).ok).toBe(true)
  })
})

describe('extendBonus', () => {
  it('stacks onto an existing bonus rather than resetting it', () => {
    const current = new Date(now.getTime() + 5 * DAY_MS).toISOString()
    const extended = extendBonus(current, 14, now)
    expect(new Date(extended).getTime()).toBe(now.getTime() + 19 * DAY_MS)
  })

  it('starts from now when there is no bonus, or when the old one has lapsed', () => {
    expect(new Date(extendBonus(null, 14, now)).getTime()).toBe(now.getTime() + 14 * DAY_MS)
    const lapsed = new Date(now.getTime() - 30 * DAY_MS).toISOString()
    expect(new Date(extendBonus(lapsed, 14, now)).getTime()).toBe(now.getTime() + 14 * DAY_MS)
  })
})
