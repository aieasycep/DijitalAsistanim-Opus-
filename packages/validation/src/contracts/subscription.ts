import { SUBSCRIPTION_STATUSES } from '@da/domain'
import { z } from 'zod'
import { revenueCatWebhookSchema } from '../api-schemas.ts'
import { rowSchema } from './common.ts'

/**
 * The `subscription` group — `subscription-refresh` and `revenuecat-webhook`.
 *
 * Four decisions here, and the first one is the bug this file was written for:
 *
 *  1. **Having no subscription is the normal case.** Every Free account has no
 *     `subscriptions` row at all, and a first purchase only creates one once
 *     RevenueCat has been heard from. The client parsed this field as a
 *     *required* record, so `refresh()` threw `ai_invalid_output` for precisely
 *     those users: "restore purchases" on an account with nothing to restore
 *     told the person it had failed, while the server had answered correctly
 *     and the screen had a perfectly good sentence ready for the real answer.
 *     `.nullable()` here, and `Subscription | null` on the client, is the fix.
 *
 *  2. **Refreshing asks nothing; the JWT says who is asking.** The client used
 *     to send `revenueCatCustomerId` and the function never read it — it looked
 *     the subscriber up by the caller's own id. Teaching the function to read
 *     the field would have been worse than ignoring it: a client-chosen
 *     RevenueCat customer id is a client-chosen subscription, so anyone could
 *     have claimed anyone else's Pro. The app now configures RevenueCat with
 *     the Supabase user id (`apps/mobile/src/lib/purchases.ts`), which makes
 *     the RevenueCat customer *be* the caller, so there is nothing left to say.
 *
 *  3. **The envelope carries no second copy of the entitlements.** The function
 *     used to compute and return `entitlements` and `referralBonusExpiresAt`
 *     alongside the row, and nothing ever read either. `resolveEntitlements` in
 *     `@da/domain` is the single place a plan is decided and both sides already
 *     run it over the same records; shipping a separately computed copy next to
 *     the row it was derived from is how two halves that each type-check start
 *     disagreeing — which is the entire reason this directory exists.
 *
 *  4. **The webhook answers a machine, so it answers precisely.** RevenueCat
 *     retries any non-2xx forever, so "I will not act on this" has to be a 200
 *     that says why. The response is a discriminated union on `handled`: a
 *     refusal always names its reason, and an acceptance names the status it
 *     stored — which is the one thing an operator wants from the delivery log
 *     when a billing event did not land the way they expected.
 */

/**
 * The stored subscription status, as the `subscription_status` Postgres enum
 * and `@da/domain` both spell it. Sourced from the domain constant so a status
 * added there cannot be silently absent from the wire.
 */
export const subscriptionStatus = z.enum(SUBSCRIPTION_STATUSES)

export type SubscriptionStatusValue = z.infer<typeof subscriptionStatus>

// ── subscription-refresh ────────────────────────────────────────────────────

/**
 * Nothing. Identity comes from the bearer token, and the RevenueCat customer
 * is that same identity — see decision 2 above.
 */
export const subscriptionRefreshRequest = z.object({})

export type SubscriptionRefreshRequest = z.infer<typeof subscriptionRefreshRequest>

/**
 * The stored subscription after the store has been re-read, or `null` when the
 * account has none.
 *
 * The row itself stays permissive — `mapSubscription` narrows it — because what
 * drifts is the envelope, and here the envelope is one nullable field that the
 * two sides used to disagree about.
 */
export const subscriptionRefreshResponse = z.object({
  subscription: rowSchema.nullable(),
})

export type SubscriptionRefreshResponse = z.infer<typeof subscriptionRefreshResponse>

// ── revenuecat-webhook ──────────────────────────────────────────────────────

/**
 * RevenueCat's own event envelope.
 *
 * An alias, not a copy: `api-schemas.ts` has always owned this schema and the
 * function already imports it. It is deliberately permissive about the event
 * `type` — RevenueCat adds event kinds we do not model, and the function
 * answers those with `unmapped_event` rather than rejecting the delivery.
 */
export const revenuecatWebhookRequest = revenueCatWebhookSchema

export type RevenuecatWebhookRequest = z.infer<typeof revenuecatWebhookRequest>

/**
 * Why a delivery was accepted but not acted on.
 *
 * `unmapped_event` is an event kind we do not model; `unknown_user` is a
 * purchase whose RevenueCat app user id is not one of our accounts, which can
 * only happen for a purchase made outside a signed-in session.
 */
export const REVENUECAT_SKIP_REASONS = ['unmapped_event', 'unknown_user'] as const

export const revenuecatSkipReason = z.enum(REVENUECAT_SKIP_REASONS)

export type RevenuecatSkipReason = z.infer<typeof revenuecatSkipReason>

export const revenuecatWebhookResponse = z.discriminatedUnion('handled', [
  z.object({ handled: z.literal(true), status: subscriptionStatus }),
  z.object({ handled: z.literal(false), reason: revenuecatSkipReason }),
])

export type RevenuecatWebhookResponse = z.infer<typeof revenuecatWebhookResponse>
