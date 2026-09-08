import { REFERRAL_CODE_LENGTH, type ReferralRejection } from '@da/domain'
import { z } from 'zod'
import { redeemReferralRequestSchema } from '../api-schemas.ts'
import { isoInstantSchema } from '../primitives.ts'

/**
 * The `referral` group — `referral-code` and `referral-redeem`.
 *
 * Three decisions are worth stating:
 *
 *  1. **The code is a string, never null.** `referral-code` mints one when the
 *     account predates the signup trigger, so by the time it answers there is
 *     always a code. The client used to soften that with `code ?? ''`, which
 *     turned a server that had failed to mint into a screen showing a blank
 *     display, a copy button that copied nothing and a share sheet offering an
 *     invite link with no code in it. Pinning the code here means that failure
 *     surfaces at the boundary instead of as a silently useless screen.
 *
 *  2. **A rejection is an answer, not an error.** Redeeming is a 200 either
 *     way: the server evaluated the rules and said yes or no. So the response
 *     is a discriminated union on `granted` — a grant always carries the days
 *     and the expiry, a refusal always carries the reason. The flat shape it
 *     replaces let `granted: false` travel with `reason: null`, which the
 *     screen had no sentence for, and it let the screen treat "the call
 *     succeeded" as "the bonus was granted" — so a self-referral or a second
 *     redemption was congratulated rather than explained.
 *
 *  3. **The reason is the domain's own vocabulary.** `evaluateReferralRedemption`
 *     in `@da/domain` decides, so its `ReferralRejection` is what crosses the
 *     wire. It is not the error-code vocabulary: `referral_self` is an
 *     `ErrorCode` with a message behind it, `self_referral` is the decision.
 *     The two had already been confused once.
 */

/**
 * A minted referral code.
 *
 * Eight uppercase alphanumerics — the shape `referrals_code_shape` enforces in
 * the database and `isValidReferralCode` enforces in the domain, so this can
 * only fail on a value that should never have been stored.
 */
const referralCodeValue = z
  .string()
  .length(REFERRAL_CODE_LENGTH)
  .regex(/^[A-Z0-9]+$/, 'A referral code is uppercase alphanumerics')

// ── referral-code ───────────────────────────────────────────────────────────

/** Nothing to ask: the caller's own code is the only one they can be given. */
export const referralCodeRequest = z.object({})

export type ReferralCodeRequest = z.infer<typeof referralCodeRequest>

/**
 * The caller's code and how their bonus currently stands.
 *
 * `activeBonuses` and `bonusExpiresAt` describe the same set of credits — the
 * unrevoked, unexpired rows applied to this account — so they travel together
 * and the expiry is null exactly when the count is zero.
 */
export const referralCodeResponse = z.object({
  code: referralCodeValue,
  /** Accepted redemptions of this code, as `referrals.redemption_count` holds it. */
  redemptionCount: z.number().int().min(0),
  activeBonuses: z.number().int().min(0),
  /** The latest expiry across those bonuses; null when none is running. */
  bonusExpiresAt: isoInstantSchema.nullable(),
})

export type ReferralCodeResponse = z.infer<typeof referralCodeResponse>

// ── referral-redeem ─────────────────────────────────────────────────────────

/**
 * The code the person typed, unnormalised.
 *
 * An alias, not a copy: `api-schemas.ts` has always owned this schema and both
 * sides already import it. It stays permissive because `normalizeReferralCode`
 * server-side is what strips spacing and punctuation before the code is
 * looked up — rejecting `ABCD-2345` at the client would refuse a code the
 * server would have accepted.
 */
export const referralRedeemRequest = redeemReferralRequestSchema

export type ReferralRedeemRequest = z.infer<typeof referralRedeemRequest>

/**
 * Why a redemption was refused.
 *
 * `satisfies` guards one direction: a value here that the domain does not know
 * is a compile error. The other direction is guarded where it matters — the
 * function assigns `decision.reason` into the annotated payload, so a reason
 * added to `ReferralRejection` and not added here fails `deno check`.
 */
export const REFERRAL_REJECTIONS = [
  'invalid_code',
  'unknown_code',
  'self_referral',
  'already_redeemed',
  'referee_not_new',
  'referrer_limit_reached',
] as const satisfies readonly ReferralRejection[]

export const referralRejection = z.enum(REFERRAL_REJECTIONS)

export type ReferralRejectionReason = z.infer<typeof referralRejection>

export const referralRedeemResponse = z.discriminatedUnion('granted', [
  z.object({
    granted: z.literal(true),
    /** What was actually granted — the screen says this, not its own constant. */
    bonusDays: z.number().int().min(1),
    expiresAt: isoInstantSchema,
    reason: z.null(),
  }),
  z.object({
    granted: z.literal(false),
    bonusDays: z.literal(0),
    expiresAt: z.null(),
    reason: referralRejection,
  }),
])

export type ReferralRedeemResponse = z.infer<typeof referralRedeemResponse>
