import type { Subscription } from '@da/domain'
import { subscriptionRefreshRequest, subscriptionRefreshResponse } from '@da/validation'
import { parseRequest } from '../http'
import { mapSubscription } from '../mappers'
import type { EndpointContext, SubscriptionRow } from '../types'

/**
 * A row the function already selected and RLS already scoped. The contract pins
 * the envelope — here, the fact that the row may be absent — and the mapper is
 * what narrows the row itself into a domain entity.
 */
function asRow<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

export interface SubscriptionApi {
  get(): Promise<Subscription | null>
  /**
   * Re-reads entitlements from the store after a purchase or a restore.
   *
   * `null` is an ordinary answer, not a failure: an account that has never
   * subscribed has no subscription record, and that is exactly the account that
   * taps "restore purchases". This used to be typed and parsed as non-null, so
   * the call threw for every Free user and the screen reported a failure the
   * server had not had.
   */
  refresh(): Promise<Subscription | null>
}

export function createSubscriptionApi(ctx: EndpointContext): SubscriptionApi {
  return {
    async get() {
      const row = await ctx.db.selectOne<SubscriptionRow>('subscriptions')
      return row ? mapSubscription(row) : null
    },

    async refresh() {
      // Nothing to send: the bearer token names the account, and the account is
      // also the RevenueCat customer the function looks up.
      const request = parseRequest(subscriptionRefreshRequest, {})
      const result = await ctx.http.callFunction(
        'subscription-refresh',
        request,
        subscriptionRefreshResponse,
        { retry: false },
      )
      return result.subscription
        ? mapSubscription(asRow<SubscriptionRow>(result.subscription))
        : null
    },
  }
}
