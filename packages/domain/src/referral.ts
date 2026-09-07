import { DAY_MS, type IsoInstant } from './clock.ts'
import { REFERRAL_BONUS_DAYS } from './entitlements.ts'

/**
 * Referral rules. Both the redeem endpoint and the client's optimistic UI
 * evaluate the same predicate, so the app never celebrates a bonus the
 * backend is about to refuse.
 */

/** Unambiguous alphabet: no O/0, I/1, L, U (which reads as V in some fonts). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
export const REFERRAL_CODE_LENGTH = 8

export function isValidReferralCode(code: string): boolean {
  if (code.length !== REFERRAL_CODE_LENGTH) return false
  return [...code.toUpperCase()].every((c) => CODE_ALPHABET.includes(c))
}

export function normalizeReferralCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Derive a code from bytes supplied by the caller (`crypto.getRandomValues`
 * server-side). Keeping randomness out of this module leaves it pure and
 * testable.
 */
export function referralCodeFromBytes(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    const b = bytes[i] ?? 0
    out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  }
  return out
}

export type ReferralRejection =
  | 'invalid_code'
  | 'unknown_code'
  | 'self_referral'
  | 'already_redeemed'
  | 'referee_not_new'
  | 'referrer_limit_reached'

export interface ReferralRedeemInput {
  code: string
  referrerUserId: string | null
  refereeUserId: string
  /** Every code this referee has already redeemed. */
  refereePriorRedemptions: number
  /** Successful redemptions the referrer already has. */
  referrerRedemptionCount: number
  /** When the referee's account was created. */
  refereeCreatedAt: IsoInstant
  now: Date
}

/** A referee must redeem within their first week; older accounts are not "new". */
export const REFEREE_ELIGIBILITY_DAYS = 7
/** Ceiling per referrer, to bound the cost of a viral loop. */
export const MAX_REDEMPTIONS_PER_REFERRER = 25

export type ReferralDecision =
  { ok: true; bonusDays: number; expiresAt: IsoInstant } | { ok: false; reason: ReferralRejection }

export function evaluateReferralRedemption(input: ReferralRedeemInput): ReferralDecision {
  const code = normalizeReferralCode(input.code)
  if (!isValidReferralCode(code)) return { ok: false, reason: 'invalid_code' }
  if (!input.referrerUserId) return { ok: false, reason: 'unknown_code' }
  if (input.referrerUserId === input.refereeUserId) return { ok: false, reason: 'self_referral' }
  if (input.refereePriorRedemptions > 0) return { ok: false, reason: 'already_redeemed' }

  const created = new Date(input.refereeCreatedAt).getTime()
  if (
    Number.isFinite(created) &&
    input.now.getTime() - created > REFEREE_ELIGIBILITY_DAYS * DAY_MS
  ) {
    return { ok: false, reason: 'referee_not_new' }
  }

  if (input.referrerRedemptionCount >= MAX_REDEMPTIONS_PER_REFERRER) {
    return { ok: false, reason: 'referrer_limit_reached' }
  }

  return {
    ok: true,
    bonusDays: REFERRAL_BONUS_DAYS,
    expiresAt: new Date(input.now.getTime() + REFERRAL_BONUS_DAYS * DAY_MS).toISOString(),
  }
}

/**
 * Stack bonuses by extending from the later of "now" and the current expiry,
 * so a second referral adds fourteen days rather than resetting the clock.
 */
export function extendBonus(
  currentExpiry: IsoInstant | null,
  bonusDays: number,
  now: Date,
): IsoInstant {
  const base = currentExpiry ? new Date(currentExpiry).getTime() : 0
  const from = Math.max(base, now.getTime())
  return new Date(from + bonusDays * DAY_MS).toISOString()
}
