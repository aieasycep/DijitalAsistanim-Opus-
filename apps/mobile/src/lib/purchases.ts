import { AppError } from '@da/domain'
import { formatMoney } from '@da/i18n'
import { NativeModules, Platform } from 'react-native'
import { useSessionStore } from '../stores/session'
import { env, integrations, isDemoMode } from './env'
import { reportError } from './error-reporting'

/**
 * Subscriptions.
 *
 * RevenueCat is a real dependency of the app, but the SDK is still loaded
 * through a guarded require: `react-native-purchases` is a native module, so a
 * JS-only context — Expo Go, a web preview, the test runner — has the package
 * on disk and no implementation behind it. The guard keeps those contexts
 * running and lets the paywall say "not available here" instead of crashing on
 * import.
 *
 * The require alone is not the whole guard. The package imports cleanly with no
 * native module behind it and falls back to a browser implementation that only
 * accepts web API keys, then throws on the first call — so availability is
 * decided by the native module the SDK itself binds to, not by whether the
 * import succeeded.
 *
 * The SDK is configured with the Supabase user id. That is not a detail: it is
 * what makes RevenueCat's `app_user_id` the account that paid, so the webhook
 * can attribute the purchase and `subscription-refresh` can look the subscriber
 * up. Configured anonymously — as this module used to — every purchase arrives
 * at the webhook under an id no account matches, and nobody ever becomes Pro.
 *
 * Entitlements are always re-derived server-side; nothing this module reports
 * is trusted as proof of payment. `isPro` here decides whether to dismiss the
 * paywall, nothing more.
 */

export interface StorePackage {
  /** RevenueCat package identifier. */
  id: string
  productId: string
  period: 'monthly' | 'annual'
  /** Already localised by the store, e.g. `₺149,99`. */
  priceString: string
  /** Price in the store's currency, for the per-month calculation. */
  price: number
  currencyCode: string
  /** Free-trial length in days when the product offers one. */
  trialDays: number | null
}

export interface PurchaseResult {
  /** True when the store reports an active entitlement after the purchase. */
  isPro: boolean
}

interface RevenueCatPackage {
  identifier: string
  packageType: string
  product: {
    identifier: string
    priceString: string
    price: number
    currencyCode: string
    introPrice?: { periodNumberOfUnits?: number; periodUnit?: string } | null
  }
}

interface RevenueCatCustomerInfo {
  entitlements: { active: Record<string, unknown> }
}

interface RevenueCatModule {
  default: {
    configure(options: { apiKey: string; appUserID: string }): void
    logIn(appUserID: string): Promise<{ customerInfo: RevenueCatCustomerInfo }>
    getOfferings(): Promise<{
      current: { availablePackages: RevenueCatPackage[] } | null
    }>
    purchasePackage(pkg: RevenueCatPackage): Promise<{ customerInfo: RevenueCatCustomerInfo }>
    restorePurchases(): Promise<RevenueCatCustomerInfo>
  }
}

/**
 * The offering demo mode sells.
 *
 * Demo mode has no store behind it, and a paywall that renders "not available
 * here" is a paywall nobody can look at, review or test — which is how the plan
 * cards came to be broken without anyone noticing. These are the same two plans
 * and prices the marketing copy quotes, formatted through the i18n money
 * formatter for the Turkish store front the demo account belongs to.
 */
const DEMO_PACKAGES: readonly StorePackage[] = [
  {
    id: 'demo:annual',
    productId: 'da_pro_annual',
    period: 'annual',
    priceString: formatMoney(1490, 'TRY', 'tr'),
    price: 1490,
    currencyCode: 'TRY',
    trialDays: 14,
  },
  {
    id: 'demo:monthly',
    productId: 'da_pro_monthly',
    period: 'monthly',
    priceString: formatMoney(199, 'TRY', 'tr'),
    price: 199,
    currencyCode: 'TRY',
    trialDays: null,
  },
]

let sdk: RevenueCatModule['default'] | null = null
/** The account the SDK is currently configured for, `null` before the first. */
let configuredUserId: string | null = null
let packageCache: RevenueCatPackage[] = []

function apiKey(): string | undefined {
  return Platform.OS === 'ios' ? env.revenueCatApiKeyIos : env.revenueCatApiKeyAndroid
}

/** True when this build can actually take a payment. */
export function purchasesAvailable(): boolean {
  if (isDemoMode()) return true
  return integrations.revenueCat && loadSdk() !== null
}

function loadSdk(): RevenueCatModule['default'] | null {
  if (sdk) return sdk
  // The same handle `react-native-purchases` binds to internally. Absent it,
  // every call the SDK exposes throws, so reporting the store as available
  // would leave the paywall's buy and restore buttons looking live and doing
  // nothing but raising.
  const nativeModule: unknown = NativeModules.RNPurchases
  if (nativeModule == null) return null
  try {
    // Resolved at runtime: the package is a native module, and a static import
    // would break every JS-only context that has no implementation behind it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('react-native-purchases') as RevenueCatModule
    sdk = module.default ?? (module as unknown as RevenueCatModule['default'])
    return sdk
  } catch {
    return null
  }
}

/**
 * The configured SDK, bound to the signed-in account.
 *
 * Re-binding matters as much as the first bind: the SDK keeps whichever user it
 * was given until it is told otherwise, so signing out and back in as someone
 * else inside one app session would otherwise attribute the next purchase to
 * the previous account — which needs support to undo.
 */
async function ensureConfigured(): Promise<RevenueCatModule['default']> {
  const key = apiKey()
  const loaded = loadSdk()
  if (!key || !loaded) {
    throw new AppError('subscription_error', { detail: 'purchases are not configured' })
  }

  const userId = useSessionStore.getState().userId
  if (!userId) {
    throw new AppError('unauthorized', { detail: 'purchases require a signed-in account' })
  }

  if (configuredUserId === null) {
    loaded.configure({ apiKey: key, appUserID: userId })
    configuredUserId = userId
  } else if (configuredUserId !== userId) {
    await loaded.logIn(userId)
    configuredUserId = userId
  }
  return loaded
}

function toPackage(pkg: RevenueCatPackage): StorePackage {
  const intro = pkg.product.introPrice
  const trialDays =
    intro && typeof intro.periodNumberOfUnits === 'number'
      ? intro.periodUnit === 'WEEK'
        ? intro.periodNumberOfUnits * 7
        : intro.periodUnit === 'MONTH'
          ? intro.periodNumberOfUnits * 30
          : intro.periodNumberOfUnits
      : null

  return {
    id: pkg.identifier,
    productId: pkg.product.identifier,
    period: pkg.packageType === 'ANNUAL' ? 'annual' : 'monthly',
    priceString: pkg.product.priceString,
    price: pkg.product.price,
    currencyCode: pkg.product.currencyCode,
    trialDays,
  }
}

export async function loadPackages(): Promise<StorePackage[]> {
  if (isDemoMode()) return [...DEMO_PACKAGES]
  if (!purchasesAvailable()) return []
  try {
    const client = await ensureConfigured()
    const offerings = await client.getOfferings()
    packageCache = offerings.current?.availablePackages ?? []
    return packageCache.map(toPackage)
  } catch (error) {
    reportError(error, { scope: 'purchases:loadPackages' })
    return []
  }
}

export async function purchase(packageId: string): Promise<PurchaseResult> {
  if (isDemoMode()) {
    if (!DEMO_PACKAGES.some((pkg) => pkg.id === packageId)) {
      throw new AppError('subscription_error', { detail: 'unknown package' })
    }
    return { isPro: true }
  }

  const client = await ensureConfigured()
  const target = packageCache.find((pkg) => pkg.identifier === packageId)
  if (!target) throw new AppError('subscription_error', { detail: 'unknown package' })

  try {
    const result = await client.purchasePackage(target)
    return { isPro: Object.keys(result.customerInfo.entitlements.active).length > 0 }
  } catch (error) {
    const cancelled = (error as { userCancelled?: boolean }).userCancelled === true
    if (cancelled) throw new AppError('subscription_error', { detail: 'purchase cancelled' })
    throw new AppError('subscription_error', {
      detail: error instanceof Error ? error.message : 'purchase failed',
    })
  }
}

export async function restore(): Promise<PurchaseResult> {
  // The demo store front holds no purchase for the demo account, so restoring
  // honestly finds nothing — which is the answer the screens have to be able to
  // show, and the one flow L exercises.
  if (isDemoMode()) return { isPro: false }

  const client = await ensureConfigured()
  const info = await client.restorePurchases()
  return { isPro: Object.keys(info.entitlements.active).length > 0 }
}
