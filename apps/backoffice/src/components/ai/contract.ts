/**
 * The wire contract between the AI routes, their forms and their Server Action.
 *
 * A `'use server'` module may export nothing but async functions, and a client
 * form cannot import from one without dragging the action's module graph — and
 * with it `@/lib/db` and the service-role key — across the client boundary. So
 * every name the two sides have to agree on lives here, in a plain module both
 * can import: route paths, query parameters, form field names, the tokens the
 * action reports back, and the two plan ceilings the ceiling page measures
 * against. Getting one of these strings wrong then fails to compile instead of
 * posting a field nobody reads.
 */

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Model spend: what the platform paid, per day, per model, per function. */
export const AI_PATH = '/ai'
/** Quality: whether the drafts and briefings the models produce are accepted. */
export const AI_QUALITY_PATH = '/ai/quality'
/** Ceiling: who is close to the daily budget their plan allows. */
export const AI_CEILING_PATH = '/ai/limits'

/** Also the redirect allowlist for both Server Actions in this area. */
export const AI_RETURN_PATHS = [AI_PATH, AI_QUALITY_PATH, AI_CEILING_PATH] as const
export type AiReturnPath = (typeof AI_RETURN_PATHS)[number]

export function isAiReturnPath(value: string): value is AiReturnPath {
  return (AI_RETURN_PATHS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Query parameters
//
// The URL is the state on every page in this area: a filtered view is a link an
// operator can paste to a colleague and get the same rows, and every control
// re-queries on the server rather than slicing an array in the browser.
// ---------------------------------------------------------------------------

export const AI_PARAMS = {
  /** Day window on the spend and quality pages. */
  days: 'aralik',
  /** Rolling window on the ceiling page — the three `bo_ai_spend` columns. */
  window: 'pencere',
  /** Minimum spend in the selected window, in micros. */
  minCost: 'esik',
  /** Which column the ceiling table is ordered by, in Postgres. */
  sort: 'sirala',
  page: 'sayfa',
} as const

/**
 * How the ceiling table is ordered.
 *
 * Both are a real `ORDER BY`. They answer different questions and the page
 * needs both: `maliyet` finds the accounts costing the most money, `cagri`
 * finds the accounts closest to the ceiling — which is enforced as a *call
 * count*, so a Free user making hundreds of cheap calls is at the limit while
 * costing less than one Pro user's afternoon.
 */
export const CEILING_SORTS = ['maliyet', 'cagri'] as const
export type CeilingSort = (typeof CEILING_SORTS)[number]

export const DEFAULT_CEILING_SORT: CeilingSort = 'maliyet'

export function isCeilingSort(value: string): value is CeilingSort {
  return (CEILING_SORTS as readonly string[]).includes(value)
}

/**
 * Day windows, in the two lengths `bo_ai_spend_daily` can be compared over.
 *
 * Both are also `bo_ai_spend` window columns, so the per-user table beside a
 * chart covers exactly the same days as the chart — a "top spender" list that
 * silently measured a different period than the total above it would be worse
 * than no list at all.
 */
export const DAY_WINDOWS = {
  '7g': 7,
  '30g': 30,
} as const

export type DayWindowKey = keyof typeof DAY_WINDOWS

export const DEFAULT_DAY_WINDOW: DayWindowKey = '7g'

export function isDayWindowKey(value: string): value is DayWindowKey {
  return Object.prototype.hasOwnProperty.call(DAY_WINDOWS, value)
}

/** The rolling windows `bo_ai_spend` carries as pre-summed columns. */
export const SPEND_WINDOWS = ['24s', '7g', '30g'] as const
export type SpendWindowKey = (typeof SPEND_WINDOWS)[number]

export const DEFAULT_SPEND_WINDOW: SpendWindowKey = '24s'

export function isSpendWindowKey(value: string): value is SpendWindowKey {
  return (SPEND_WINDOWS as readonly string[]).includes(value)
}

/**
 * Spend floors for the ceiling page, in micros of the billing currency.
 *
 * They exist so an operator hunting a runaway account is not paging through
 * thousands of users who cost a fraction of a cent. Every one of them is a
 * `>=` in Postgres, never a filter applied after the fact.
 */
export const MIN_COST_OPTIONS = [100_000, 1_000_000, 5_000_000] as const
export type MinCostOption = (typeof MIN_COST_OPTIONS)[number]

export function isMinCostOption(value: number): value is MinCostOption {
  return (MIN_COST_OPTIONS as readonly number[]).includes(value)
}

// ---------------------------------------------------------------------------
// The enforced ceiling
// ---------------------------------------------------------------------------

/**
 * The daily model budget the backend actually enforces, mirrored from
 * `checkAiBudget` in `supabase/functions/_shared/limits.ts`: a rolling 24-hour
 * count of `ai_usage_events` rows, capped at 60 for Free and 400 for Pro.
 *
 * It is repeated here rather than imported because that file is Deno code that
 * runs in an edge function, not a workspace package this app can resolve. The
 * number is a constant of the product, and the ceiling page names it on screen
 * so a drift between the two is visible to whoever reads the page next.
 */
export const DAILY_EVENT_CAP = {
  free: 60,
  pro: 400,
} as const

export type CapTier = keyof typeof DAILY_EVENT_CAP

/**
 * Subscription states that carry the Pro ceiling.
 *
 * `resolveEntitlements` also grants Pro for an unexpired referral bonus, and no
 * `bo_*` view exposes that expiry — so a Free-looking row may in fact be
 * running against the higher ceiling. The page says so rather than quietly
 * over-reporting risk.
 */
export const PRO_STATUSES = ['active', 'trialing', 'grace_period'] as const

export function capTierFor(subscriptionStatus: string | null): CapTier {
  return subscriptionStatus !== null &&
    (PRO_STATUSES as readonly string[]).includes(subscriptionStatus)
    ? 'pro'
    : 'free'
}

/** Where a daily average stops being ordinary use and starts being a risk. */
export const CAP_WARNING_RATIO = 0.7
export const CAP_CRITICAL_RATIO = 1

// ---------------------------------------------------------------------------
// Quality thresholds
//
// A tone on a rate is a claim about health, so the two thresholds that decide
// it live here rather than being typed into three tables that would eventually
// disagree. They are read from the product's own expectations: roughly a
// quarter of drafts being turned down is normal editorial friction, and two in
// five means the model is writing things people do not want sent.
// ---------------------------------------------------------------------------

export const REJECTION_WARNING_RATIO = 0.25
export const REJECTION_CRITICAL_RATIO = 0.4

/** A briefing nobody opens is a briefing that failed, quietly. */
export const OPEN_RATE_WARNING_RATIO = 0.5
export const OPEN_RATE_CRITICAL_RATIO = 0.25

// ---------------------------------------------------------------------------
// The staff action
// ---------------------------------------------------------------------------

/** The audit action token a quota review writes. Shaped for `bo_identifier`. */
export const QUOTA_REVIEW_ACTION = 'ai.quota_reviewed'

/** The thing a review is recorded against, so `bo_audit` can be filtered on it. */
export const QUOTA_REVIEW_ENTITY_TYPE = 'ai_quota'

/** Fields the review form posts. */
export const QUOTA_REVIEW_FIELDS = {
  userId: 'kullaniciId',
  decision: 'karar',
  window: 'pencere',
  reason: 'gerekce',
  returnTo: 'donus',
} as const

/**
 * What an operator concluded about an account's consumption.
 *
 * ASCII tokens, because they are written into `audit_logs.metadata` and read
 * back through `bo_identifier`; the Turkish labels live in `messages.ts`.
 */
export const QUOTA_DECISIONS = ['watch', 'contact_user', 'throttle_requested'] as const
export type QuotaDecision = (typeof QUOTA_DECISIONS)[number]

export function isQuotaDecision(value: string): value is QuotaDecision {
  return (QUOTA_DECISIONS as readonly string[]).includes(value)
}

/** Fields the refresh form posts. */
export const REFRESH_FIELDS = {
  returnTo: 'donus',
} as const

/** What the review action reports back through the URL — codes and ids only. */
export const REVIEW_RESULT_PARAMS = {
  outcome: 'sonuc',
  decision: 'sonucKarar',
  user: 'sonucKullanici',
} as const

export const REVIEW_OUTCOMES = ['recorded', 'invalid', 'forbidden', 'failed'] as const
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number]

export function isReviewOutcome(value: string): value is ReviewOutcome {
  return (REVIEW_OUTCOMES as readonly string[]).includes(value)
}

/**
 * Reason bounds, mirroring `isValidReason` in `@/lib/audit`.
 *
 * Repeated here because that module is `server-only` and the form enforcing
 * them in the browser is a client component. The server re-checks with the real
 * function, so this pair is a courtesy to the operator, never the gate.
 */
export const MIN_REASON_LENGTH = 3
export const MAX_REASON_LENGTH = 280

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

/** Users per page on the ceiling table. */
export const CEILING_PAGE_SIZE = 20
/** Rows in the spend page's "top spenders" panel. */
export const TOP_SPENDER_LIMIT = 10
/** Days in the quality trend table. Short on purpose: it is a regression alarm. */
export const QUALITY_TREND_DAYS = 7
