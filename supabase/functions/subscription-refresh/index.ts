import { subscriptionRefreshRequest, type SubscriptionRefreshResponse } from '@da/validation'
import { PRO_ENTITLEMENT_ID, systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { fetchWithLimits, jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Re-read entitlement state.
 *
 * RevenueCat's webhook is the normal path; this exists for the case the webhook
 * is not configured or was missed, so a user who has just paid is never left
 * looking at a paywall. Without a RevenueCat secret it simply reports what the
 * database already knows — referral bonuses keep working either way.
 *
 * The subscriber is looked up by the caller's own id, which is also the id the
 * app configures the RevenueCat SDK with, so a purchase and the account that
 * made it are the same customer on both sides. Nothing about the customer is
 * taken from the request: a client that could name the RevenueCat customer
 * could name someone else's subscription.
 */

/** What the store says about the `pro` entitlement, once. */
interface RemoteEntitlement {
  active: boolean
  productId: string | null
  expiresAt: string | null
  customerId: string
}

interface SubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }>
    original_app_user_id?: string
  }
}

/**
 * Ask RevenueCat about one subscriber.
 *
 * A billing-provider outage must not block the app, so every failure here —
 * network, timeout, a non-200, a body that is not the shape we expect — answers
 * `null` and leaves the stored state as the source of truth. A database failure
 * is a different matter and is deliberately raised outside this function.
 */
async function readRemoteEntitlement(
  userId: string,
  secret: string,
  now: Date,
): Promise<RemoteEntitlement | null> {
  try {
    const { response, body } = await fetchWithLimits(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      { headers: { authorization: `Bearer ${secret}`, accept: 'application/json' } },
      { timeoutMs: 10_000, errorCode: 'subscription_error' },
    )
    if (!response.ok) return null

    const parsed = JSON.parse(body) as SubscriberResponse
    const entitlement = parsed.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID]
    const expiresAt = entitlement?.expires_date ?? null

    return {
      active: Boolean(entitlement) && (!expiresAt || new Date(expiresAt) > now),
      productId: entitlement?.product_identifier ?? null,
      expiresAt,
      customerId: parsed.subscriber?.original_app_user_id ?? userId,
    }
  } catch {
    return null
  }
}

serveFunction('subscription-refresh', async ({ request, origin }) => {
  const user = await requireUser(request)
  await parseBody(request, subscriptionRefreshRequest)

  const now = systemClock.now()
  const client = serviceClient()
  const secret = Deno.env.get('REVENUECAT_SECRET_KEY')?.trim()
  const remote = secret ? await readRemoteEntitlement(user.id, secret, now) : null

  if (remote) {
    // Raised rather than swallowed: a write that failed and reported success is
    // how a paying user ends up looking at a paywall with no way to complain.
    const stored = await client.from('subscriptions').upsert(
      {
        user_id: user.id,
        status: remote.active ? 'active' : 'expired',
        entitlement: remote.active ? PRO_ENTITLEMENT_ID : null,
        product_id: remote.productId,
        current_period_end: remote.expiresAt,
        revenuecat_customer_id: remote.customerId,
      },
      { onConflict: 'user_id' },
    )
    if (stored.error) throw dbError(stored.error)
  }

  const subscription = await client
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (subscription.error) throw dbError(subscription.error)

  // `null` is the ordinary answer for a Free account, not a failure: the client
  // parses this field as nullable and the screens have a sentence for it.
  const payload: SubscriptionRefreshResponse = { subscription: subscription.data }

  return jsonResponse(payload, 200, origin)
})
