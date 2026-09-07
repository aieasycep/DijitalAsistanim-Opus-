/**
 * Referral constants used by the marketing site.
 *
 * The site is deliberately dependency-free of the app packages — it is built
 * and deployed on its own — so the one number it needs is restated here with a
 * pointer to the source of truth. It is asserted against the domain package by
 * `packages/domain/src/referral.test.ts`, so the two cannot drift silently.
 *
 * Source: `REFERRAL_BONUS_DAYS` in packages/domain/src/entitlements.ts
 */
export const REFERRAL_BONUS_DAYS = 14
