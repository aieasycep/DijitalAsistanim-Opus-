import 'server-only'

import {
  MAX_REDEMPTIONS_PER_REFERRER,
  PRO_ENTITLEMENT_ID,
  SUBSCRIPTION_STATUSES,
  addLocalDays,
  isAppError,
  resolveEntitlements,
  startOfLocalDay,
  startOfLocalWeek,
  systemClock,
  toZonedParts,
  zonedTimeToUtc,
  type Clock,
  type Entitlements,
  type Plan,
  type SubscriptionStatus,
} from '@da/domain'
import {
  BILLING_PAGE_SIZE,
  RECONCILIATION_RULE_IDS,
  REVOKE_AUDIT_ACTION,
  type ClusterMinRedemptions,
  type ClusterWindowDays,
  type CohortGranularity,
  type FraudTier,
  type ReconciliationRuleId,
  type SeriesGranularity,
} from '@/components/billing/contract'
import {
  countView,
  queryView,
  queryViewOne,
  queryViewPage,
  type BoAuditRow,
  type BoReferralRow,
  type BoUserDetailRow,
  type BoUserRow,
  type BoViewName,
  type BoViewRows,
  type ViewFilter,
  type ViewOrder,
  type ViewPage,
} from '@/lib/db'
import { OPS_LOCALE, OPS_TIME_ZONE } from '@/lib/format'
import { messages } from '@/lib/messages'

/**
 * Every query behind the billing area, in one module.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE MAY ASK FOR, AND WHAT IT MAY NOT
 * ---------------------------------------------------------------------------
 *
 * Nothing here names a table. Every read goes through `queryView`, `countView`
 * or `queryViewPage` in `@/lib/db`, whose first argument is constrained to the
 * `bo_*` view names, and migration 0017 guarantees those views have no content
 * column to select. Billing is the area where that matters least in principle
 * and most in practice: a refund investigation is exactly the moment somebody
 * reaches for "let me just look at their mail", and there is no expression in
 * this file that could.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE SO MANY COUNTS
 * ---------------------------------------------------------------------------
 *
 * PostgREST exposes no GROUP BY, so a breakdown is one `count(*)` per cell, sent
 * with `head: true` so no row body ever crosses the wire. That is deliberately
 * chosen over the alternative — fetching a page of rows and tallying it in
 * JavaScript — which would be wrong past the first page and would pull rows the
 * page has no business holding. The cost is bounded on purpose: the cohort and
 * series tables declare their bucket counts in
 * `@/components/billing/contract`, and each block is settled separately so a
 * slow or failing one costs its own panel.
 *
 * ---------------------------------------------------------------------------
 * WHERE A NUMBER IS DERIVED RATHER THAN QUERIED
 * ---------------------------------------------------------------------------
 *
 * Three places, each marked at its definition: the status mix total (the sum of
 * a partition Postgres already counted), the lapsed-trial figure (a subtraction
 * over four counts of the same partition), and the per-referrer counter
 * comparison (two scalars the view returned, subtracted). None of them counts
 * rows in the application.
 *
 * A `count(*)` over `bo_users` or `bo_user_detail` is cheaper than the column
 * list suggests: the lateral aggregates in those views are provably one-row and
 * unreferenced by an aggregate, so the planner removes every one of them and
 * the count runs over `profiles ⋈ subscriptions` alone.
 */

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result that carries its own failure instead of throwing upward, so a
 * panel that cannot load renders an error where it stands and the rest of the
 * page still answers the question the operator came with.
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; message: string }

export async function settle<T>(run: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (isAppError(error) && error.code === 'forbidden') {
      return { ok: false, message: messages.errors.forbidden }
    }
    return { ok: false, message: messages.errors.queryFailed }
  }
}

// ===========================================================================
// Entitlement vocabulary, derived from @da/domain rather than restated
// ===========================================================================

/**
 * A fixed instant used only to interrogate `resolveEntitlements` about its own
 * status rules. `now` is irrelevant to that answer because the probe passes no
 * referral bonus — the only branch that reads the clock.
 */
const RULE_PROBE_INSTANT = new Date(0)

/**
 * The subscription statuses `resolveEntitlements` treats as granting Pro,
 * asked of the function instead of copied out of it.
 *
 * The backoffice's whole claim on this page is that it applies the product's
 * own rule; a hand-written `['active','trialing','grace_period']` here would
 * make the reconciliation table agree with a rule that no longer exists the
 * first time somebody edits `entitlements.ts`.
 */
export const PRO_GRANTING_STATUSES: readonly SubscriptionStatus[] = SUBSCRIPTION_STATUSES.filter(
  (status) =>
    resolveEntitlements({
      subscriptionStatus: status,
      activeEntitlement: PRO_ENTITLEMENT_ID,
      referralBonusExpiresAt: null,
      now: RULE_PROBE_INSTANT,
    }).plan === 'pro',
)

/** Statuses that grant Pro without being a trial: the paid states. */
export const PAID_STATUSES: readonly SubscriptionStatus[] = PRO_GRANTING_STATUSES.filter(
  (status) => status !== 'trialing',
)

/** Everything else: the states in which the product shows a paywall. */
export const NON_PRO_STATUSES: readonly SubscriptionStatus[] = SUBSCRIPTION_STATUSES.filter(
  (status) => !PRO_GRANTING_STATUSES.includes(status),
)

/**
 * The stores `subscriptions.store` may hold, from the check constraint in
 * migration 0009. Listed so "a store is set" can be expressed as an `in`
 * filter: PostgREST's `not.is.null` is not part of the foundation's filter
 * surface, and enumerating the three legal values is exact rather than a
 * workaround.
 */
export const SUBSCRIPTION_STORES = ['app_store', 'play_store', 'promotional'] as const

/** Excludes deleted accounts from every subscription aggregate on this page. */
const LIVE_USERS: readonly ViewFilter<BoUserRow>[] = [
  { column: 'is_deleted', op: 'is', value: false },
]

const LIVE_USER_DETAIL: readonly ViewFilter<BoUserDetailRow>[] = [
  { column: 'is_deleted', op: 'is', value: false },
]

// ===========================================================================
// Time buckets
// ===========================================================================

export interface TimeBucket {
  /** Stable React key. */
  key: string
  /** Turkish label for the period, in Istanbul wall clock. */
  label: string
  /** Inclusive lower bound, ISO-8601. */
  start: string
  /** Exclusive upper bound, ISO-8601. */
  end: string
}

const dayLabelFormatter = new Intl.DateTimeFormat(OPS_LOCALE, {
  timeZone: OPS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
})

const monthLabelFormatter = new Intl.DateTimeFormat(OPS_LOCALE, {
  timeZone: OPS_TIME_ZONE,
  month: 'long',
  year: 'numeric',
})

/** Midnight starting the month `offset` months from the instant's own month. */
function localMonthStart(instant: Date, offset: number): Date {
  const parts = toZonedParts(instant, OPS_TIME_ZONE)
  // Round-tripping through Date.UTC normalises a month index that has run off
  // either end of the year, so -1 from January lands in the previous December.
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1))
  return zonedTimeToUtc(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: 1,
      hour: 0,
      minute: 0,
    },
    OPS_TIME_ZONE,
  )
}

export type BucketGranularity = CohortGranularity | SeriesGranularity

/**
 * `count` consecutive periods ending with the one in progress, oldest first.
 *
 * Boundaries are Istanbul local midnights (and Monday-start weeks, matching
 * `startOfLocalWeek`), so a bucket is the day an operator means when they say
 * "yesterday" rather than a rolling 24 hours off the current instant.
 */
export function buildBuckets(
  granularity: BucketGranularity,
  count: number,
  clock: Clock = systemClock,
): readonly TimeBucket[] {
  const now = clock.now()
  const buckets: TimeBucket[] = []

  for (let back = count - 1; back >= 0; back -= 1) {
    let start: Date
    let end: Date
    let label: string

    if (granularity === 'gun') {
      start = startOfLocalDay(addLocalDays(now, -back, OPS_TIME_ZONE), OPS_TIME_ZONE)
      end = addLocalDays(start, 1, OPS_TIME_ZONE)
      label = dayLabelFormatter.format(start)
    } else if (granularity === 'hafta') {
      start = startOfLocalWeek(addLocalDays(now, -back * 7, OPS_TIME_ZONE), OPS_TIME_ZONE)
      end = addLocalDays(start, 7, OPS_TIME_ZONE)
      label = `${dayLabelFormatter.format(start)} – ${dayLabelFormatter.format(
        new Date(end.getTime() - 1),
      )}`
    } else {
      start = localMonthStart(now, -back)
      end = localMonthStart(now, -back + 1)
      label = monthLabelFormatter.format(start)
    }

    buckets.push({
      key: `${granularity}-${start.toISOString()}`,
      label,
      start: start.toISOString(),
      end: end.toISOString(),
    })
  }

  return buckets
}

/** One `count(*)` per bucket, all in flight together. */
async function countInBuckets<V extends BoViewName>(
  view: V,
  column: keyof BoViewRows[V] & string,
  buckets: readonly TimeBucket[],
  base: readonly ViewFilter<BoViewRows[V]>[] = [],
): Promise<readonly number[]> {
  return Promise.all(
    buckets.map((bucket) => {
      const filters: ViewFilter<BoViewRows[V]>[] = [
        ...base,
        { column, op: 'gte', value: bucket.start },
        { column, op: 'lt', value: bucket.end },
      ]
      return countView(view, filters)
    }),
  )
}

// ===========================================================================
// Subscription state
// ===========================================================================

export interface StatusCount {
  status: SubscriptionStatus
  count: number
}

export interface SubscriptionMix {
  counts: readonly StatusCount[]
  /**
   * Sum of the six counts. `bo_users` coalesces a missing subscription row to
   * `free`, so the statuses partition the roster exactly and the sum is the
   * live account total — one fewer round trip than asking for it again.
   */
  total: number
  paying: number
  trialing: number
  gracePeriod: number
  billingIssue: number
}

export async function loadSubscriptionMix(): Promise<SubscriptionMix> {
  const counts = await Promise.all(
    SUBSCRIPTION_STATUSES.map((status) =>
      countView('bo_users', [
        ...LIVE_USERS,
        { column: 'subscription_status', op: 'eq', value: status },
      ]),
    ),
  )

  const byStatus = SUBSCRIPTION_STATUSES.map<StatusCount>((status, index) => ({
    status,
    count: counts[index] ?? 0,
  }))

  const countOf = (status: SubscriptionStatus): number =>
    byStatus.find((entry) => entry.status === status)?.count ?? 0

  return {
    counts: byStatus,
    total: byStatus.reduce((sum, entry) => sum + entry.count, 0),
    paying: PAID_STATUSES.reduce((sum, status) => sum + countOf(status), 0),
    trialing: countOf('trialing'),
    gracePeriod: countOf('grace_period'),
    billingIssue: countOf('billing_issue'),
  }
}

/**
 * Where trials ended up.
 *
 * `trial_ends_at` is only ever set on a subscription row that has had a trial,
 * so "started" is exactly the union of running and ended — which is why it is
 * their sum rather than a seventh query. The four ended-state counts partition
 * the ended set (the statuses are mutually exclusive), so `lapsed` is the
 * remainder rather than two more round trips.
 */
export interface TrialFunnel {
  running: number
  ended: number
  started: number
  converted: number
  /** Ended, yet the row still says `trialing`: the status never advanced. */
  stuck: number
  billingIssue: number
  lapsed: number
  /** Converted as a share of ended trials, or null when none have ended. */
  conversionRate: number | null
}

export async function loadTrialFunnel(clock: Clock = systemClock): Promise<TrialFunnel> {
  const nowIso = clock.now().toISOString()

  const [running, ended, converted, stuck, billingIssue] = await Promise.all([
    countView('bo_users', [...LIVE_USERS, { column: 'trial_ends_at', op: 'gte', value: nowIso }]),
    countView('bo_users', [...LIVE_USERS, { column: 'trial_ends_at', op: 'lt', value: nowIso }]),
    countView('bo_users', [
      ...LIVE_USERS,
      { column: 'trial_ends_at', op: 'lt', value: nowIso },
      { column: 'subscription_status', op: 'in', value: PAID_STATUSES },
    ]),
    countView('bo_users', [
      ...LIVE_USERS,
      { column: 'trial_ends_at', op: 'lt', value: nowIso },
      { column: 'subscription_status', op: 'eq', value: 'trialing' },
    ]),
    countView('bo_users', [
      ...LIVE_USERS,
      { column: 'trial_ends_at', op: 'lt', value: nowIso },
      { column: 'subscription_status', op: 'eq', value: 'billing_issue' },
    ]),
  ])

  const lapsed = Math.max(0, ended - converted - stuck - billingIssue)

  return {
    running,
    ended,
    started: running + ended,
    converted,
    stuck,
    billingIssue,
    lapsed,
    conversionRate: ended > 0 ? converted / ended : null,
  }
}

export interface CohortRow {
  bucket: TimeBucket
  total: number
  paying: number
  /** Paying as a share of the cohort, or null for an empty cohort. */
  rate: number | null
}

/**
 * Paid conversion by signup cohort.
 *
 * `subscriptions` keeps no history — a status change overwrites the row — so
 * "subscription states over time" cannot be a state timeline from these views.
 * What it can honestly be is this: bucket accounts by when they were created
 * and ask what share of each bucket is paying today. That answers the question
 * a billing review actually asks (is conversion getting better or worse?) from
 * data that exists, instead of inventing a series from a column that is
 * overwritten.
 */
export async function loadCohorts(
  granularity: CohortGranularity,
  bucketCount: number,
  clock: Clock = systemClock,
): Promise<readonly CohortRow[]> {
  const buckets = buildBuckets(granularity, bucketCount, clock)

  const [totals, paying] = await Promise.all([
    countInBuckets('bo_users', 'created_at', buckets, LIVE_USERS),
    countInBuckets('bo_users', 'created_at', buckets, [
      ...LIVE_USERS,
      { column: 'subscription_status', op: 'in', value: PAID_STATUSES },
    ]),
  ])

  return buckets.map((bucket, index) => {
    const total = totals[index] ?? 0
    const paid = paying[index] ?? 0
    return { bucket, total, paying: paid, rate: total > 0 ? paid / total : null }
  })
}

/**
 * The two cheapest divergence counts, for the subscriptions page's summary.
 *
 * Both are answerable from `bo_users`, which is the lighter of the two user
 * views; the remaining four rules need `subscription_store` and therefore
 * `bo_user_detail`, so they live on the reconciliation page where the operator
 * has asked for them.
 */
export interface DriftSummary {
  periodLapsed: number
  trialLapsed: number
}

export async function loadDriftSummary(clock: Clock = systemClock): Promise<DriftSummary> {
  const nowIso = clock.now().toISOString()

  const [periodLapsed, trialLapsed] = await Promise.all([
    countView('bo_users', [
      ...LIVE_USERS,
      { column: 'subscription_status', op: 'in', value: PAID_STATUSES },
      { column: 'subscription_period_end', op: 'lt', value: nowIso },
    ]),
    countView('bo_users', [
      ...LIVE_USERS,
      { column: 'subscription_status', op: 'eq', value: 'trialing' },
      { column: 'trial_ends_at', op: 'lt', value: nowIso },
    ]),
  ])

  return { periodLapsed, trialLapsed }
}

// ===========================================================================
// Reconciliation
// ===========================================================================

export interface ReconciliationRule {
  id: ReconciliationRuleId
  severity: 'critical' | 'warning'
  /** The predicate, as filters Postgres evaluates. */
  filters: (nowIso: string) => readonly ViewFilter<BoUserDetailRow>[]
}

/**
 * The six ways a stored subscription row and the product's own entitlement
 * rule can disagree.
 *
 * Two of them (`magaza-yok`, `magaza-var`) are disagreements in the strict
 * sense: `resolveEntitlements` computes a different plan from the row than the
 * status column claims. The other four are disagreements between the status and
 * its *own dates* — `resolveEntitlements` deliberately does not look at
 * `current_period_end` or `trial_ends_at`, so a row whose dates have lapsed
 * keeps computing Pro forever. Both kinds are billing bugs and both are found
 * the same way, so they share a page; the rule's own description on screen says
 * which kind it is.
 */
const RECONCILIATION_RULES_BY_ID: Readonly<Record<ReconciliationRuleId, ReconciliationRule>> = {
  'magaza-yok': {
    id: 'magaza-yok',
    severity: 'critical',
    filters: () => [
      ...LIVE_USER_DETAIL,
      { column: 'subscription_status', op: 'in', value: PRO_GRANTING_STATUSES },
      { column: 'subscription_store', op: 'is', value: null },
    ],
  },
  'donem-gecmis': {
    id: 'donem-gecmis',
    severity: 'critical',
    filters: (nowIso) => [
      ...LIVE_USER_DETAIL,
      { column: 'subscription_status', op: 'in', value: PAID_STATUSES },
      { column: 'subscription_period_end', op: 'lt', value: nowIso },
    ],
  },
  'deneme-gecmis': {
    id: 'deneme-gecmis',
    severity: 'critical',
    filters: (nowIso) => [
      ...LIVE_USER_DETAIL,
      { column: 'subscription_status', op: 'eq', value: 'trialing' },
      { column: 'trial_ends_at', op: 'lt', value: nowIso },
    ],
  },
  'hak-gecikmesi': {
    id: 'hak-gecikmesi',
    severity: 'critical',
    filters: (nowIso) => [
      ...LIVE_USER_DETAIL,
      { column: 'subscription_status', op: 'in', value: NON_PRO_STATUSES },
      { column: 'subscription_period_end', op: 'gt', value: nowIso },
    ],
  },
  'magaza-var': {
    id: 'magaza-var',
    severity: 'warning',
    filters: () => [
      ...LIVE_USER_DETAIL,
      { column: 'subscription_status', op: 'eq', value: 'free' },
      { column: 'subscription_store', op: 'in', value: SUBSCRIPTION_STORES },
    ],
  },
  'donem-yok': {
    id: 'donem-yok',
    severity: 'warning',
    filters: () => [
      ...LIVE_USER_DETAIL,
      { column: 'subscription_status', op: 'in', value: PAID_STATUSES },
      { column: 'subscription_period_end', op: 'is', value: null },
    ],
  },
}

/** The rules in the order the page lists them, most severe class first. */
export const RECONCILIATION_RULES: readonly ReconciliationRule[] = RECONCILIATION_RULE_IDS.map(
  (id) => RECONCILIATION_RULES_BY_ID[id],
)

export function reconciliationRule(id: ReconciliationRuleId): ReconciliationRule {
  return RECONCILIATION_RULES_BY_ID[id]
}

export interface RuleCount {
  id: ReconciliationRuleId
  severity: ReconciliationRule['severity']
  count: number
}

export async function loadRuleCounts(clock: Clock = systemClock): Promise<readonly RuleCount[]> {
  const nowIso = clock.now().toISOString()
  const counts = await Promise.all(
    RECONCILIATION_RULES.map((rule) => countView('bo_user_detail', rule.filters(nowIso))),
  )
  return RECONCILIATION_RULES.map((rule, index) => ({
    id: rule.id,
    severity: rule.severity,
    count: counts[index] ?? 0,
  }))
}

/** Worst first: the longest-standing divergence is the one nobody noticed. */
const RECONCILIATION_ORDER: readonly ViewOrder<BoUserDetailRow>[] = [
  { column: 'updated_at', ascending: true },
]

export async function listReconciliation(
  id: ReconciliationRuleId,
  page: number,
  clock: Clock = systemClock,
): Promise<ViewPage<BoUserDetailRow>> {
  const rule = reconciliationRule(id)
  return queryViewPage('bo_user_detail', {
    filters: rule.filters(clock.now().toISOString()),
    order: RECONCILIATION_ORDER,
    limit: BILLING_PAGE_SIZE,
    offset: (page - 1) * BILLING_PAGE_SIZE,
  })
}

export interface ReconciledUser {
  row: BoUserDetailRow
  /**
   * The plan the stored status alone claims — `resolveEntitlements` asked as
   * though the store agreed with it.
   */
  storedPlan: Plan
  /**
   * What `resolveEntitlements` computes from the row as it actually stands.
   *
   * `activeEntitlement` is not a column any `bo_*` view projects, so the
   * presence of a store stands in for it: `subscriptions` is written only by
   * the RevenueCat webhook, and a row carrying a store is a row that came from
   * a real purchase. `referralBonusExpiresAt` is null because no view is keyed
   * by who a bonus landed on — the page prints that caveat beside the column.
   */
  computed: Entitlements
  /** False when the two disagree about the plan itself. */
  agrees: boolean
}

export function reconcile(row: BoUserDetailRow, clock: Clock = systemClock): ReconciledUser {
  const now = clock.now()
  const status = row.subscription_status as SubscriptionStatus

  const storedPlan = resolveEntitlements({
    subscriptionStatus: status,
    activeEntitlement: PRO_ENTITLEMENT_ID,
    referralBonusExpiresAt: null,
    now,
  }).plan

  const computed = resolveEntitlements({
    subscriptionStatus: status,
    activeEntitlement: row.subscription_store === null ? null : PRO_ENTITLEMENT_ID,
    referralBonusExpiresAt: null,
    now,
  })

  return { row, storedPlan, computed, agrees: storedPlan === computed.plan }
}

// ===========================================================================
// Referrals
// ===========================================================================

/** The ceiling the redeem endpoint enforces, from @da/domain. */
export const REFERRAL_LIMIT = MAX_REDEMPTIONS_PER_REFERRER

/** "Near the limit" is four fifths of it — one more good week gets there. */
export const REFERRAL_NEAR_LIMIT = Math.ceil(MAX_REDEMPTIONS_PER_REFERRER * 0.8)

/**
 * How many `referral_credits` rows one redemption can produce on a code.
 *
 * One, and this is a schema fact rather than a reading of the redeem endpoint:
 * migration 0009 puts `unique (referee_user_id, code)` on `referral_credits`,
 * so a code can hold at most one credit row per person who redeemed it. That
 * makes `bo_referrals.credit_count` a count of distinct redeemers, directly
 * comparable to `referrals.redemption_count`, which is the counter the ceiling
 * is enforced against.
 *
 * The two are therefore equal on a healthy code, and each direction of
 * inequality is its own fault:
 *
 *   credit_count > redemption_count — more distinct redeemers hold a credit
 *     than the counter admits to. `referral-redeem` writes the credits first
 *     and bumps the counter after, and it deliberately does not fail the
 *     request when the bump fails (the bonus really was granted; it records
 *     `counter_updated: false` on the audit row instead). Since the ceiling is
 *     checked against the counter, a referrer whose counter fell behind can
 *     keep redeeming past the limit indefinitely. This is what `sapma` finds.
 *
 *   credit_count < redemption_count — the counter recorded redemptions whose
 *     credit rows are not there. Either the beneficiary's account was erased
 *     (`user_id` cascades) or the credit write never landed, which means
 *     somebody was told they had a bonus and does not.
 */
export const CREDITS_PER_REDEMPTION = 1

/**
 * Codes whose credit rows prove at least `REFERRAL_LIMIT` redemptions while the
 * enforced counter still reads below it.
 *
 * Expressed as two thresholds rather than a column comparison because PostgREST
 * cannot compare two columns to each other. It costs nothing in soundness: the
 * unique constraint means `REFERRAL_LIMIT` credit rows on one code are
 * `REFERRAL_LIMIT` distinct redeemers, so a row matching this really has passed
 * the ceiling while the counter says it has not. No false positives.
 */
const COUNTER_DRIFT_FILTERS: readonly ViewFilter<BoReferralRow>[] = [
  {
    column: 'credit_count',
    op: 'gte',
    value: REFERRAL_LIMIT * CREDITS_PER_REDEMPTION,
  },
  { column: 'redemption_count', op: 'lt', value: REFERRAL_LIMIT },
]

export interface ReferralTotals {
  codes: number
  redeemed: number
  nearLimit: number
  overLimit: number
  counterDrift: number
  withRevoked: number
}

export async function loadReferralTotals(): Promise<ReferralTotals> {
  const [codes, redeemed, nearLimit, overLimit, counterDrift, withRevoked] = await Promise.all([
    countView('bo_referrals'),
    // The counter, not the credit rows: a code that took a redemption whose
    // credit write failed has still been redeemed.
    countView('bo_referrals', [{ column: 'redemption_count', op: 'gte', value: 1 }]),
    countView('bo_referrals', [
      { column: 'redemption_count', op: 'gte', value: REFERRAL_NEAR_LIMIT },
    ]),
    countView('bo_referrals', [{ column: 'redemption_count', op: 'gt', value: REFERRAL_LIMIT }]),
    countView('bo_referrals', COUNTER_DRIFT_FILTERS),
    countView('bo_referrals', [{ column: 'credit_revoked_count', op: 'gte', value: 1 }]),
  ])

  return { codes, redeemed, nearLimit, overLimit, counterDrift, withRevoked }
}

export const FRAUD_TIER_FILTERS: Readonly<Record<FraudTier, readonly ViewFilter<BoReferralRow>[]>> =
  {
    yaklasan: [{ column: 'redemption_count', op: 'gte', value: REFERRAL_NEAR_LIMIT }],
    asim: [{ column: 'redemption_count', op: 'gt', value: REFERRAL_LIMIT }],
    sapma: COUNTER_DRIFT_FILTERS,
  }

const FRAUD_TIER_ORDER: Readonly<Record<FraudTier, readonly ViewOrder<BoReferralRow>[]>> = {
  yaklasan: [
    { column: 'redemption_count', ascending: false },
    { column: 'credit_count', ascending: false },
  ],
  asim: [
    { column: 'redemption_count', ascending: false },
    { column: 'credit_count', ascending: false },
  ],
  // The counter is the untrustworthy number in this tier, so rank by the credits.
  sapma: [
    { column: 'credit_count', ascending: false },
    { column: 'redemption_count', ascending: true },
  ],
}

const DAY_MILLISECONDS = 86_400_000

export interface ReferralInsight {
  row: BoReferralRow
  /**
   * Distinct redeemers holding a credit on this code. Equal to `credit_count`
   * because of the unique constraint — named separately so the arithmetic
   * below reads as what it means rather than as a column.
   */
  creditedRedeemers: number
  /**
   * `creditedRedeemers` minus the enforced counter. Zero on a healthy code;
   * see `CREDITS_PER_REDEMPTION` for what each direction means.
   */
  counterDrift: number
  /** Whole days since the code was created. */
  ageDays: number
  /**
   * Redemptions per day of the code's life.
   *
   * Measured against `redemption_count` — the authoritative tally — rather than
   * the credit rows, so a code whose credits failed to write still reports the
   * burst it actually took. A code younger than a day divides by one, so the
   * figure is "per day" and never a division by zero.
   */
  redemptionsPerDay: number
  atOrOverLimit: boolean
}

export function inspectReferral(row: BoReferralRow, clock: Clock = systemClock): ReferralInsight {
  const created = new Date(row.created_at).getTime()
  const elapsedMs = Number.isFinite(created)
    ? Math.max(0, clock.now().getTime() - created)
    : DAY_MILLISECONDS

  return {
    row,
    creditedRedeemers: row.credit_count,
    counterDrift: row.credit_count - row.redemption_count,
    ageDays: Math.floor(elapsedMs / DAY_MILLISECONDS),
    redemptionsPerDay: row.redemption_count / Math.max(1, elapsedMs / DAY_MILLISECONDS),
    atOrOverLimit: row.redemption_count >= REFERRAL_LIMIT,
  }
}

export async function listFraudReferrers(
  tier: FraudTier,
  page: number,
): Promise<ViewPage<BoReferralRow>> {
  return queryViewPage('bo_referrals', {
    filters: FRAUD_TIER_FILTERS[tier],
    order: FRAUD_TIER_ORDER[tier],
    limit: BILLING_PAGE_SIZE,
    offset: (page - 1) * BILLING_PAGE_SIZE,
  })
}

/**
 * Codes created inside the window that have already taken `minRedemptions`.
 *
 * A code cannot be redeemed before it exists, so a code created `w` days ago
 * carrying `n` redemptions took all `n` of them inside those `w` days. The
 * burst is therefore exact rather than inferred, and it falls out of two
 * ordinary filters Postgres evaluates — no interval arithmetic the view does
 * not expose, and no rows fetched in order to be measured.
 *
 * The predicate reads `redemption_count`, not the credit rows: a burst is a
 * burst whether or not the credits landed, and using the counter means this
 * panel keeps working even for a code whose credit writes are failing.
 */
export async function listRedemptionClusters(
  windowDays: ClusterWindowDays,
  minRedemptions: ClusterMinRedemptions,
  clock: Clock = systemClock,
): Promise<ViewPage<BoReferralRow>> {
  const since = addLocalDays(clock.now(), -windowDays, OPS_TIME_ZONE).toISOString()

  return queryViewPage('bo_referrals', {
    filters: [
      { column: 'created_at', op: 'gte', value: since },
      { column: 'redemption_count', op: 'gte', value: minRedemptions },
    ],
    order: [
      { column: 'redemption_count', ascending: false },
      { column: 'created_at', ascending: false },
    ],
    limit: BILLING_PAGE_SIZE,
  })
}

export interface ReferralSeriesPoint {
  bucket: TimeBucket
  /** Codes generated in the period. */
  created: number
  /**
   * Codes whose most recent credit falls in the period.
   *
   * `bo_referrals` aggregates `referral_credits` down to `max(granted_at)`, so
   * a per-redemption timeline is not reachable from the views the backoffice
   * may read. This is the honest projection of what is there: a code that took
   * three redemptions in one week counts once, and the label on screen says so.
   */
  active: number
}

export async function loadReferralSeries(
  granularity: SeriesGranularity,
  bucketCount: number,
  clock: Clock = systemClock,
): Promise<readonly ReferralSeriesPoint[]> {
  const buckets = buildBuckets(granularity, bucketCount, clock)

  const [created, active] = await Promise.all([
    countInBuckets('bo_referrals', 'created_at', buckets),
    countInBuckets('bo_referrals', 'last_credit_at', buckets),
  ])

  return buckets.map((bucket, index) => ({
    bucket,
    created: created[index] ?? 0,
    active: active[index] ?? 0,
  }))
}

export async function loadReferral(referralId: string): Promise<BoReferralRow | null> {
  return queryViewOne('bo_referrals', {
    filters: [{ column: 'referral_id', op: 'eq', value: referralId }],
  })
}

/**
 * The revocation orders this area has written, newest first.
 *
 * `bo_audit` exposes `staff_reason` only on rows whose actor is `staff`, which
 * is exactly what these are — so the panel can show who ordered what and why
 * without any other metadata value leaving the database.
 */
export async function listRevokeOrders(limit = 10): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [{ column: 'action', op: 'eq', value: REVOKE_AUDIT_ACTION }],
    order: { column: 'created_at', ascending: false },
    limit,
  })
}
