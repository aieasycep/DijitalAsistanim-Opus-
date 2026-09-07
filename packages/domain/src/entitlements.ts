import { type IsoInstant } from './clock.ts'
import type { SubscriptionStatus } from './enums.ts'

/**
 * Entitlement resolution lives here and nowhere else. UI components ask
 * `hasFeature(entitlements, 'meeting_prep')`; they never re-derive plan logic
 * from a subscription status, so there is exactly one definition of Pro.
 */

export const FEATURES = [
  'multiple_mail_accounts',
  'multiple_calendars',
  'midday_pulse',
  'evening_close',
  'weekly_review',
  'meeting_prep',
  'smart_follow_up',
  'voice_briefing',
  'ai_memory',
  'vip_people',
  'advanced_planning',
  'android_notification_intelligence',
  'advanced_capture',
  'unlimited_assistant',
] as const
export type Feature = (typeof FEATURES)[number]

export type Plan = 'free' | 'pro'

/** Quantitative caps. `null` means fair-use rather than unlimited-unmetered. */
export interface PlanLimits {
  mailAccounts: number
  calendarAccounts: number
  /** Assistant questions per rolling day. `null` = fair use. */
  assistantQueriesPerDay: number | null
  /** Captures analysed per rolling day. */
  capturesPerDay: number | null
  /** Emails put through the expensive AI stage per day. */
  aiClassifiedEmailsPerDay: number | null
  priorityRules: number
  vipPeople: number
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    mailAccounts: 1,
    calendarAccounts: 1,
    assistantQueriesPerDay: 10,
    capturesPerDay: 5,
    aiClassifiedEmailsPerDay: 40,
    priorityRules: 5,
    vipPeople: 3,
  },
  pro: {
    mailAccounts: 5,
    calendarAccounts: 5,
    assistantQueriesPerDay: null,
    capturesPerDay: null,
    aiClassifiedEmailsPerDay: null,
    priorityRules: 100,
    vipPeople: 100,
  },
}

const PRO_ONLY: ReadonlySet<Feature> = new Set(FEATURES)

/** Everything the free tier gets: Today, morning briefing, basic mail triage. */
const FREE_FEATURES: ReadonlySet<Feature> = new Set<Feature>([])

export interface EntitlementInput {
  subscriptionStatus: SubscriptionStatus
  /** RevenueCat entitlement id currently active, if any. */
  activeEntitlement: string | null
  /** Latest expiry among non-revoked referral bonuses. */
  referralBonusExpiresAt: IsoInstant | null
  now: Date
}

export interface Entitlements {
  plan: Plan
  limits: PlanLimits
  /** Why the user has Pro — drives the "bonus expires in N days" banner. */
  source: 'subscription' | 'trial' | 'referral_bonus' | 'none'
  /** For trials and referral bonuses. */
  expiresAt: IsoInstant | null
  isTrial: boolean
}

export const PRO_ENTITLEMENT_ID = 'pro'

/**
 * A user is Pro when RevenueCat reports the `pro` entitlement active *or* an
 * unexpired referral bonus covers them. Referral bonus is checked second so
 * a real subscription always wins as the reported source.
 */
export function resolveEntitlements(input: EntitlementInput): Entitlements {
  const subscriptionActive =
    input.activeEntitlement === PRO_ENTITLEMENT_ID &&
    (input.subscriptionStatus === 'active' ||
      input.subscriptionStatus === 'trialing' ||
      input.subscriptionStatus === 'grace_period')

  if (subscriptionActive) {
    const isTrial = input.subscriptionStatus === 'trialing'
    return {
      plan: 'pro',
      limits: PLAN_LIMITS.pro,
      source: isTrial ? 'trial' : 'subscription',
      expiresAt: null,
      isTrial,
    }
  }

  if (input.referralBonusExpiresAt) {
    const expiry = new Date(input.referralBonusExpiresAt)
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() > input.now.getTime()) {
      return {
        plan: 'pro',
        limits: PLAN_LIMITS.pro,
        source: 'referral_bonus',
        expiresAt: input.referralBonusExpiresAt,
        isTrial: false,
      }
    }
  }

  return {
    plan: 'free',
    limits: PLAN_LIMITS.free,
    source: 'none',
    expiresAt: null,
    isTrial: false,
  }
}

export function hasFeature(entitlements: Entitlements, feature: Feature): boolean {
  if (entitlements.plan === 'pro') return PRO_ONLY.has(feature)
  return FREE_FEATURES.has(feature)
}

export interface LimitCheck {
  allowed: boolean
  limit: number | null
  used: number
  remaining: number | null
}

export function checkLimit(
  entitlements: Entitlements,
  key: keyof PlanLimits,
  used: number,
): LimitCheck {
  const limit = entitlements.limits[key]
  if (limit === null) return { allowed: true, limit: null, used, remaining: null }
  return {
    allowed: used < limit,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  }
}

/** Free-tier products, so the paywall copy and the store SKUs agree. */
export const PRODUCT_IDS = {
  monthly: 'da_pro_monthly',
  annual: 'da_pro_annual',
} as const

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS]

/**
 * Prices shown before RevenueCat has loaded, or when no store product is
 * configured. Localised strings live in the i18n bundle; these are the
 * numeric fallbacks named in the product brief.
 */
export const FALLBACK_PRICING = {
  monthly: { amount: 199, currency: 'TRY', period: 'month' },
  annual: { amount: 1490, currency: 'TRY', period: 'year' },
} as const

/** The bonus a successful referral grants each side. */
export const REFERRAL_BONUS_DAYS = 14
