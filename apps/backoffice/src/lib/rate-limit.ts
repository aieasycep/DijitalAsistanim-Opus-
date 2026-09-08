import 'server-only'

import { AppError } from '@da/domain'
import { adminRpc, SIGN_IN_RATE_LIMIT } from './auth.ts'
import { clientIpFromHeaders, sha256Hex } from './session-cookies.ts'

/**
 * Rate limiting for the console.
 *
 * ---------------------------------------------------------------------------
 * WHY THE COUNTER LIVES IN POSTGRES
 * ---------------------------------------------------------------------------
 *
 * The obvious implementation — a `Map` in the module scope — is wrong twice
 * over on a serverless deployment: every instance keeps its own count, so the
 * effective limit is the configured one multiplied by the number of warm
 * lambdas, and every cold start resets it to zero. `admin_enforce_rate_limit()`
 * increments and compares in a single `insert … on conflict do update …
 * returning`, so two concurrent attempts cannot both read *n* and both write
 * *n + 1*, and the count survives the instance that produced it.
 *
 * ---------------------------------------------------------------------------
 * THE SUBJECT IS ALWAYS A HASH
 * ---------------------------------------------------------------------------
 *
 * `admin_rate_limits.subject_key` is constrained to 64 lowercase hex
 * characters. That constraint is the reason an address or an IP cannot end up
 * in this table in the clear: a bug that passed the raw value would be refused
 * by Postgres rather than quietly building a log of who tried to sign in from
 * where. Every function here hashes before it writes.
 *
 * ---------------------------------------------------------------------------
 * WHAT A LIMIT IS FOR
 * ---------------------------------------------------------------------------
 *
 * Not throughput. Each of these caps an action whose *abuse* is the risk:
 * grinding a password, walking a user list through the export endpoint, or
 * spending a Support Access grant on one record after another to sweep a
 * mailbox. The numbers are set where a person working normally will never meet
 * them and a script meets them immediately.
 */

export interface RateLimitRule {
  /** Dotted lower-snake, matching `admin_rate_limits_scope_shape`. */
  readonly scope: string
  /** Attempts allowed inside one window. */
  readonly limit: number
  /** Window length. Fixed windows, not sliding — see the note above. */
  readonly windowSeconds: number
}

const MINUTE = 60
const HOUR = 60 * 60

/**
 * Every limited action in the console.
 *
 * `signIn` is not defined here: `signInAdmin()` enforces it itself so a sign-in
 * cannot be assembled that skips the limiter, and this table re-exports the
 * same object so the console still has one number in one place to render.
 */
export const RATE_LIMITS = Object.freeze({
  /** Password attempts, per address and per client address. */
  signIn: SIGN_IN_RATE_LIMIT,

  /**
   * Support Access requests per admin. A support engineer opens a handful of
   * these on a bad day; twenty in an hour is somebody enumerating accounts.
   */
  supportAccessRequest: Object.freeze({
    scope: 'support_access.request',
    limit: 20,
    windowSeconds: HOUR,
  }),

  /**
   * Individual reveals per grant. The grant is already scoped, approved and
   * time-limited — this is what stops one legitimate grant being used to walk
   * an entire mailbox message by message inside its window.
   */
  supportAccessReveal: Object.freeze({
    scope: 'support_access.reveal',
    limit: 60,
    windowSeconds: HOUR,
  }),

  /** Export generation, which is expensive and produces a file to look after. */
  export: Object.freeze({ scope: 'admin.export', limit: 10, windowSeconds: HOUR }),

  /**
   * Destructive writes per admin: disabling accounts, disconnecting
   * integrations, granting entitlements. A person cannot type a reason for
   * thirty of these in five minutes.
   */
  destructive: Object.freeze({ scope: 'admin.destructive', limit: 30, windowSeconds: 5 * MINUTE }),
} as const) satisfies Readonly<Record<string, RateLimitRule>>

export type RateLimitName = keyof typeof RATE_LIMITS

export interface RateLimitVerdict {
  readonly allowed: boolean
  readonly rule: RateLimitRule
  /** How long to wait before the window rolls over, worst case. */
  readonly retryAfterSeconds: number
}

/**
 * Count this attempt and say whether it is within the limit.
 *
 * The attempt is counted either way — that is what makes the limiter work:
 * refusing to count refused attempts would let an attacker stay under the cap
 * forever by simply being wrong every time.
 *
 * `subject` is whatever identifies the caller for this rule: an admin id, an
 * address, an IP, a grant id. It is hashed here and never leaves in the clear.
 */
export async function enforceRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitVerdict> {
  const allowed = await adminRpc('admin_enforce_rate_limit', {
    p_scope: rule.scope,
    p_subject_key: await sha256Hex(subject),
    p_limit: rule.limit,
    p_window: `${rule.windowSeconds} seconds`,
  })
  return { allowed, rule, retryAfterSeconds: rule.windowSeconds }
}

/**
 * `enforceRateLimit`, but it throws.
 *
 * The thrown error is `rate_limited`, which `@da/domain` already marks
 * retryable and which the console renders as a real Turkish message with the
 * wait in it — not a generic 500 and not a silent no-op.
 */
export async function assertRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const verdict = await enforceRateLimit(rule, subject)
  if (verdict.allowed) return
  throw new AppError('rate_limited', {
    status: 429,
    detail: `${rule.scope} exceeded ${rule.limit}/${rule.windowSeconds}s`,
    values: { limit: rule.limit, minutes: Math.ceil(rule.windowSeconds / 60) },
  })
}

/**
 * A bucket key for the calling client, from the proxy headers.
 *
 * Returns `ip:<address>` when one is present and `ip:unknown` when it is not.
 * The fallback is deliberately a single shared bucket rather than "no limit":
 * a deployment behind a proxy that strips the header should throttle in
 * aggregate, not stop throttling.
 */
export function requestBucket(requestHeaders: Headers): string {
  const ip = clientIpFromHeaders(requestHeaders)
  return `ip:${ip ?? 'unknown'}`
}

/** `admin:<id>` — the bucket for an action attributed to a named operator. */
export function adminBucket(adminUserId: string): string {
  return `admin:${adminUserId}`
}

/** `grant:<id>` — the bucket for reveals spent against one Support Access grant. */
export function grantBucket(grantId: string): string {
  return `grant:${grantId}`
}
