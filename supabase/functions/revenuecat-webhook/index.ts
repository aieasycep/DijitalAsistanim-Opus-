import { revenueCatWebhookSchema } from '@da/validation'
import { AppError, PRO_ENTITLEMENT_ID, type SubscriptionStatus } from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { serviceClient } from '../_shared/db.ts'
import { timingSafeEqual } from '../_shared/crypto.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/** RevenueCat event types mapped to the status the app stores. */
const STATUS_FOR_EVENT: Record<string, SubscriptionStatus> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  UNCANCELLATION: 'active',
  NON_RENEWING_PURCHASE: 'active',
  PRODUCT_CHANGE: 'active',
  TRIAL_STARTED: 'trialing',
  TRIAL_CONVERTED: 'active',
  // A cancellation only stops the renewal; access continues to the period end,
  // so the status stays active and `current_period_end` does the work.
  CANCELLATION: 'active',
  EXPIRATION: 'expired',
  BILLING_ISSUE: 'billing_issue',
  SUBSCRIPTION_PAUSED: 'grace_period',
}

/**
 * RevenueCat webhook.
 *
 * Authorisation is a shared header compared in constant time. Unknown event
 * types return 200 on purpose: RevenueCat retries non-2xx indefinitely, and an
 * event we do not model is not a failure.
 */
serveFunction('revenuecat-webhook', async ({ request, origin }) => {
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_HEADER')
  if (!expected) {
    throw new AppError('server_unavailable', { detail: 'webhook_secret_not_configured' })
  }
  if (!timingSafeEqual(request.headers.get('authorization') ?? '', expected)) {
    throw new AppError('forbidden', { detail: 'bad_webhook_auth' })
  }

  const body = await parseBody(request, revenueCatWebhookSchema)
  const event = body.event
  const status = STATUS_FOR_EVENT[event.type]

  if (!status) return jsonResponse({ handled: false, reason: 'unmapped_event' }, 200, origin)

  const client = serviceClient()
  const userId = event.app_user_id

  // The app user id is the Supabase user id; a mismatch means the purchase was
  // made under an anonymous id and cannot be attributed yet.
  const profile = await client.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (!profile.data) {
    return jsonResponse({ handled: false, reason: 'unknown_user' }, 200, origin)
  }

  const entitlementActive =
    status === 'active' || status === 'trialing' || status === 'grace_period'

  await client.from('subscriptions').upsert(
    {
      user_id: userId,
      status,
      entitlement: entitlementActive ? PRO_ENTITLEMENT_ID : null,
      product_id: event.product_id ?? null,
      store:
        event.store === 'APP_STORE'
          ? 'app_store'
          : event.store === 'PLAY_STORE'
            ? 'play_store'
            : event.store === 'PROMOTIONAL'
              ? 'promotional'
              : null,
      current_period_end: event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : null,
      trial_ends_at:
        status === 'trialing' && event.expiration_at_ms
          ? new Date(event.expiration_at_ms).toISOString()
          : null,
      revenuecat_customer_id: event.original_app_user_id ?? userId,
    },
    { onConflict: 'user_id' },
  )

  await audit({
    userId,
    action: 'subscription.updated',
    entityType: 'subscription',
    entityId: userId,
    metadata: { event: event.type, status },
  })

  return jsonResponse({ handled: true }, 200, origin)
})
