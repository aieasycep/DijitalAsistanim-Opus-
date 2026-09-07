import { PRO_ENTITLEMENT_ID, systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { fetchWithLimits, jsonResponse, serveFunction } from '../_shared/http.ts'
import { loadEntitlements } from '../_shared/limits.ts'

/**
 * Re-read entitlement state.
 *
 * RevenueCat's webhook is the normal path; this exists for the case the webhook
 * is not configured or was missed, so a user who has just paid is never left
 * looking at a paywall. Without a RevenueCat secret it simply reports what the
 * database already knows — referral bonuses keep working either way.
 */
serveFunction('subscription-refresh', async ({ request, origin }) => {
  const user = await requireUser(request)
  const now = systemClock.now()
  const client = serviceClient()
  const secret = Deno.env.get('REVENUECAT_SECRET_KEY')?.trim()

  if (secret) {
    try {
      const { response, body } = await fetchWithLimits(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
        { headers: { authorization: `Bearer ${secret}`, accept: 'application/json' } },
        { timeoutMs: 10_000, errorCode: 'subscription_error' },
      )

      if (response.ok) {
        const parsed = JSON.parse(body) as {
          subscriber?: {
            entitlements?: Record<
              string,
              { expires_date?: string | null; product_identifier?: string }
            >
            original_app_user_id?: string
          }
        }
        const entitlement = parsed.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID]
        const expiresAt = entitlement?.expires_date ?? null
        const active = Boolean(entitlement) && (!expiresAt || new Date(expiresAt) > now)

        await client.from('subscriptions').upsert(
          {
            user_id: user.id,
            status: active ? 'active' : 'expired',
            entitlement: active ? PRO_ENTITLEMENT_ID : null,
            product_id: entitlement?.product_identifier ?? null,
            current_period_end: expiresAt,
            revenuecat_customer_id: parsed.subscriber?.original_app_user_id ?? user.id,
          },
          { onConflict: 'user_id' },
        )
      }
    } catch {
      // A billing-provider outage must not block the app; the stored state is
      // still the source of truth for entitlement resolution.
    }
  }

  const [subscription, entitlements] = await Promise.all([
    client.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
    loadEntitlements(user.id, now),
  ])
  if (subscription.error) throw dbError(subscription.error)

  const credits = await client
    .from('referral_credits')
    .select('expires_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)

  return jsonResponse(
    {
      subscription: subscription.data,
      entitlements,
      referralBonusExpiresAt: credits.data?.[0]?.expires_at ?? null,
    },
    200,
    origin,
  )
})
