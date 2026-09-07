import {
  type Entitlements,
  type Feature,
  PLAN_LIMITS,
  hasFeature,
  resolveEntitlements,
  systemClock,
} from '@da/domain'
import { useRouter } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { track } from '../lib/analytics'
import { useSubscription } from './queries'

/**
 * Entitlement access for the UI.
 *
 * The resolution itself lives in `@da/domain` and is re-run server-side on
 * every write, so this hook is purely a rendering concern: it decides what to
 * show, never what is allowed.
 */
export function useEntitlements(): {
  entitlements: Entitlements
  isLoading: boolean
  can: (feature: Feature) => boolean
} {
  const { data, isLoading } = useSubscription()

  const entitlements = useMemo<Entitlements>(() => {
    if (!data) {
      // Assume Free until the real answer arrives. Optimistically showing Pro
      // and then taking it away is a far worse experience than the reverse.
      return { plan: 'free', limits: PLAN_LIMITS.free, source: 'none', expiresAt: null, isTrial: false }
    }
    return resolveEntitlements({
      subscriptionStatus: data.status,
      activeEntitlement: data.entitlement,
      referralBonusExpiresAt: data.referralBonusExpiresAt ?? null,
      now: systemClock.now(),
    })
  }, [data])

  const can = useCallback(
    (feature: Feature) => hasFeature(entitlements, feature),
    [entitlements],
  )

  return { entitlements, isLoading, can }
}

/**
 * Gate an action behind a feature.
 *
 * Returns a wrapper that either runs the action or routes to the paywall with
 * the feature recorded as the source. A gated control stays visible and
 * tappable — the product's rule is that the free path is never hidden, so a Pro
 * feature explains itself rather than disappearing.
 */
export function useFeatureGate(): (feature: Feature, action: () => void) => () => void {
  const { can } = useEntitlements()
  const router = useRouter()

  return useCallback(
    (feature: Feature, action: () => void) => () => {
      if (can(feature)) {
        action()
        return
      }
      track('paywall_viewed')
      router.push(`/paywall?source=${encodeURIComponent(feature)}`)
    },
    [can, router],
  )
}
