import { AppError } from '@da/domain'
import { Platform } from 'react-native'
import { env, integrations } from './env'
import { reportError } from './error-reporting'

/**
 * Subscriptions.
 *
 * RevenueCat is optional: the SDK is loaded through a guarded require so a
 * build without the native module — a fresh clone, a simulator, the demo
 * config — still runs, and the paywall shows an honest "not available here"
 * instead of crashing on import. Entitlements are always re-derived
 * server-side from the RevenueCat webhook; nothing the client reports is
 * trusted as proof of payment.
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
  customerId: string | null
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
  originalAppUserId?: string
}

interface RevenueCatModule {
  default: {
    configure(options: { apiKey: string }): void
    getOfferings(): Promise<{
      current: { availablePackages: RevenueCatPackage[] } | null
    }>
    purchasePackage(pkg: RevenueCatPackage): Promise<{ customerInfo: RevenueCatCustomerInfo }>
    restorePurchases(): Promise<RevenueCatCustomerInfo>
    getCustomerInfo(): Promise<RevenueCatCustomerInfo>
  }
}

let sdk: RevenueCatModule['default'] | null = null
let configured = false
let packageCache: RevenueCatPackage[] = []

function apiKey(): string | undefined {
  return Platform.OS === 'ios' ? env.revenueCatApiKeyIos : env.revenueCatApiKeyAndroid
}

/** True when this build can actually take a payment. */
export function purchasesAvailable(): boolean {
  return integrations.revenueCat && loadSdk() !== null
}

function loadSdk(): RevenueCatModule['default'] | null {
  if (sdk) return sdk
  try {
    // Resolved at runtime: the package is an optional native dependency, and a
    // static import would break every build that does not install it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('react-native-purchases') as RevenueCatModule
    sdk = module.default ?? (module as unknown as RevenueCatModule['default'])
    return sdk
  } catch {
    return null
  }
}

function ensureConfigured(): RevenueCatModule['default'] {
  const key = apiKey()
  const loaded = loadSdk()
  if (!key || !loaded) {
    throw new AppError('subscription_error', { detail: 'purchases are not configured' })
  }
  if (!configured) {
    loaded.configure({ apiKey: key })
    configured = true
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
  if (!purchasesAvailable()) return []
  try {
    const client = ensureConfigured()
    const offerings = await client.getOfferings()
    packageCache = offerings.current?.availablePackages ?? []
    return packageCache.map(toPackage)
  } catch (error) {
    reportError(error, { scope: 'purchases:loadPackages' })
    return []
  }
}

export async function purchase(packageId: string): Promise<PurchaseResult> {
  const client = ensureConfigured()
  const target = packageCache.find((pkg) => pkg.identifier === packageId)
  if (!target) throw new AppError('subscription_error', { detail: 'unknown package' })

  try {
    const result = await client.purchasePackage(target)
    return {
      isPro: Object.keys(result.customerInfo.entitlements.active).length > 0,
      customerId: result.customerInfo.originalAppUserId ?? null,
    }
  } catch (error) {
    const cancelled = (error as { userCancelled?: boolean }).userCancelled === true
    if (cancelled) throw new AppError('subscription_error', { detail: 'purchase cancelled' })
    throw new AppError('subscription_error', {
      detail: error instanceof Error ? error.message : 'purchase failed',
    })
  }
}

export async function restore(): Promise<PurchaseResult> {
  const client = ensureConfigured()
  const info = await client.restorePurchases()
  return {
    isPro: Object.keys(info.entitlements.active).length > 0,
    customerId: info.originalAppUserId ?? null,
  }
}
