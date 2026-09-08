import 'server-only'

import {
  DAY_MS,
  EXPORT_STATUSES,
  HOUR_MS,
  RETENTION_DAYS,
  RETENTION_SWEEP,
  isAppError,
  systemClock,
  type Clock,
  type ExportStatus,
} from '@da/domain'
import {
  countView,
  queryView,
  queryViewOne,
  queryViewPage,
  type BoAuditRow,
  type BoPrivacyRequestRow,
  type BoUserRow,
  type ViewFilter,
  type ViewPage,
} from '@/lib/db'
import { messages } from '@/lib/messages'
import {
  DUE_SOON_DAYS,
  OPEN_EXPORT_STATUSES,
  PRIVACY_WINDOW_DAYS,
  RERUN_AUDIT_ACTION,
  RERUN_DEDUPE_MINUTES,
  STATUTORY_DAYS,
  STUCK_HOURS,
  SWEEP_GRACE_HOURS,
  SWEEP_INTERVAL_HOURS,
  type DeadlineBucket,
  type PrivacyWindowKey,
} from '@/components/privacy/contract'

/**
 * Every query the privacy area makes.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE MAY SEE
 * ---------------------------------------------------------------------------
 *
 * `data_export_requests.storage_path` is the object key of an archive holding a
 * user's entire mailbox, calendar, contacts and assistant history in one JSON
 * file. It is the single most dangerous column in the schema for a support
 * tool, because unlike a table it is one signed URL away from being readable.
 *
 * Migration 0017 answers that by building `bo_privacy_requests` without
 * referencing `storage_path` at all — not unprojected, not referenced — so no
 * query written here can produce a path, and no operator can construct a link
 * to an archive from this tool. `has_artifact` is inferred from `status` and
 * `size_bytes` instead, which is enough to answer "did the file get built" and
 * not enough to open it.
 *
 * Everything below is therefore a count, a status, a timestamp, a duration or
 * an error code that already passed through `bo_error_code()` in the database.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Counting happens in Postgres. `countView` issues a HEAD request with
 * `count=exact` — a real `count(*)` with no row bodies crossing the wire — and
 * `queryViewPage` returns the exact total beside a bounded page. Percentiles are
 * `ORDER BY … LIMIT 1 OFFSET n`, which is `percentile_disc` by hand: one real
 * row's value, never an average and never a sample.
 *
 * Two places do arithmetic in the application, both on exact counts rather than
 * on rows: the status breakdown adds five mutually exclusive `count(*)`s to get
 * its total, and the retention sweep's audit arrears subtracts one exact count
 * from another. Neither fetches a row to measure it.
 *
 * The one place that reads rows to derive a number is `loadSweepRuns`, which
 * computes the gap between consecutive sweeps — a per-row difference of two
 * adjacent timestamps, which is not an aggregate and has no SQL equivalent
 * reachable through PostgREST.
 */

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result carrying its own failure, so a panel built from one renders an
 * error state instead of blanking and a single dead view never takes the page
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

/** How many queries may be in flight at once, so a page never bursts the pool. */
const QUERY_POOL_SIZE = 4

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

// ===========================================================================
// Time
// ===========================================================================

export interface PrivacyWindow {
  key: PrivacyWindowKey
  days: number
  sinceIso: string
  nowIso: string
}

export function resolvePrivacyWindow(
  key: PrivacyWindowKey,
  clock: Clock = systemClock,
): PrivacyWindow {
  const days = PRIVACY_WINDOW_DAYS[key]
  const now = clock.now().getTime()
  return {
    key,
    days,
    sinceIso: new Date(now - days * DAY_MS).toISOString(),
    nowIso: new Date(now).toISOString(),
  }
}

/**
 * The three instants every deadline question is asked against.
 *
 * `deadlineIso` is 30 days ago: a request created before it has passed the
 * statutory limit. `dueSoonIso` is 23 days ago, the point at which fewer than
 * seven days remain. `stuckIso` is six hours ago.
 */
export interface DeadlineClock {
  nowIso: string
  deadlineIso: string
  dueSoonIso: string
  stuckIso: string
}

export function resolveDeadlineClock(clock: Clock = systemClock): DeadlineClock {
  const now = clock.now().getTime()
  return {
    nowIso: new Date(now).toISOString(),
    deadlineIso: new Date(now - STATUTORY_DAYS * DAY_MS).toISOString(),
    dueSoonIso: new Date(now - (STATUTORY_DAYS - DUE_SOON_DAYS) * DAY_MS).toISOString(),
    stuckIso: new Date(now - STUCK_HOURS * HOUR_MS).toISOString(),
  }
}

/** Hours from an instant until now, or null when there is no instant. */
export function hoursSince(iso: string | null, clock: Clock = systemClock): number | null {
  if (iso === null) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, (clock.now().getTime() - then) / HOUR_MS)
}

// ===========================================================================
// Filters
// ===========================================================================

type RequestFilter = ViewFilter<BoPrivacyRequestRow>

function openFilter(): RequestFilter {
  return { column: 'status', op: 'in', value: OPEN_EXPORT_STATUSES }
}

function requestCount(filters: readonly RequestFilter[]): Promise<number> {
  return countView('bo_privacy_requests', filters)
}

/** Turns a deadline bucket into a date range over `requested_at`. */
export function deadlineFilters(
  bucket: DeadlineBucket,
  deadlineClock: DeadlineClock,
): readonly RequestFilter[] {
  switch (bucket) {
    case 'gecikmis':
      return [{ column: 'requested_at', op: 'lt', value: deadlineClock.deadlineIso }]
    case 'yaklasan':
      return [
        { column: 'requested_at', op: 'gte', value: deadlineClock.deadlineIso },
        { column: 'requested_at', op: 'lt', value: deadlineClock.dueSoonIso },
      ]
    case 'normal':
      return [{ column: 'requested_at', op: 'gte', value: deadlineClock.dueSoonIso }]
    default:
      return []
  }
}

// ===========================================================================
// The statutory counters
// ===========================================================================

export interface DeadlineCounters {
  /** Requests the user is still waiting on. */
  open: number
  /** Open and already past 30 days. */
  overdue: number
  /** Open with fewer than seven days left. */
  dueSoon: number
  /**
   * Open and older than the build ever takes. `data-export-request` writes the
   * archive inside the request that created the row, so one still in
   * `requested` or `processing` six hours later did not fail slowly — it died
   * mid-build, and nothing in the system will move it again on its own.
   */
  stuck: number
}

export async function loadDeadlineCounters(
  deadlineClock: DeadlineClock,
): Promise<DeadlineCounters> {
  const open = [openFilter()]
  const [openCount, overdue, dueSoon, stuck] = await Promise.all([
    requestCount(open),
    requestCount([...open, ...deadlineFilters('gecikmis', deadlineClock)]),
    requestCount([...open, ...deadlineFilters('yaklasan', deadlineClock)]),
    requestCount([...open, { column: 'requested_at', op: 'lt', value: deadlineClock.stuckIso }]),
  ])
  return { open: openCount, overdue, dueSoon, stuck }
}

// ===========================================================================
// Status breakdown
// ===========================================================================

export interface StatusCount {
  status: ExportStatus
  count: number
  /** Share of the window's requests, or null when the window is empty. */
  share: number | null
}

export interface StatusBreakdown {
  rows: readonly StatusCount[]
  total: number
  failed: number
}

/**
 * One exact `count(*)` per `export_status` member over the window.
 *
 * `export_status` is a single column with five mutually exclusive members, so
 * the five counts describe one cohort and their sum is the window's total — no
 * separate total query, and no risk of a total that disagrees with the rows
 * beneath it.
 */
export async function loadStatusBreakdown(window: PrivacyWindow): Promise<StatusBreakdown> {
  const base: RequestFilter[] = [{ column: 'requested_at', op: 'gte', value: window.sinceIso }]

  const counts = await pooled(
    EXPORT_STATUSES.map(
      (status) => () => requestCount([...base, { column: 'status', op: 'eq', value: status }]),
    ),
  )

  const total = counts.reduce((sum, value) => sum + value, 0)
  const rows = EXPORT_STATUSES.map((status, index) => {
    const count = counts[index] ?? 0
    return { status, count, share: total > 0 ? count / total : null }
  })

  const failed = rows.find((row) => row.status === 'failed')?.count ?? 0
  return { rows, total, failed }
}

// ===========================================================================
// Fulfilment
// ===========================================================================

export interface FulfilmentSummary {
  /** Requests in the window that actually reached `ready`. Exact. */
  completed: number
  medianMinutes: number | null
  p90Minutes: number | null
  /**
   * Rows still marked `ready` whose download window has closed. The 03:45 UTC
   * `da_export_cleanup` job should have flipped them to `expired`, so a number
   * here is a stalled cron rather than a stalled export.
   */
  staleReady: number
  /** Archives whose link has expired, across all time. */
  expiredTotal: number
}

/**
 * The row at a given rank, ordered by fulfilment time.
 *
 * `percentile_disc` by hand: the value is a real row's value chosen by an
 * `ORDER BY … OFFSET n LIMIT 1` that Postgres evaluates. Exactly one row comes
 * back, nothing is averaged and nothing is sampled.
 */
async function rankedFulfilment(
  filters: readonly RequestFilter[],
  total: number,
  fraction: number,
): Promise<number | null> {
  if (total <= 0) return null
  const offset = Math.min(total - 1, Math.max(0, Math.floor((total - 1) * fraction)))
  const row = await queryViewOne('bo_privacy_requests', {
    columns: ['fulfilment_minutes'],
    filters,
    order: { column: 'fulfilment_minutes', ascending: true },
    offset,
  })
  return row?.fulfilment_minutes ?? null
}

export async function loadFulfilment(window: PrivacyWindow): Promise<FulfilmentSummary> {
  // `>= 0` is how "this duration exists" is expressed: SQL evaluates `null >= 0`
  // as unknown, so a request that never became ready is excluded by the same
  // predicate that excludes a nonsensical negative one.
  const filters: RequestFilter[] = [
    { column: 'requested_at', op: 'gte', value: window.sinceIso },
    { column: 'fulfilment_minutes', op: 'gte', value: 0 },
  ]

  const completed = await requestCount(filters)
  const [medianMinutes, p90Minutes, staleReady, expiredTotal] = await Promise.all([
    rankedFulfilment(filters, completed, 0.5),
    rankedFulfilment(filters, completed, 0.9),
    requestCount([
      { column: 'status', op: 'eq', value: 'ready' },
      { column: 'is_expired', op: 'is', value: true },
    ]),
    requestCount([{ column: 'status', op: 'eq', value: 'expired' }]),
  ])

  return { completed, medianMinutes, p90Minutes, staleReady, expiredTotal }
}

// ===========================================================================
// Row lists
// ===========================================================================

/** Open requests, oldest first — which is deadline order. */
export function loadDeadlineBoard(limit: number): Promise<ViewPage<BoPrivacyRequestRow>> {
  return queryViewPage('bo_privacy_requests', {
    filters: [openFilter()],
    order: { column: 'requested_at', ascending: true },
    limit,
  })
}

export interface RequestQueueQuery {
  status: ExportStatus | null
  deadline: DeadlineBucket | null
  deadlineClock: DeadlineClock
  limit: number
  offset: number
}

export function loadRequestQueue(query: RequestQueueQuery): Promise<ViewPage<BoPrivacyRequestRow>> {
  const filters: RequestFilter[] = []
  if (query.status !== null) filters.push({ column: 'status', op: 'eq', value: query.status })
  if (query.deadline !== null) {
    filters.push(...deadlineFilters(query.deadline, query.deadlineClock))
  }

  return queryViewPage('bo_privacy_requests', {
    filters,
    order: { column: 'requested_at', ascending: true },
    limit: query.limit,
    offset: query.offset,
  })
}

/** One request, or null. Used by the re-run action to re-check eligibility. */
export function findPrivacyRequest(requestId: string): Promise<BoPrivacyRequestRow | null> {
  return queryViewOne('bo_privacy_requests', {
    filters: [{ column: 'request_id', op: 'eq', value: requestId }],
  })
}

// ===========================================================================
// Re-run orders
//
// A re-run order is an `audit_logs` row, so the record of it is read back out
// of `bo_audit` rather than kept anywhere else. That means the state a table
// shows is the same state `/denetim` shows, and neither can drift.
// ===========================================================================

export interface RerunOrder {
  requestId: string
  staffUserId: string | null
  staffRole: string | null
  reason: string | null
  orderedAt: string
}

function toRerunOrder(row: BoAuditRow): RerunOrder | null {
  if (row.entity_id === null) return null
  return {
    requestId: row.entity_id,
    staffUserId: row.staff_user_id,
    staffRole: row.staff_role,
    reason: row.staff_reason,
    orderedAt: row.created_at,
  }
}

/**
 * The most recent order against each of the given requests.
 *
 * One query for the whole page rather than one per row: PostgREST's `in`
 * filter takes the visible ids, and rows arrive newest first so the first
 * sighting of an id is its latest order.
 */
export async function loadRerunOrders(
  requestIds: readonly string[],
): Promise<ReadonlyMap<string, RerunOrder>> {
  const orders = new Map<string, RerunOrder>()
  if (requestIds.length === 0) return orders

  const rows = await queryView('bo_audit', {
    filters: [
      { column: 'action', op: 'eq', value: RERUN_AUDIT_ACTION },
      { column: 'entity_id', op: 'in', value: requestIds },
    ],
    order: { column: 'created_at', ascending: false },
    // Every order for every visible row would still fit comfortably; the bound
    // is here so a request ordered a hundred times cannot widen the read.
    limit: Math.min(requestIds.length * 4, 200),
  })

  for (const row of rows) {
    const order = toRerunOrder(row)
    if (order === null || orders.has(order.requestId)) continue
    orders.set(order.requestId, order)
  }
  return orders
}

/**
 * Whether an order already stands on this request.
 *
 * Each order eventually causes a full archive rebuild of somebody's mailbox, so
 * a second operator picking up the same ticket is told one exists rather than
 * silently doubling it.
 */
export async function hasRecentRerunOrder(
  requestId: string,
  clock: Clock = systemClock,
): Promise<boolean> {
  const since = new Date(clock.now().getTime() - RERUN_DEDUPE_MINUTES * 60_000).toISOString()
  const count = await countView('bo_audit', [
    { column: 'action', op: 'eq', value: RERUN_AUDIT_ACTION },
    { column: 'entity_id', op: 'eq', value: requestId },
    { column: 'created_at', op: 'gte', value: since },
  ])
  return count > 0
}

// ===========================================================================
// Deletion
//
// Deletion is the user's own action and leaves no user id behind: the
// `delete-account` function writes its audit row with a null user id on purpose,
// so the record outlives the account it describes. That makes deletion
// countable and dateable here, and deliberately not attributable — which is the
// correct shape for a record of an erasure.
// ===========================================================================

const ACCOUNT_DELETED_ACTION = 'privacy.account_deleted'
const HISTORY_DELETED_ACTION = 'privacy.history_deleted'

export interface DeletionCounters {
  accountLast24h: number
  accountInWindow: number
  accountTotal: number
  historyInWindow: number
  historyTotal: number
  /** Profiles carrying a deletion mark whose row is still present. */
  markedTotal: number
}

export async function loadDeletionCounters(
  window: PrivacyWindow,
  clock: Clock = systemClock,
): Promise<DeletionCounters> {
  const dayAgo = new Date(clock.now().getTime() - DAY_MS).toISOString()
  const action = (value: string): ViewFilter<BoAuditRow> => ({
    column: 'action',
    op: 'eq',
    value,
  })

  const [
    accountLast24h,
    accountInWindow,
    accountTotal,
    historyInWindow,
    historyTotal,
    markedTotal,
  ] = await Promise.all([
    countView('bo_audit', [
      action(ACCOUNT_DELETED_ACTION),
      { column: 'created_at', op: 'gte', value: dayAgo },
    ]),
    countView('bo_audit', [
      action(ACCOUNT_DELETED_ACTION),
      { column: 'created_at', op: 'gte', value: window.sinceIso },
    ]),
    countView('bo_audit', [action(ACCOUNT_DELETED_ACTION)]),
    countView('bo_audit', [
      action(HISTORY_DELETED_ACTION),
      { column: 'created_at', op: 'gte', value: window.sinceIso },
    ]),
    countView('bo_audit', [action(HISTORY_DELETED_ACTION)]),
    countView('bo_users', [{ column: 'is_deleted', op: 'is', value: true }]),
  ])

  return {
    accountLast24h,
    accountInWindow,
    accountTotal,
    historyInWindow,
    historyTotal,
    markedTotal,
  }
}

/** The most recent erasure events, newest first. */
export function loadDeletionEvents(limit: number): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [
      {
        column: 'action',
        op: 'in',
        value: [ACCOUNT_DELETED_ACTION, HISTORY_DELETED_ACTION],
      },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  })
}

/**
 * Accounts marked deleted whose profile row is still there.
 *
 * `delete-account` removes the auth user and lets the cascade clear every
 * table, so a lingering mark means the cascade did not happen — a deletion that
 * reported success and did not finish.
 */
export function loadDeletionMarks(limit: number): Promise<ViewPage<BoUserRow>> {
  return queryViewPage('bo_users', {
    filters: [{ column: 'is_deleted', op: 'is', value: true }],
    order: { column: 'deleted_at', ascending: false },
    limit,
  })
}

// ===========================================================================
// Retention sweep health
// ===========================================================================

const SWEEP_ACTION = 'retention.swept'

export interface SweepRun {
  auditId: string
  ranAt: string
  /** Hours since the previous run, or null for the oldest row read. */
  gapHours: number | null
  late: boolean
  metadataKeys: readonly string[]
}

export interface SweepHealth {
  runs: readonly SweepRun[]
  lastRunAt: string | null
  hoursSinceLastRun: number | null
  /** True when the last run is older than the schedule plus its grace. */
  late: boolean
  /** Runs recorded in the last seven days. */
  runsLast7d: number
  expectedLast7d: number
}

/**
 * The sweep's own record of itself.
 *
 * Only the `retention-cleanup` edge function writes this row. Where `pg_net` is
 * unavailable, migration 0014 runs `cleanup_expired_retention()` directly in
 * SQL and leaves no row at all — so an empty history is not proof the sweep
 * never ran, and the arrears measured below are the stronger evidence. The page
 * says so rather than implying an outage.
 */
export async function loadSweepHealth(
  limit: number,
  clock: Clock = systemClock,
): Promise<SweepHealth> {
  const weekAgo = new Date(clock.now().getTime() - 7 * DAY_MS).toISOString()

  const [rows, runsLast7d] = await Promise.all([
    queryView('bo_audit', {
      filters: [{ column: 'action', op: 'eq', value: SWEEP_ACTION }],
      order: { column: 'created_at', ascending: false },
      limit,
    }),
    countView('bo_audit', [
      { column: 'action', op: 'eq', value: SWEEP_ACTION },
      { column: 'created_at', op: 'gte', value: weekAgo },
    ]),
  ])

  const lateAfterHours = SWEEP_INTERVAL_HOURS + SWEEP_GRACE_HOURS

  const runs: SweepRun[] = rows.map((row, index) => {
    const previous = rows[index + 1]
    const gapHours =
      previous === undefined
        ? null
        : (new Date(row.created_at).getTime() - new Date(previous.created_at).getTime()) / HOUR_MS
    return {
      auditId: row.audit_id,
      ranAt: row.created_at,
      gapHours,
      late: gapHours !== null && gapHours > lateAfterHours,
      metadataKeys: row.metadata_keys ?? [],
    }
  })

  const lastRunAt = runs[0]?.ranAt ?? null
  const sinceLast = hoursSince(lastRunAt, clock)

  return {
    runs,
    lastRunAt,
    hoursSinceLastRun: sinceLast,
    late: sinceLast !== null && sinceLast > lateAfterHours,
    runsLast7d,
    expectedLast7d: Math.round((7 * 24) / SWEEP_INTERVAL_HOURS),
  }
}

/**
 * The longest retention window a user can choose that still deletes anything.
 * Rows older than this can only survive legitimately under `forever`.
 */
export const MAX_FINITE_RETENTION_DAYS = Object.values(RETENTION_DAYS).reduce<number>(
  (longest, days) => (days === null ? longest : Math.max(longest, days)),
  0,
)

/** What an arrears count counts. A view of daily aggregates has no row count. */
export type ArrearsUnit = 'rows' | 'dayGroups'

export interface RetentionTableHealth {
  table: string
  /** The column the sweep ages the table by. */
  column: string
  /** Fixed window in days, or null when the user's preference decides. */
  fixedDays: number | null
  /** True for a table the sweep anonymises rather than deletes. */
  anonymises: boolean
  /** The `bo_*` view this row is measured through, or null when there is none. */
  observer: string | null
  unit: ArrearsUnit | null
  /** Days past which nothing should remain. */
  horizonDays: number
  /** Records still present beyond the horizon, or null when unobservable. */
  arrears: number | null
  /**
   * True when a non-zero `arrears` proves the sweep is behind. False for a
   * user-preference table, where rows beyond the horizon may belong to accounts
   * that chose to keep everything.
   */
  conclusive: boolean
  /** Oldest record still present, as an instant or a date. */
  oldestRemaining: string | null
}

interface ObservationResult {
  arrears: number
  oldestRemaining: string | null
}

/** Requests older than their fixed 30-day window. Should always be zero. */
async function observeExportRequests(cutoffIso: string): Promise<ObservationResult> {
  const [arrears, oldest] = await Promise.all([
    requestCount([{ column: 'requested_at', op: 'lt', value: cutoffIso }]),
    queryViewOne('bo_privacy_requests', {
      columns: ['requested_at'],
      order: { column: 'requested_at', ascending: true },
    }),
  ])
  return { arrears, oldestRemaining: oldest?.requested_at ?? null }
}

/** Approvals older than their fixed 365-day window. Should always be zero. */
async function observeApprovals(cutoffIso: string): Promise<ObservationResult> {
  const [arrears, oldest] = await Promise.all([
    countView('bo_approvals', [{ column: 'created_at', op: 'lt', value: cutoffIso }]),
    queryViewOne('bo_approvals', {
      columns: ['created_at'],
      order: { column: 'created_at', ascending: true },
    }),
  ])
  return { arrears, oldestRemaining: oldest?.created_at ?? null }
}

/**
 * Audit rows past 400 days that still carry metadata.
 *
 * The sweep anonymises these rather than deleting them: it nulls `entity_id`
 * and empties `metadata`, which leaves `metadata_keys` null in the view. So the
 * arrears are the rows beyond the horizon minus the rows already emptied —
 * two exact `count(*)`s, subtracted.
 */
async function observeAuditLogs(cutoffIso: string): Promise<ObservationResult> {
  const beyond: ViewFilter<BoAuditRow>[] = [{ column: 'created_at', op: 'lt', value: cutoffIso }]
  const [total, anonymised, oldest] = await Promise.all([
    countView('bo_audit', beyond),
    countView('bo_audit', [...beyond, { column: 'metadata_keys', op: 'is', value: null }]),
    queryViewOne('bo_audit', {
      columns: ['created_at'],
      order: { column: 'created_at', ascending: true },
    }),
  ])
  return { arrears: Math.max(0, total - anonymised), oldestRemaining: oldest?.created_at ?? null }
}

/** Briefing day-groups beyond the longest finite retention window. */
async function observeBriefings(cutoffDate: string): Promise<ObservationResult> {
  const [arrears, oldest] = await Promise.all([
    countView('bo_briefing_health', [{ column: 'for_date', op: 'lt', value: cutoffDate }]),
    queryViewOne('bo_briefing_health', {
      columns: ['for_date'],
      order: { column: 'for_date', ascending: true },
    }),
  ])
  return { arrears, oldestRemaining: oldest?.for_date ?? null }
}

/** Capture day-groups beyond the longest finite retention window. */
async function observeCaptures(cutoffDate: string): Promise<ObservationResult> {
  const [arrears, oldest] = await Promise.all([
    countView('bo_capture_health', [{ column: 'capture_date', op: 'lt', value: cutoffDate }]),
    queryViewOne('bo_capture_health', {
      columns: ['capture_date'],
      order: { column: 'capture_date', ascending: true },
    }),
  ])
  return { arrears, oldestRemaining: oldest?.capture_date ?? null }
}

/**
 * How each swept table is observed, if at all.
 *
 * The five entries here are every table in `RETENTION_SWEEP` that a `bo_*` view
 * can see. The other seven — `email_messages`, `email_threads`,
 * `memory_chunks`, `insights`, `life_events`, `assistant_messages`,
 * `device_notifications` — have no view by design, and the page says so rather
 * than omitting them: an operator who cannot count the rows also cannot read
 * them, which is the guarantee working, not a gap in the tool.
 */
const OBSERVERS: Readonly<
  Record<
    string,
    {
      view: string
      unit: ArrearsUnit
      conclusive: boolean
      basis: 'instant' | 'date'
      run: (cutoff: string) => Promise<ObservationResult>
    }
  >
> = {
  data_export_requests: {
    view: 'bo_privacy_requests',
    unit: 'rows',
    conclusive: true,
    basis: 'instant',
    run: observeExportRequests,
  },
  approval_actions: {
    view: 'bo_approvals',
    unit: 'rows',
    conclusive: true,
    basis: 'instant',
    run: observeApprovals,
  },
  audit_logs: {
    view: 'bo_audit',
    unit: 'rows',
    conclusive: true,
    basis: 'instant',
    run: observeAuditLogs,
  },
  briefings: {
    view: 'bo_briefing_health',
    unit: 'dayGroups',
    conclusive: false,
    basis: 'date',
    run: observeBriefings,
  },
  captures: {
    view: 'bo_capture_health',
    unit: 'dayGroups',
    conclusive: false,
    basis: 'date',
    run: observeCaptures,
  },
}

export interface RetentionHealth {
  tables: readonly RetentionTableHealth[]
  /** Tables whose arrears could be measured at all. */
  observedCount: number
  /** Tables with no view, by design. */
  blindCount: number
  /** Sum of arrears over the tables where a non-zero count proves a problem. */
  conclusiveArrears: number
}

/**
 * The sweep's policy, measured against what is actually still in the database.
 *
 * The policy list is `RETENTION_SWEEP` from `@da/domain` — the same constant the
 * cleanup function's SQL mirrors — so a table added to the sweep shows up here
 * as unobserved rather than silently disappearing from the page.
 */
export async function loadRetentionHealth(clock: Clock = systemClock): Promise<RetentionHealth> {
  const now = clock.now().getTime()

  const entries = RETENTION_SWEEP.map((entry) => {
    const horizonDays = entry.fixedDays ?? MAX_FINITE_RETENTION_DAYS
    const cutoff = new Date(now - horizonDays * DAY_MS)
    return { entry, horizonDays, cutoff }
  })

  const observations = await pooled(
    entries.map(({ entry, cutoff }) => async (): Promise<ObservationResult | null> => {
      const observer = OBSERVERS[entry.table]
      if (observer === undefined) return null
      const iso = cutoff.toISOString()
      return observer.run(observer.basis === 'date' ? iso.slice(0, 10) : iso)
    }),
    3,
  )

  const tables: RetentionTableHealth[] = entries.map(({ entry, horizonDays }, index) => {
    const observer = OBSERVERS[entry.table]
    const observation = observations[index] ?? null
    return {
      table: entry.table,
      column: entry.column,
      fixedDays: entry.fixedDays ?? null,
      anonymises: (entry.anonymizeColumns?.length ?? 0) > 0,
      observer: observer?.view ?? null,
      unit: observer?.unit ?? null,
      horizonDays,
      arrears: observation?.arrears ?? null,
      conclusive: observer?.conclusive ?? false,
      oldestRemaining: observation?.oldestRemaining ?? null,
    }
  })

  return {
    tables,
    observedCount: tables.filter((table) => table.observer !== null).length,
    blindCount: tables.filter((table) => table.observer === null).length,
    conclusiveArrears: tables.reduce(
      (sum, table) => (table.conclusive ? sum + (table.arrears ?? 0) : sum),
      0,
    ),
  }
}
