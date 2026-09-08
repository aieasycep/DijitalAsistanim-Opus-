/**
 * The URL and form contract of the billing area.
 *
 * Both sides of the server/client boundary need these names: the pages parse
 * them out of `searchParams`, the filter bar writes them back into the URL, and
 * the revoke form posts them into a Server Action. A `'use server'` module may
 * export nothing but async functions and a client component must not pull one
 * into its bundle, so the strings both sides agree on live here, in a plain
 * module with no imports and no side effects.
 *
 * Getting one of them wrong is then a type error rather than a filter that
 * silently reads a parameter nobody writes.
 */

// ===========================================================================
// Routes
// ===========================================================================

export const BILLING_PATH = '/billing'
export const BILLING_RECONCILIATION_PATH = '/billing/mutabakat'
export const BILLING_REFERRALS_PATH = '/billing/davetler'

/** The redirect allowlist for every Server Action in this area. */
export const BILLING_RETURN_PATHS = [
  BILLING_PATH,
  BILLING_RECONCILIATION_PATH,
  BILLING_REFERRALS_PATH,
] as const

export type BillingReturnPath = (typeof BILLING_RETURN_PATHS)[number]

export function isBillingReturnPath(value: string): value is BillingReturnPath {
  return (BILLING_RETURN_PATHS as readonly string[]).includes(value)
}

// ===========================================================================
// Paging
// ===========================================================================

export const PAGE_PARAM = 'sayfa'
export const BILLING_PAGE_SIZE = 25

/** A page number is 1-based; anything else falls back to the first page. */
export function parsePage(raw: string | null): number {
  const value = Number.parseInt(raw ?? '', 10)
  return Number.isInteger(value) && value >= 1 ? value : 1
}

// ===========================================================================
// Subscriptions page
// ===========================================================================

export const COHORT_PARAM = 'kohort'

export const COHORT_GRANULARITIES = ['hafta', 'ay'] as const
export type CohortGranularity = (typeof COHORT_GRANULARITIES)[number]
export const DEFAULT_COHORT_GRANULARITY: CohortGranularity = 'ay'

/**
 * How many cohorts the table shows.
 *
 * Every cell is a separate `count(*)` in Postgres — PostgREST has no GROUP BY
 * — so the width of this table is a query budget, not a layout choice. Six
 * cohorts at two counts each is twelve round trips, which is the point at which
 * the page still answers in one visible step.
 */
export const COHORT_BUCKET_COUNT = 6

export function isCohortGranularity(value: string): value is CohortGranularity {
  return (COHORT_GRANULARITIES as readonly string[]).includes(value)
}

// ===========================================================================
// Reconciliation page
// ===========================================================================

export const RULE_PARAM = 'kural'

/**
 * The divergence classes the reconciliation page can list.
 *
 * Each one is a predicate Postgres evaluates, not a filter applied to fetched
 * rows — see `RECONCILIATION_RULES` in `@/lib/queries/billing`, which owns the
 * filters and the severities.
 */
export const RECONCILIATION_RULE_IDS = [
  'magaza-yok',
  'donem-gecmis',
  'deneme-gecmis',
  'hak-gecikmesi',
  'magaza-var',
  'donem-yok',
] as const

export type ReconciliationRuleId = (typeof RECONCILIATION_RULE_IDS)[number]

export const DEFAULT_RECONCILIATION_RULE: ReconciliationRuleId = 'magaza-yok'

export function isReconciliationRuleId(value: string): value is ReconciliationRuleId {
  return (RECONCILIATION_RULE_IDS as readonly string[]).includes(value)
}

// ===========================================================================
// Referrals page
// ===========================================================================

export const SERIES_PARAM = 'aralik'

export const SERIES_GRANULARITIES = ['gun', 'hafta', 'ay'] as const
export type SeriesGranularity = (typeof SERIES_GRANULARITIES)[number]
export const DEFAULT_SERIES_GRANULARITY: SeriesGranularity = 'hafta'

/** Same budget reasoning as `COHORT_BUCKET_COUNT`: two counts per bucket. */
export const SERIES_BUCKET_COUNT = 8

export function isSeriesGranularity(value: string): value is SeriesGranularity {
  return (SERIES_GRANULARITIES as readonly string[]).includes(value)
}

export const FRAUD_TIER_PARAM = 'kademe'

/**
 * The three ways a referrer shows up on the fraud panel.
 *
 * `yaklasan` and `asim` are read off `referrals.redemption_count`, the counter
 * the redeem endpoint actually enforces the ceiling against. `sapma` is read
 * off the credit rows instead, and catches the case that counter cannot: see
 * the note on `FRAUD_TIERS` in `@/lib/queries/billing`.
 */
export const FRAUD_TIERS = ['yaklasan', 'asim', 'sapma'] as const
export type FraudTier = (typeof FRAUD_TIERS)[number]
export const DEFAULT_FRAUD_TIER: FraudTier = 'yaklasan'

export function isFraudTier(value: string): value is FraudTier {
  return (FRAUD_TIERS as readonly string[]).includes(value)
}

export const CLUSTER_WINDOW_PARAM = 'pencere'
export const CLUSTER_WINDOW_DAYS = [7, 14, 30] as const
export type ClusterWindowDays = (typeof CLUSTER_WINDOW_DAYS)[number]
export const DEFAULT_CLUSTER_WINDOW: ClusterWindowDays = 7

export function isClusterWindow(value: number): value is ClusterWindowDays {
  return (CLUSTER_WINDOW_DAYS as readonly number[]).includes(value)
}

export const CLUSTER_MIN_PARAM = 'yogunluk'
export const CLUSTER_MIN_REDEMPTIONS = [3, 5, 10] as const
export type ClusterMinRedemptions = (typeof CLUSTER_MIN_REDEMPTIONS)[number]
export const DEFAULT_CLUSTER_MIN: ClusterMinRedemptions = 3

export function isClusterMin(value: number): value is ClusterMinRedemptions {
  return (CLUSTER_MIN_REDEMPTIONS as readonly number[]).includes(value)
}

// ===========================================================================
// The revoke action
// ===========================================================================

/**
 * The shape `referrals.code` is constrained to in migration 0009.
 *
 * Deliberately looser than `isValidReferralCode` in @da/domain, which also
 * excludes the ambiguous characters the generator never emits. This is a
 * cheap guard on a posted field, not a mint: the real check is that the code
 * equals the one stored on the row the action re-reads, and rejecting a legacy
 * or hand-inserted code the table itself accepts would leave a row nobody could
 * act on.
 */
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{8}$/

/** Fields the revoke form posts. */
export const REVOKE_FIELDS = {
  referralId: 'davetId',
  referrerUserId: 'davetEdenId',
  code: 'davetKodu',
  reason: 'gerekce',
  returnTo: 'donus',
} as const

/** Fields the refresh form posts. */
export const REFRESH_FIELDS = {
  returnTo: 'donus',
} as const

/**
 * What the revoke action reports back through the URL. Only our own tokens and
 * a uuid travel here — never a message from anywhere else.
 */
export const REVOKE_RESULT_PARAMS = {
  outcome: 'sonuc',
  referral: 'sonucDavet',
} as const

export const REVOKE_OUTCOMES = [
  /** The order was recorded and there were active credits to void. */
  'success',
  /** Recorded, but the code had no active credit left. */
  'noop',
  /** The referral row is gone, or the id named one that never existed. */
  'notfound',
  /** A malformed id, code or reason. */
  'invalid',
  /** The operator is not `ops`. */
  'forbidden',
  /** The audit row would not write, so nothing may be claimed. */
  'failed',
] as const

export type RevokeOutcome = (typeof REVOKE_OUTCOMES)[number]

export function isRevokeOutcome(value: string): value is RevokeOutcome {
  return (REVOKE_OUTCOMES as readonly string[]).includes(value)
}

/** The audit action a revocation order writes. Matches `bo_identifier`'s shape. */
export const REVOKE_AUDIT_ACTION = 'referral.credit_revoke_ordered'

/**
 * Reason bounds, mirroring `isValidReason` in `@/lib/audit`.
 *
 * Repeated rather than imported because `@/lib/audit` is `server-only` and the
 * form that enforces them in the browser is a client component. The server
 * re-checks with the real function, so this pair is a courtesy to the operator
 * and never the actual gate.
 */
export const MIN_REASON_LENGTH = 3
export const MAX_REASON_LENGTH = 280
