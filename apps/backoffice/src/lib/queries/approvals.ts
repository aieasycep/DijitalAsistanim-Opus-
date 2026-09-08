import 'server-only'

import {
  APPROVAL_ACTION_TYPES,
  DAY_MS,
  MAX_APPROVAL_ATTEMPTS,
  isAppError,
  systemClock,
  type ApprovalActionType,
  type Clock,
  type SourceType,
} from '@da/domain'
import {
  countView,
  queryViewPage,
  queryViewOne,
  type BoApprovalRow,
  type ViewFilter,
  type ViewPage,
} from '@/lib/db'
import { messages } from '@/lib/messages'
import {
  APPROVAL_WINDOW_DAYS,
  DASHBOARD_CODE_LIMIT,
  type ApprovalWindowKey,
} from '@/components/approvals/contract'

/**
 * Every query the approvals area makes.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE MAY SEE
 * ---------------------------------------------------------------------------
 *
 * `approval_actions` is the highest-risk table in the schema for a support
 * tool: one row contains a fully drafted outgoing email — recipient, subject
 * and body — written on a user's behalf. Migration 0017 answers that by
 * building `bo_approvals` without referencing `payload`, `original_payload`,
 * `what`, `why`, `source_label`, `source_id`, `idempotency_key` or
 * `result_ref` at all. Not unprojected: not referenced, so no length, hash or
 * boolean derived from a draft can exist in the view either.
 *
 * This module is bounded by that view and by nothing else it could reach: the
 * foundation's `queryView`/`countView` accept only `BoViewName`, so there is no
 * spelling of a query here that names a base table. Every value below is a
 * count, a status, a timestamp, a duration in seconds, or an error code that
 * already passed through `bo_error_code()` in the database.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Counting happens in Postgres. `countView` issues a `HEAD` request with
 * `count=exact`, which is a real `count(*)` with no row bodies crossing the
 * wire, and `queryViewPage` returns the exact total beside a bounded page.
 * `approval_status` is a single column with seven mutually exclusive members,
 * so a funnel built from seven `count(*)`s is exact arithmetic rather than an
 * estimate, and the seven sum to the cohort.
 *
 * Medians are exact too. PostgREST exposes no `percentile_disc`, but a
 * percentile is just an ordered row at a known offset: count the rows, then ask
 * Postgres to order by the duration and return the single row at that offset.
 * That is `ORDER BY … LIMIT 1 OFFSET n` — one row over the wire, no sampling.
 *
 * There are exactly two places that tally in the application, both deliberate
 * and both labelled on screen:
 *
 *   1. `loadFailureBreakdown` reads a bounded page of failure rows to discover
 *      which codes exist — the code vocabulary is open at the database level,
 *      so there is no fixed list to count against. When that page is the whole
 *      population (the usual case: failures are rare) its tallies *are* exact
 *      and the panel says so; when it is not, every headline number is re-asked
 *      as a `count(*)` and the panel says that instead.
 *
 *   2. `loadRejectionLatency` measures proposal→rejection, which `bo_approvals`
 *      does not expose as a column — `decision_seconds` is defined only for
 *      approvals — so it cannot be ordered in Postgres. It reads a bounded
 *      newest-first sample and reports its size beside the exact total.
 */

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result that carries its own failure, so a panel built from one renders
 * an error state instead of blanking and a single dead view never takes the page
 * down with it.
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
// Sizes and vocabulary
// ===========================================================================

/**
 * Failure rows read to discover the code vocabulary. Large enough that a
 * healthy platform's whole window fits inside it, small enough that a broken
 * one cannot turn a dashboard render into a table scan.
 */
export const FAILURE_SAMPLE_LIMIT = 500

/** Rejected rows read to estimate rejection latency. */
export const REJECTION_SAMPLE_LIMIT = 500

/** Equal slices the window is cut into for the trend panel. */
export const TREND_BUCKETS = 6

/** Shown for a failure recorded without any code at all. */
export const MISSING_FAILURE_CODE = 'kodsuz'

/**
 * How many count queries may be in flight at once.
 *
 * The per-type breakdown fans out to eight exact counts per action type. Firing
 * every one of them at the same moment would queue inside PostgREST's own
 * connection pool anyway, so they are released in bounded waves instead — the
 * page lands in the same time and the database is never handed a burst.
 */
const QUERY_POOL_SIZE = 4

/** Statuses that mean the user answered, in either direction. */
const DECIDED_STATUSES = ['approved', 'executing', 'executed', 'failed', 'rejected'] as const

/** Statuses that mean the user said yes and the work has not finished. */
const ACCEPTED_PENDING_EXECUTION = ['approved', 'executing'] as const

// ===========================================================================
// Scope — the window and filters every aggregate on the page shares
// ===========================================================================

export interface ApprovalWindow {
  key: ApprovalWindowKey
  days: number
  /** Start of the current period. */
  sinceIso: string
  /** Start of the preceding period of exactly the same length. */
  previousSinceIso: string
  /** End of the preceding period, which is the start of the current one. */
  nowIso: string
}

export function resolveApprovalWindow(
  key: ApprovalWindowKey,
  clock: Clock = systemClock,
): ApprovalWindow {
  const days = APPROVAL_WINDOW_DAYS[key]
  const spanMs = days * DAY_MS
  const now = clock.now().getTime()
  return {
    key,
    days,
    sinceIso: new Date(now - spanMs).toISOString(),
    previousSinceIso: new Date(now - 2 * spanMs).toISOString(),
    nowIso: new Date(now).toISOString(),
  }
}

/**
 * What the page is looking at. Every aggregate below is counted over approvals
 * *proposed* inside the window, so the seven status counts describe one cohort
 * and can legitimately be added, subtracted and divided by each other.
 */
export interface ApprovalScope {
  window: ApprovalWindow
  type: ApprovalActionType | null
  source: SourceType | null
}

function scopeFilters(scope: ApprovalScope): ViewFilter<BoApprovalRow>[] {
  const filters: ViewFilter<BoApprovalRow>[] = [
    { column: 'created_at', op: 'gte', value: scope.window.sinceIso },
  ]
  if (scope.type !== null) filters.push({ column: 'type', op: 'eq', value: scope.type })
  if (scope.source !== null) filters.push({ column: 'source_type', op: 'eq', value: scope.source })
  return filters
}

/** The same filters over the preceding period of equal length. */
function previousScopeFilters(scope: ApprovalScope): ViewFilter<BoApprovalRow>[] {
  const filters: ViewFilter<BoApprovalRow>[] = [
    { column: 'created_at', op: 'gte', value: scope.window.previousSinceIso },
    { column: 'created_at', op: 'lt', value: scope.window.sinceIso },
  ]
  if (scope.type !== null) filters.push({ column: 'type', op: 'eq', value: scope.type })
  if (scope.source !== null) filters.push({ column: 'source_type', op: 'eq', value: scope.source })
  return filters
}

function statusFilter(status: string): ViewFilter<BoApprovalRow> {
  return { column: 'status', op: 'eq', value: status }
}

function statusIn(statuses: readonly string[]): ViewFilter<BoApprovalRow> {
  return { column: 'status', op: 'in', value: statuses }
}

function count(filters: readonly ViewFilter<BoApprovalRow>[]): Promise<number> {
  return countView('bo_approvals', filters)
}

/** Runs thunks in bounded waves, preserving order. */
async function pooled<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number = QUERY_POOL_SIZE,
): Promise<T[]> {
  const results: T[] = new Array<T>(tasks.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      const task = tasks[index]
      if (task === undefined) return
      results[index] = await task()
    }
  })
  await Promise.all(workers)
  return results
}

/** A rate as a fraction, or null when there is nothing to divide by. */
function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

// ===========================================================================
// The funnel — eight exact counts over one cohort
// ===========================================================================

export interface ApprovalFunnel {
  /** The cohort: everything proposed inside the window. */
  proposed: number
  pending: number
  /** Pending and past `expires_at` — the sweep has not caught up. */
  overdue: number
  approved: number
  executing: number
  executed: number
  failed: number
  rejected: number
  expired: number
  /** The user answered, either way. */
  decided: number
  /** Rejected over decided. Null when nobody has decided anything yet. */
  rejectionRate: number | null
}

export async function loadApprovalFunnel(scope: ApprovalScope): Promise<ApprovalFunnel> {
  const base = scopeFilters(scope)

  const [pending, overdue, approved, executing, executed, failed, rejected, expired] =
    await Promise.all([
      count([...base, statusFilter('pending')]),
      count([...base, { column: 'is_overdue', op: 'is', value: true }]),
      count([...base, statusFilter('approved')]),
      count([...base, statusFilter('executing')]),
      count([...base, statusFilter('executed')]),
      count([...base, statusFilter('failed')]),
      count([...base, statusFilter('rejected')]),
      count([...base, statusFilter('expired')]),
    ])

  // `approval_status` is one column with seven members, so the cohort is the
  // sum of its parts — no separate total query, and no risk of a total that
  // disagrees with the rows beneath it.
  const decided = approved + executing + executed + failed + rejected
  return {
    proposed: pending + expired + decided,
    pending,
    overdue,
    approved,
    executing,
    executed,
    failed,
    rejected,
    expired,
    decided,
    rejectionRate: rate(rejected, decided),
  }
}

// ===========================================================================
// Per action type — the product signal
// ===========================================================================

export interface ActionTypeStats {
  type: ApprovalActionType
  proposed: number
  pending: number
  /** Approved and executing: the user said yes, the work is not done. */
  accepted: number
  rejected: number
  expired: number
  executed: number
  failed: number
  decided: number
  rejectionRate: number | null
  /** The same rate over the preceding period of equal length. */
  previousRejectionRate: number | null
  previousDecided: number
  /** Change in rejection rate, in fractional points. Null without a baseline. */
  rejectionRateDelta: number | null
}

/**
 * One row per action type that actually has an approval in the window.
 *
 * Two waves. The first asks how many approvals each of the six types proposed;
 * the second only asks the eight follow-up questions — six statuses now, plus
 * rejections and decisions over the preceding period — for types where the
 * answer was not zero. On a platform where three of the six types are in use
 * that is 30 exact counts instead of 48, and a type nobody triggers costs one
 * `HEAD` request rather than eight.
 */
export async function loadActionTypeStats(
  scope: ApprovalScope,
): Promise<readonly ActionTypeStats[]> {
  const base = scopeFilters(scope)
  const candidates =
    scope.type === null ? APPROVAL_ACTION_TYPES : ([scope.type] as readonly ApprovalActionType[])

  const totals = await pooled(
    candidates.map((type) => () => count([...base, { column: 'type', op: 'eq', value: type }])),
  )

  const present = candidates
    .map((type, index) => ({ type, proposed: totals[index] ?? 0 }))
    .filter((entry) => entry.proposed > 0)

  return pooled(
    present.map((entry) => () => loadOneActionType(scope, entry.type, entry.proposed)),
    2,
  )
}

async function loadOneActionType(
  scope: ApprovalScope,
  type: ApprovalActionType,
  proposed: number,
): Promise<ActionTypeStats> {
  const typeFilter: ViewFilter<BoApprovalRow> = { column: 'type', op: 'eq', value: type }
  const base = [...scopeFilters(scope), typeFilter]
  const previous = [...previousScopeFilters(scope), typeFilter]

  const [pending, accepted, rejected, expired, executed, failed, prevRejected, prevDecided] =
    await Promise.all([
      count([...base, statusFilter('pending')]),
      count([...base, statusIn(ACCEPTED_PENDING_EXECUTION)]),
      count([...base, statusFilter('rejected')]),
      count([...base, statusFilter('expired')]),
      count([...base, statusFilter('executed')]),
      count([...base, statusFilter('failed')]),
      count([...previous, statusFilter('rejected')]),
      count([...previous, statusIn(DECIDED_STATUSES)]),
    ])

  const decided = accepted + executed + failed + rejected
  const rejectionRate = rate(rejected, decided)
  const previousRejectionRate = rate(prevRejected, prevDecided)

  return {
    type,
    proposed,
    pending,
    accepted,
    rejected,
    expired,
    executed,
    failed,
    decided,
    rejectionRate,
    previousRejectionRate,
    previousDecided: prevDecided,
    rejectionRateDelta:
      rejectionRate === null || previousRejectionRate === null
        ? null
        : rejectionRate - previousRejectionRate,
  }
}

// ===========================================================================
// Over time — the window cut into equal slices
// ===========================================================================

export interface ApprovalTrendBucket {
  startIso: string
  endIso: string
  proposed: number
  rejected: number
  /** Share of this slice's proposals that were rejected. */
  rejectedShare: number | null
  /** The slice that is still filling up. Its share is not final. */
  open: boolean
}

/**
 * Proposal volume and rejections per slice, both counted by Postgres.
 *
 * The denominator here is proposals rather than decisions, because a slice is a
 * calendar range and its most recent members may still be pending — dividing by
 * decisions would make the last slice jump around as they land. The headline
 * rejection rate, which does divide by decisions, lives in the funnel and in the
 * per-type table where the cohort is complete enough to mean it.
 */
export async function loadApprovalTrend(
  scope: ApprovalScope,
): Promise<readonly ApprovalTrendBucket[]> {
  const spanMs = scope.window.days * DAY_MS
  const bucketMs = spanMs / TREND_BUCKETS
  const startMs = new Date(scope.window.sinceIso).getTime()

  const bounds = Array.from({ length: TREND_BUCKETS }, (_unused, index) => {
    const from = startMs + index * bucketMs
    const to = index === TREND_BUCKETS - 1 ? startMs + spanMs : from + bucketMs
    return { startIso: new Date(from).toISOString(), endIso: new Date(to).toISOString() }
  })

  const scoped: ViewFilter<BoApprovalRow>[] = []
  if (scope.type !== null) scoped.push({ column: 'type', op: 'eq', value: scope.type })
  if (scope.source !== null) scoped.push({ column: 'source_type', op: 'eq', value: scope.source })

  const tasks = bounds.flatMap((bound) => {
    const range: ViewFilter<BoApprovalRow>[] = [
      ...scoped,
      { column: 'created_at', op: 'gte', value: bound.startIso },
      { column: 'created_at', op: 'lt', value: bound.endIso },
    ]
    return [() => count(range), () => count([...range, statusFilter('rejected')])]
  })

  const values = await pooled(tasks)

  return bounds.map((bound, index) => {
    const proposed = values[index * 2] ?? 0
    const rejected = values[index * 2 + 1] ?? 0
    return {
      startIso: bound.startIso,
      endIso: bound.endIso,
      proposed,
      rejected,
      rejectedShare: rate(rejected, proposed),
      open: index === TREND_BUCKETS - 1,
    }
  })
}

// ===========================================================================
// Timings
// ===========================================================================

/** A duration column, summarised by Postgres. */
export interface DurationSummary {
  /** Rows that actually have the duration. Exact. */
  count: number
  medianSeconds: number | null
  p90Seconds: number | null
}

type DurationColumn = 'decision_seconds' | 'execution_seconds'

/**
 * The row at a given rank, ordered by the duration.
 *
 * This is `percentile_disc` by hand: the value is a real row's value, chosen by
 * an `ORDER BY … OFFSET n LIMIT 1` that Postgres evaluates. Nothing is averaged
 * and nothing is sampled; exactly one row comes back.
 */
async function rankedDuration(
  column: DurationColumn,
  filters: readonly ViewFilter<BoApprovalRow>[],
  total: number,
  fraction: number,
): Promise<number | null> {
  if (total <= 0) return null
  const offset = Math.min(total - 1, Math.max(0, Math.floor((total - 1) * fraction)))
  const row = await queryViewOne('bo_approvals', {
    columns: [column],
    filters,
    order: { column, ascending: true },
    offset,
  })
  return row?.[column] ?? null
}

async function summariseDuration(
  column: DurationColumn,
  scope: ApprovalScope,
): Promise<DurationSummary> {
  // `>= 0` is how "this duration exists" is expressed: SQL evaluates `null >= 0`
  // as unknown, so a row without the timestamp pair is excluded by the same
  // predicate that excludes a nonsensical negative one.
  const filters = [...scopeFilters(scope), { column, op: 'gte' as const, value: 0 }]
  const total = await count(filters)
  const [medianSeconds, p90Seconds] = await Promise.all([
    rankedDuration(column, filters, total, 0.5),
    rankedDuration(column, filters, total, 0.9),
  ])
  return { count: total, medianSeconds, p90Seconds }
}

/** Proposal → approval, and approval → execution. Both exact. */
export async function loadDurationSummaries(scope: ApprovalScope): Promise<{
  decision: DurationSummary
  execution: DurationSummary
}> {
  const [decision, execution] = await Promise.all([
    summariseDuration('decision_seconds', scope),
    summariseDuration('execution_seconds', scope),
  ])
  return { decision, execution }
}

/** A duration measured in the application, with the honesty that requires. */
export interface SampledDuration {
  /** Rows read. */
  sampled: number
  /** Rows that exist, counted by Postgres. */
  total: number
  truncated: boolean
  medianSeconds: number | null
  p90Seconds: number | null
}

/**
 * Proposal → rejection.
 *
 * `bo_approvals` computes `decision_seconds` only for approvals — it is
 * `approved_at - created_at` — so the rejection half of "time to decision" is
 * derived here from the two timestamps the view does expose rather than by
 * widening the view, which would be a schema change for a display detail. The
 * cost is that it cannot be ordered in Postgres: it is measured over a bounded
 * newest-first page and reported beside the exact total, so a partial sample is
 * shown as partial rather than presented as a fact.
 */
export async function loadRejectionLatency(scope: ApprovalScope): Promise<SampledDuration> {
  const page = await queryViewPage('bo_approvals', {
    columns: ['created_at', 'rejected_at'],
    filters: [...scopeFilters(scope), statusFilter('rejected')],
    order: { column: 'rejected_at', ascending: false },
    limit: REJECTION_SAMPLE_LIMIT,
  })

  const seconds: number[] = []
  for (const row of page.rows) {
    if (row.rejected_at === null) continue
    const delta = (new Date(row.rejected_at).getTime() - new Date(row.created_at).getTime()) / 1000
    if (Number.isFinite(delta) && delta >= 0) seconds.push(delta)
  }
  seconds.sort((left, right) => left - right)

  return {
    sampled: page.rows.length,
    total: page.total,
    truncated: page.total > page.rows.length,
    medianSeconds: rankOf(seconds, 0.5),
    p90Seconds: rankOf(seconds, 0.9),
  }
}

function rankOf(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))
  return sorted[index] ?? null
}

// ===========================================================================
// Failures, by code
// ===========================================================================

export interface FailureCodeStats {
  code: string
  count: number
  /** Rows that have spent every retry the domain allows. */
  exhausted: number
  maxAttempts: number
  lastSeenAt: string | null
  /** The action type this code hits most often, from the rows that were read. */
  topType: string | null
  typeCount: number
}

export interface FailureBreakdown {
  rows: readonly FailureCodeStats[]
  /** Failure rows read. */
  sampled: number
  /** Failure rows in the window, counted by Postgres. */
  total: number
  /**
   * True when the read did not cover the whole window. When false the tallies
   * below are not a sample at all — they are the population.
   */
  truncated: boolean
}

function codeFilter(code: string): ViewFilter<BoApprovalRow> {
  return code === MISSING_FAILURE_CODE
    ? { column: 'failure_code', op: 'is', value: null }
    : { column: 'failure_code', op: 'eq', value: code }
}

interface CodeTally {
  code: string
  count: number
  exhausted: number
  maxAttempts: number
  lastSeenAt: string | null
  types: Map<string, number>
}

/**
 * Failure codes in the window, worst first.
 *
 * The code vocabulary is open at the database level — `bo_error_code()` passes
 * through any token-shaped label a provider produced, plus the literal
 * `unstructured` — so there is no fixed list to run `count(*)` against. One
 * bounded read discovers which codes exist; if it covered everything, its
 * tallies are exact by construction. If it did not, the headline count and the
 * exhausted count for each surfaced code are re-asked as real `count(*)`s, and
 * the caller is told the sample was partial so the screen can say so.
 */
export async function loadFailureBreakdown(
  scope: ApprovalScope,
  limit: number = DASHBOARD_CODE_LIMIT,
): Promise<FailureBreakdown> {
  const base = [...scopeFilters(scope), statusFilter('failed')]

  const page = await queryViewPage('bo_approvals', {
    columns: ['failure_code', 'attempt_count', 'type', 'updated_at'],
    filters: base,
    order: { column: 'updated_at', ascending: false },
    limit: FAILURE_SAMPLE_LIMIT,
  })

  const tally = new Map<string, CodeTally>()
  for (const row of page.rows) {
    const code = row.failure_code ?? MISSING_FAILURE_CODE
    const entry: CodeTally = tally.get(code) ?? {
      code,
      count: 0,
      exhausted: 0,
      maxAttempts: 0,
      lastSeenAt: null,
      types: new Map<string, number>(),
    }
    entry.count += 1
    if (row.attempt_count >= MAX_APPROVAL_ATTEMPTS) entry.exhausted += 1
    entry.maxAttempts = Math.max(entry.maxAttempts, row.attempt_count)
    // Rows arrive newest first, so the first sighting of a code is its latest.
    entry.lastSeenAt ??= row.updated_at
    entry.types.set(row.type, (entry.types.get(row.type) ?? 0) + 1)
    tally.set(code, entry)
  }

  const ordered = [...tally.values()]
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code, 'tr-TR'))
    .slice(0, limit)

  const truncated = page.total > page.rows.length

  const exact = truncated
    ? await pooled(
        ordered.flatMap((entry) => [
          () => count([...base, codeFilter(entry.code)]),
          () =>
            count([
              ...base,
              codeFilter(entry.code),
              { column: 'attempt_count', op: 'gte', value: MAX_APPROVAL_ATTEMPTS },
            ]),
        ]),
      )
    : []

  const rows = ordered.map((entry, index) => {
    const topType = [...entry.types.entries()].sort((left, right) => right[1] - left[1])[0]
    return {
      code: entry.code,
      count: truncated ? (exact[index * 2] ?? entry.count) : entry.count,
      exhausted: truncated ? (exact[index * 2 + 1] ?? entry.exhausted) : entry.exhausted,
      maxAttempts: entry.maxAttempts,
      lastSeenAt: entry.lastSeenAt,
      topType: topType?.[0] ?? null,
      typeCount: entry.types.size,
    }
  })

  return { rows, sampled: page.rows.length, total: page.total, truncated }
}

// ===========================================================================
// Row lists
// ===========================================================================

/**
 * Proposals the user has not answered, most urgent first.
 *
 * "Most urgent" is overdue before not-overdue, then soonest to expire, both
 * `ORDER BY` in Postgres. An overdue proposal is one the expiry sweep should
 * already have closed, so a queue that is full of them is a broken cron rather
 * than a slow user.
 */
export async function loadPendingQueue(
  scope: ApprovalScope,
  limit: number,
): Promise<ViewPage<BoApprovalRow>> {
  return queryViewPage('bo_approvals', {
    filters: [...scopeFilters(scope), statusFilter('pending')],
    order: [
      { column: 'is_overdue', ascending: false },
      { column: 'expires_at', ascending: true },
    ],
    limit,
  })
}

export interface FailedApprovalQuery {
  scope: ApprovalScope
  code: string | null
  limit: number
  offset: number
}

/**
 * Failed executions, most-attempted first, then most recently touched. A row
 * that has burned every retry outranks one that failed once this morning.
 */
export async function loadFailedApprovals(
  query: FailedApprovalQuery,
): Promise<ViewPage<BoApprovalRow>> {
  const filters = [...scopeFilters(query.scope), statusFilter('failed')]
  if (query.code !== null) filters.push(codeFilter(query.code))

  return queryViewPage('bo_approvals', {
    filters,
    order: [
      { column: 'attempt_count', ascending: false },
      { column: 'updated_at', ascending: false },
    ],
    limit: query.limit,
    offset: query.offset,
  })
}
