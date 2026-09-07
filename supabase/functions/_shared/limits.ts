import {
  AppError,
  SUBSCRIPTION_STATUSES,
  type Entitlements,
  type Feature,
  type SubscriptionStatus,
  checkLimit,
  hasFeature,
  resolveEntitlements,
} from './domain.ts'
import { dbError, serviceClient } from './db.ts'

/**
 * Rate limiting and entitlement enforcement.
 *
 * Both live server-side because both are load-bearing: the client's copy of
 * "you are Pro" is a rendering hint, and the client's copy of "you have used
 * 8 of 10 questions" is a courtesy. Neither is trusted here.
 */

export interface RateLimitRule {
  bucket: string
  limit: number
  windowSeconds: number
}

export const RATE_LIMITS = {
  assistant: { bucket: 'assistant', limit: 60, windowSeconds: 3600 },
  captureUpload: { bucket: 'capture_upload', limit: 30, windowSeconds: 3600 },
  captureAnalyze: { bucket: 'capture_analyze', limit: 60, windowSeconds: 86_400 },
  oauthStart: { bucket: 'oauth_start', limit: 20, windowSeconds: 3600 },
  syncTrigger: { bucket: 'sync_trigger', limit: 30, windowSeconds: 3600 },
  briefingGenerate: { bucket: 'briefing_generate', limit: 12, windowSeconds: 86_400 },
  replyDraft: { bucket: 'reply_draft', limit: 60, windowSeconds: 3600 },
  referralRedeem: { bucket: 'referral_redeem', limit: 5, windowSeconds: 86_400 },
  dataExport: { bucket: 'data_export', limit: 3, windowSeconds: 86_400 },
  transcribe: { bucket: 'transcribe', limit: 100, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitName = keyof typeof RATE_LIMITS

/**
 * Consume one unit from a fixed window.
 *
 * A fixed window rather than a sliding one: the point is to bound cost and
 * abuse, and a fixed window costs one upsert instead of a scan. The
 * `enforce_rate_limit` SQL function does the increment atomically so two
 * concurrent requests cannot both see the same pre-increment count.
 */
export async function consumeRateLimit(userId: string, name: RateLimitName): Promise<void> {
  const rule = RATE_LIMITS[name]
  const { data, error } = await serviceClient().rpc('enforce_rate_limit', {
    p_user_id: userId,
    p_bucket: rule.bucket,
    p_limit: rule.limit,
    p_window: `${rule.windowSeconds} seconds`,
  })

  if (error) throw dbError(error)
  if (data === false) {
    throw new AppError('rate_limited', {
      detail: `bucket:${rule.bucket}`,
      values: { limit: rule.limit, minutes: Math.round(rule.windowSeconds / 60) },
    })
  }
}

// ── Entitlements ─────────────────────────────────────────────────────────────

export async function loadEntitlements(userId: string, now: Date): Promise<Entitlements> {
  const client = serviceClient()

  const [subscription, credits] = await Promise.all([
    client
      .from('subscriptions')
      .select('status, entitlement')
      .eq('user_id', userId)
      .maybeSingle(),
    client
      .from('referral_credits')
      .select('expires_at')
      .or(`referrer_user_id.eq.${userId},referee_user_id.eq.${userId}`)
      .is('revoked_at', null)
      .order('expires_at', { ascending: false })
      .limit(1),
  ])

  if (subscription.error) throw dbError(subscription.error)

  const bonusExpiry = (credits.data?.[0]?.expires_at as string | undefined) ?? null

  // The column is a Postgres enum, so any value it can hold is a valid
  // `SubscriptionStatus`; a row that is missing entirely means Free.
  const rawStatus = subscription.data?.status
  const status: SubscriptionStatus = SUBSCRIPTION_STATUSES.includes(rawStatus as SubscriptionStatus)
    ? (rawStatus as SubscriptionStatus)
    : 'free'

  return resolveEntitlements({
    subscriptionStatus: status,
    activeEntitlement: (subscription.data?.entitlement as string | null) ?? null,
    referralBonusExpiresAt: bonusExpiry,
    now,
  })
}

/** Throw `entitlement_required` unless the plan includes `feature`. */
export function requireFeature(entitlements: Entitlements, feature: Feature): void {
  if (!hasFeature(entitlements, feature)) {
    throw new AppError('entitlement_required', { detail: `feature:${feature}` })
  }
}

/**
 * Enforce a countable plan limit, e.g. "one mail account on Free".
 * `used` is counted by the caller from the database, never taken from the client.
 */
export function requireWithinLimit(
  entitlements: Entitlements,
  key: Parameters<typeof checkLimit>[1],
  used: number,
): void {
  const check = checkLimit(entitlements, key, used)
  if (!check.allowed) {
    throw new AppError('plan_limit_reached', {
      detail: `limit:${String(key)}`,
      values: { limit: check.limit ?? 0, used: check.used },
    })
  }
}

/**
 * The daily AI budget a user may consume, on top of the per-endpoint rate
 * limits. Free users get a small allowance so the product is usable; Pro is
 * fair-use with a ceiling high enough that no honest user reaches it.
 */
export async function checkAiBudget(
  userId: string,
  entitlements: Entitlements,
  now: Date,
): Promise<void> {
  const dailyCap = entitlements.plan === 'pro' ? 400 : 60
  const since = new Date(now.getTime() - 86_400_000).toISOString()

  const { count, error } = await serviceClient()
    .from('ai_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('occurred_at', since)

  if (error) throw dbError(error)
  if ((count ?? 0) >= dailyCap) {
    throw new AppError('ai_quota_exceeded', {
      detail: `daily_cap:${dailyCap}`,
      values: { limit: dailyCap },
    })
  }
}
