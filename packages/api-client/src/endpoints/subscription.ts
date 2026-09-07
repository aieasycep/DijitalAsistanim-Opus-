import type { Subscription } from '@da/domain'
import { z } from 'zod'
import { rowOf } from '../http'
import { mapSubscription } from '../mappers'
import type { EndpointContext, SubscriptionRow } from '../types'

const subscriptionEnvelopeSchema = z.object({ subscription: rowOf<SubscriptionRow>() })

export interface SubscriptionApi {
  get(): Promise<Subscription | null>
  /** Re-reads entitlements from the store after a purchase or restore. */
  refresh(input?: { revenueCatCustomerId?: string }): Promise<Subscription>
}

export function createSubscriptionApi(ctx: EndpointContext): SubscriptionApi {
  return {
    async get() {
      const row = await ctx.db.selectOne<SubscriptionRow>('subscriptions')
      return row ? mapSubscription(row) : null
    },

    async refresh(input = {}) {
      const result = await ctx.http.callFunction(
        'subscription-refresh',
        { revenueCatCustomerId: input.revenueCatCustomerId ?? null },
        subscriptionEnvelopeSchema,
        { retry: false },
      )
      return mapSubscription(result.subscription)
    },
  }
}
