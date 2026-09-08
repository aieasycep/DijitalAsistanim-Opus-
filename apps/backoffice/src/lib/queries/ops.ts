import 'server-only'

import { DAY_MS, HOUR_MS, isAppError, systemClock, type Clock } from '@da/domain'
import {
  countView,
  queryView,
  queryViewOne,
  queryViewPage,
  type BoAccountRow,
  type BoApprovalRow,
  type BoPlatformOverviewRow,
  type BoPrivacyRequestRow,
  type BoSyncHealthRow,
  type ViewFilter,
  type ViewPage,
} from '@/lib/db'
import { messages } from '@/lib/messages'

/**
 * Every query the operations area makes.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Two rules shape this file.
 *
 * The first is the product's promise: the backoffice reads only the `bo_*`
 * views, which migration 0017 builds without a single content column. Nothing
 * here can name a base table — `queryView` and `countView` accept only
 * `BoViewName` — so an ops screen physically cannot reach a subject line, a
 * body, an address or a contact name. Every field this module touches is a
 * count, a state, a timestamp or an error *code* that has already passed
 * through `bo_error_code()` in the database.
 *
 * The second is that a number on an operations dashboard must be true. So the
 * counting happens in Postgres: `countView` issues a `HEAD` request with
 * `count=exact`, which is a real `count(*)` with no row bodies crossing the
 * wire, and `queryViewPage` returns the exact total beside a bounded page.
 *
 * There is exactly one place where this module tallies in JavaScript —
 * `loadErrorCodeBreakdown` — and it is deliberate rather than lazy. PostgREST
 * exposes no `GROUP BY` through the foundation's query surface, and the error
 * vocabulary is open at the database level (`bo_error_code` emits any
 * token-shaped label a provider produced, plus the literal `unstructured`), so
 * a per-code `count(*)` would mean one request per candidate code per source
 * per window — well over a hundred round trips for one panel. Instead it reads
 * a bounded, newest-first page of two non-content columns (the code and its
 * timestamp) and reports the exact SQL total alongside, so an operator can see
 * when the sample is partial rather than being shown a plausible lie.
 */

// ===========================================================================
// Shared vocabulary
// ===========================================================================

/** `provider_kind` from 0001, in the order an operator expects to scan them. */
export const OPS_PROVIDERS = ['google', 'microsoft', 'apple', 'device', 'demo'] as const
export type OpsProvider = (typeof OPS_PROVIDERS)[number]

/** `account_kind` from 0001. `contacts` has no sync path, but a state may exist. */
export const OPS_RESOURCES = ['mail', 'calendar', 'tasks', 'contacts'] as const
export type OpsResource = (typeof OPS_RESOURCES)[number]

/** The resources `sync-start` will actually run. `contacts` is a no-op there. */
export const RESYNCABLE_RESOURCES = ['mail', 'calendar', 'tasks'] as const
export type ResyncableResource = (typeof RESYNCABLE_RESOURCES)[number]

export function isResyncableResource(value: string): value is ResyncableResource {
  return (RESYNCABLE_RESOURCES as readonly string[]).includes(value)
}

export function isOpsProvider(value: string): value is OpsProvider {
  return (OPS_PROVIDERS as readonly string[]).includes(value)
}

export function isOpsResource(value: string): value is OpsResource {
  return (OPS_RESOURCES as readonly string[]).includes(value)
}

/** How far back the two comparison windows reach. */
export const WINDOW_24H_MS = 24 * HOUR_MS
export const WINDOW_7D_MS = 7 * DAY_MS

/** Days shown in the throughput table. */
export const THROUGHPUT_DAYS = 7

/**
 * How many failure rows the code breakdown samples per source. Large enough
 * that a healthy platform's whole 7-day failure set fits inside it, small
 * enough that a broken one cannot turn a dashboard render into a table scan.
 */
export const ERROR_SAMPLE_LIMIT = 500

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result that carries its own failure. A panel built from a `Settled`
 * renders an error state instead of blanking, and one dead view never takes
 * the page down with it.
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
// Time
// ===========================================================================

/**
 * `YYYY-MM-DD` in Europe/Istanbul — the same bucket the daily `bo_*` views use
 * (`(created_at at time zone 'Europe/Istanbul')::date`), so a date filter here
 * lines up exactly with a `usage_date` or `for_date` on the other side.
 */
const ISTANBUL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function istanbulDayKey(instant: Date): string {
  return ISTANBUL_DAY.format(instant)
}

function isoAgo(clock: Clock, ms: number): string {
  return new Date(clock.now().getTime() - ms).toISOString()
}

/** The last `count` Istanbul day keys, newest first. */
export function recentDayKeys(clock: Clock, count: number): readonly string[] {
  const today = clock.now().getTime()
  return Array.from({ length: count }, (_unused, index) =>
    istanbulDayKey(new Date(today - index * DAY_MS)),
  )
}

// ===========================================================================
// Platform overview
// ===========================================================================

export async function loadPlatformOverview(): Promise<BoPlatformOverviewRow | null> {
  return queryViewOne('bo_platform_overview')
}

// ===========================================================================
// Sync pulse — six exact counts over bo_sync_health
// ===========================================================================

export interface SyncPulse {
  ranLastHour: number
  ranLast24h: number
  dueNow: number
  backfilling: number
  errored: number
  stalled: number
}

export async function loadSyncPulse(clock: Clock = systemClock): Promise<SyncPulse> {
  const nowIso = clock.now().toISOString()
  const [ranLastHour, ranLast24h, dueNow, backfilling, errored, stalled] = await Promise.all([
    countView('bo_sync_health', [
      { column: 'last_run_at', op: 'gte', value: isoAgo(clock, HOUR_MS) },
    ]),
    countView('bo_sync_health', [
      { column: 'last_run_at', op: 'gte', value: isoAgo(clock, WINDOW_24H_MS) },
    ]),
    countView('bo_sync_health', [{ column: 'next_run_at', op: 'lte', value: nowIso }]),
    countView('bo_sync_health', [{ column: 'is_backfilling', op: 'is', value: true }]),
    countView('bo_sync_health', [{ column: 'status', op: 'eq', value: 'error' }]),
    countView('bo_sync_health', [{ column: 'is_stalled', op: 'is', value: true }]),
  ])

  return { ranLastHour, ranLast24h, dueNow, backfilling, errored, stalled }
}

// ===========================================================================
// Sync health per provider
// ===========================================================================

export interface ProviderHealth {
  provider: string
  accountTotal: number
  connected: number
  expired: number
  revoked: number
  errored: number
  /** `connected_accounts` has exactly one status, so this is exact arithmetic. */
  disconnected: number
  syncErrored: number
  syncStalled: number
  backfilling: number
  /** The provider's most-behind resource: its last run, and how long ago. */
  oldestRunAt: string | null
  oldestRunMinutes: number | null
  oldestRunResource: string | null
  /** The least-advanced backfill cursor still open on this provider. */
  oldestBackfillCursor: string | null
  oldestBackfillResource: string | null
}

function accountFilters(provider: string, status?: string): readonly ViewFilter<BoAccountRow>[] {
  const filters: ViewFilter<BoAccountRow>[] = [{ column: 'provider', op: 'eq', value: provider }]
  if (status !== undefined) filters.push({ column: 'status', op: 'eq', value: status })
  return filters
}

/**
 * One row per provider that actually has an account.
 *
 * Two waves rather than one: the first asks how many accounts each provider
 * has, the second only asks the follow-up questions for providers where the
 * answer was not zero. On a platform running Google and Microsoft that is
 * roughly twenty exact counts instead of forty-five, and a provider nobody
 * uses costs one `HEAD` request rather than nine.
 */
export async function loadProviderHealth(): Promise<readonly ProviderHealth[]> {
  const totals = await Promise.all(
    OPS_PROVIDERS.map((provider) => countView('bo_accounts', accountFilters(provider))),
  )

  const present = OPS_PROVIDERS.map((provider, index) => ({
    provider,
    accountTotal: totals[index] ?? 0,
  })).filter((entry) => entry.accountTotal > 0)

  return Promise.all(present.map((entry) => loadOneProvider(entry.provider, entry.accountTotal)))
}

async function loadOneProvider(
  provider: OpsProvider,
  accountTotal: number,
): Promise<ProviderHealth> {
  const providerSync: ViewFilter<BoSyncHealthRow> = {
    column: 'provider',
    op: 'eq',
    value: provider,
  }

  const [
    connected,
    expired,
    revoked,
    errored,
    syncErrored,
    syncStalled,
    backfilling,
    oldestRun,
    oldestBackfill,
  ] = await Promise.all([
    countView('bo_accounts', accountFilters(provider, 'connected')),
    countView('bo_accounts', accountFilters(provider, 'expired')),
    countView('bo_accounts', accountFilters(provider, 'revoked')),
    countView('bo_accounts', accountFilters(provider, 'error')),
    countView('bo_sync_health', [providerSync, { column: 'status', op: 'eq', value: 'error' }]),
    countView('bo_sync_health', [providerSync, { column: 'is_stalled', op: 'is', value: true }]),
    countView('bo_sync_health', [
      providerSync,
      { column: 'is_backfilling', op: 'is', value: true },
    ]),
    // Ordered and limited in Postgres: one row comes back, not a scan.
    queryViewOne('bo_sync_health', {
      columns: ['resource', 'last_run_at', 'minutes_since_last_run'],
      filters: [providerSync],
      order: { column: 'last_run_at', ascending: true, nullsFirst: false },
    }),
    queryViewOne('bo_sync_health', {
      columns: ['resource', 'backfill_cursor'],
      filters: [providerSync, { column: 'is_backfilling', op: 'is', value: true }],
      order: { column: 'backfill_cursor', ascending: true, nullsFirst: false },
    }),
  ])

  return {
    provider,
    accountTotal,
    connected,
    expired,
    revoked,
    errored,
    disconnected: Math.max(0, accountTotal - connected - expired - revoked - errored),
    syncErrored,
    syncStalled,
    backfilling,
    oldestRunAt: oldestRun?.last_run_at ?? null,
    oldestRunMinutes: oldestRun?.minutes_since_last_run ?? null,
    oldestRunResource: oldestRun?.resource ?? null,
    oldestBackfillCursor: oldestBackfill?.backfill_cursor ?? null,
    oldestBackfillResource: oldestBackfill?.resource ?? null,
  }
}

// ===========================================================================
// The failing queue
// ===========================================================================

export interface FailingSyncQuery {
  provider?: string | null
  resource?: string | null
  errorCode?: string | null
  limit: number
  offset: number
}

/**
 * Sync states currently in error, worst first.
 *
 * "Failing longest" is `consecutive_failures`, not age: a state that has failed
 * forty times running is in worse shape than one that broke this morning and
 * has been retried once. The tie-break is the least recently attempted, so two
 * accounts stuck at the same failure count surface the more neglected one.
 * Both clauses are `ORDER BY` in Postgres.
 */
export async function loadFailingSync(query: FailingSyncQuery): Promise<ViewPage<BoSyncHealthRow>> {
  const filters: ViewFilter<BoSyncHealthRow>[] = [{ column: 'status', op: 'eq', value: 'error' }]
  if (query.provider) filters.push({ column: 'provider', op: 'eq', value: query.provider })
  if (query.resource) filters.push({ column: 'resource', op: 'eq', value: query.resource })
  if (query.errorCode) {
    filters.push({ column: 'last_error_code', op: 'eq', value: query.errorCode })
  }

  return queryViewPage('bo_sync_health', {
    filters,
    order: [
      { column: 'consecutive_failures', ascending: false },
      { column: 'last_run_at', ascending: true, nullsFirst: false },
    ],
    limit: query.limit,
    offset: query.offset,
  })
}

// ===========================================================================
// Error rates by function
// ===========================================================================

export type OpsFunctionKey = 'sync' | 'approval' | 'export' | 'connection'

export const OPS_FUNCTION_KEYS: readonly OpsFunctionKey[] = [
  'sync',
  'approval',
  'export',
  'connection',
]

export interface FunctionErrorRate {
  key: OpsFunctionKey
  failed24h: number
  total24h: number
  failed7d: number
  total7d: number
}

/**
 * Failure share per pipeline surface, in both windows.
 *
 * Every one of the sixteen numbers is a `count(*)` in Postgres. The
 * denominators are deliberately not "all rows ever": a rate against a lifetime
 * total drifts towards zero and stops being a signal, so each surface counts
 * only the rows its window actually touched, and the UI names the denominator
 * beside the rate so nobody has to guess what it divided by.
 */
export async function loadFunctionErrorRates(
  clock: Clock = systemClock,
): Promise<readonly FunctionErrorRate[]> {
  const since24h = isoAgo(clock, WINDOW_24H_MS)
  const since7d = isoAgo(clock, WINDOW_7D_MS)

  const syncRun = (since: string): ViewFilter<BoSyncHealthRow> => ({
    column: 'last_run_at',
    op: 'gte',
    value: since,
  })
  const approvalTouched = (since: string): ViewFilter<BoApprovalRow> => ({
    column: 'updated_at',
    op: 'gte',
    value: since,
  })
  const exportTouched = (since: string): ViewFilter<BoPrivacyRequestRow> => ({
    column: 'updated_at',
    op: 'gte',
    value: since,
  })
  const accountTouched = (since: string): ViewFilter<BoAccountRow> => ({
    column: 'updated_at',
    op: 'gte',
    value: since,
  })
  const accountErrored = (since: string): ViewFilter<BoAccountRow> => ({
    column: 'last_error_at',
    op: 'gte',
    value: since,
  })

  const [
    syncTotal24h,
    syncFailed24h,
    syncTotal7d,
    syncFailed7d,
    approvalTotal24h,
    approvalFailed24h,
    approvalTotal7d,
    approvalFailed7d,
    exportTotal24h,
    exportFailed24h,
    exportTotal7d,
    exportFailed7d,
    connectionTotal24h,
    connectionFailed24h,
    connectionTotal7d,
    connectionFailed7d,
  ] = await Promise.all([
    countView('bo_sync_health', [syncRun(since24h)]),
    countView('bo_sync_health', [
      syncRun(since24h),
      { column: 'status', op: 'eq', value: 'error' },
    ]),
    countView('bo_sync_health', [syncRun(since7d)]),
    countView('bo_sync_health', [syncRun(since7d), { column: 'status', op: 'eq', value: 'error' }]),

    countView('bo_approvals', [approvalTouched(since24h)]),
    countView('bo_approvals', [
      approvalTouched(since24h),
      { column: 'status', op: 'eq', value: 'failed' },
    ]),
    countView('bo_approvals', [approvalTouched(since7d)]),
    countView('bo_approvals', [
      approvalTouched(since7d),
      { column: 'status', op: 'eq', value: 'failed' },
    ]),

    countView('bo_privacy_requests', [exportTouched(since24h)]),
    countView('bo_privacy_requests', [
      exportTouched(since24h),
      { column: 'status', op: 'eq', value: 'failed' },
    ]),
    countView('bo_privacy_requests', [exportTouched(since7d)]),
    countView('bo_privacy_requests', [
      exportTouched(since7d),
      { column: 'status', op: 'eq', value: 'failed' },
    ]),

    countView('bo_accounts', [accountTouched(since24h)]),
    countView('bo_accounts', [accountErrored(since24h)]),
    countView('bo_accounts', [accountTouched(since7d)]),
    countView('bo_accounts', [accountErrored(since7d)]),
  ])

  return [
    {
      key: 'sync',
      failed24h: syncFailed24h,
      total24h: syncTotal24h,
      failed7d: syncFailed7d,
      total7d: syncTotal7d,
    },
    {
      key: 'approval',
      failed24h: approvalFailed24h,
      total24h: approvalTotal24h,
      failed7d: approvalFailed7d,
      total7d: approvalTotal7d,
    },
    {
      key: 'export',
      failed24h: exportFailed24h,
      total24h: exportTotal24h,
      failed7d: exportFailed7d,
      total7d: exportTotal7d,
    },
    {
      key: 'connection',
      failed24h: connectionFailed24h,
      total24h: connectionTotal24h,
      failed7d: connectionFailed7d,
      total7d: connectionTotal7d,
    },
  ]
}

// ===========================================================================
// Error codes by function
// ===========================================================================

export interface ErrorCodeRow {
  source: OpsFunctionKey
  code: string
  count24h: number
  count7d: number
}

export interface ErrorCodeBreakdown {
  rows: readonly ErrorCodeRow[]
  /** Failure rows actually read, across all four sources. */
  sampled: number
  /** Exact failure rows in the window, counted by Postgres. */
  total: number
  truncated: boolean
}

/** One failure, reduced to the only two things this panel needs. */
interface CodeSample {
  code: string | null
  at: string | null
}

/** The literal `bo_error_code()` emits for a label it refused to pass through. */
export const UNSTRUCTURED_CODE = 'unstructured'

/** Shown when a failure was recorded without any code at all. */
export const MISSING_CODE = 'kodsuz'

export async function loadErrorCodeBreakdown(
  clock: Clock = systemClock,
): Promise<ErrorCodeBreakdown> {
  const since24h = isoAgo(clock, WINDOW_24H_MS)
  const since7d = isoAgo(clock, WINDOW_7D_MS)

  const [sync, connection, approval, exports] = await Promise.all([
    queryViewPage('bo_sync_health', {
      columns: ['last_error_code', 'last_run_at'],
      filters: [
        { column: 'status', op: 'eq', value: 'error' },
        { column: 'last_run_at', op: 'gte', value: since7d },
      ],
      order: { column: 'last_run_at', ascending: false },
      limit: ERROR_SAMPLE_LIMIT,
    }),
    queryViewPage('bo_accounts', {
      columns: ['last_error_code', 'last_error_at'],
      filters: [{ column: 'last_error_at', op: 'gte', value: since7d }],
      order: { column: 'last_error_at', ascending: false },
      limit: ERROR_SAMPLE_LIMIT,
    }),
    queryViewPage('bo_approvals', {
      columns: ['failure_code', 'updated_at'],
      filters: [
        { column: 'status', op: 'eq', value: 'failed' },
        { column: 'updated_at', op: 'gte', value: since7d },
      ],
      order: { column: 'updated_at', ascending: false },
      limit: ERROR_SAMPLE_LIMIT,
    }),
    queryViewPage('bo_privacy_requests', {
      columns: ['failure_code', 'updated_at'],
      filters: [
        { column: 'status', op: 'eq', value: 'failed' },
        { column: 'updated_at', op: 'gte', value: since7d },
      ],
      order: { column: 'updated_at', ascending: false },
      limit: ERROR_SAMPLE_LIMIT,
    }),
  ])

  const groups: readonly { source: OpsFunctionKey; samples: readonly CodeSample[] }[] = [
    {
      source: 'sync',
      samples: sync.rows.map((row) => ({ code: row.last_error_code, at: row.last_run_at })),
    },
    {
      source: 'connection',
      samples: connection.rows.map((row) => ({
        code: row.last_error_code,
        at: row.last_error_at,
      })),
    },
    {
      source: 'approval',
      samples: approval.rows.map((row) => ({ code: row.failure_code, at: row.updated_at })),
    },
    {
      source: 'export',
      samples: exports.rows.map((row) => ({ code: row.failure_code, at: row.updated_at })),
    },
  ]

  const tally = new Map<string, ErrorCodeRow>()
  for (const group of groups) {
    for (const sample of group.samples) {
      const code = sample.code ?? MISSING_CODE
      const key = `${group.source}:${code}`
      const existing = tally.get(key) ?? { source: group.source, code, count24h: 0, count7d: 0 }
      existing.count7d += 1
      if (sample.at !== null && sample.at >= since24h) existing.count24h += 1
      tally.set(key, existing)
    }
  }

  const rows = [...tally.values()].sort(
    (left, right) =>
      right.count24h - left.count24h ||
      right.count7d - left.count7d ||
      left.code.localeCompare(right.code, 'tr-TR'),
  )

  const sampled =
    sync.rows.length + connection.rows.length + approval.rows.length + exports.rows.length
  const total = sync.total + connection.total + approval.total + exports.total

  return { rows, sampled, total, truncated: total > sampled }
}

/**
 * The distinct error codes currently sitting in the failing queue, with how
 * many resources carry each. Feeds the queue page's code filter, so the filter
 * offers exactly the codes that would return rows and never an empty choice.
 */
export interface ErrorCodeOption {
  code: string
  count: number
}

export async function loadFailingSyncCodes(): Promise<readonly ErrorCodeOption[]> {
  const page = await queryViewPage('bo_sync_health', {
    columns: ['last_error_code'],
    filters: [{ column: 'status', op: 'eq', value: 'error' }],
    order: { column: 'consecutive_failures', ascending: false },
    limit: ERROR_SAMPLE_LIMIT,
  })

  const counts = new Map<string, number>()
  for (const row of page.rows) {
    if (row.last_error_code === null) continue
    counts.set(row.last_error_code, (counts.get(row.last_error_code) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code, 'tr-TR'))
}

// ===========================================================================
// Ingestion throughput
// ===========================================================================

export interface ThroughputDay {
  day: string
  aiEvents: number
  aiCostMicros: number
  briefingTotal: number
  briefingFailed: number
  notificationTotal: number
  notificationFailed: number
  captureTotal: number
  captureFailed: number
  signups: number
}

/**
 * Seven Istanbul days of pipeline volume.
 *
 * Mail and calendar row counts are absent on purpose and cannot be added: no
 * `bo_*` view counts `email_messages` or `calendar_events`, because a per-user
 * message count is itself a fact about someone's correspondence. What is
 * measurable is what the pipeline *did* with whatever arrived — model calls,
 * briefings, notifications, captures — and that is what this shows.
 *
 * The five source views are already `GROUP BY`-ed in Postgres; this folds their
 * per-day, per-kind rows into one row per day. At seven days that is a few
 * dozen pre-aggregated rows, not a scan of the underlying tables.
 */
export async function loadThroughput(
  clock: Clock = systemClock,
): Promise<readonly ThroughputDay[]> {
  const days = recentDayKeys(clock, THROUGHPUT_DAYS)
  const oldest = days[days.length - 1] ?? istanbulDayKey(clock.now())

  const [ai, briefings, notifications, captures, signups] = await Promise.all([
    queryView('bo_ai_spend_daily', {
      columns: ['usage_date', 'event_count', 'cost_micros'],
      filters: [{ column: 'usage_date', op: 'gte', value: oldest }],
      order: { column: 'usage_date', ascending: false },
      limit: 400,
    }),
    queryView('bo_briefing_health', {
      columns: ['for_date', 'total_count', 'failed_count'],
      filters: [{ column: 'for_date', op: 'gte', value: oldest }],
      order: { column: 'for_date', ascending: false },
      limit: 200,
    }),
    queryView('bo_notification_health', {
      columns: ['delivery_date', 'total_count', 'failed_count'],
      filters: [{ column: 'delivery_date', op: 'gte', value: oldest }],
      order: { column: 'delivery_date', ascending: false },
      limit: 200,
    }),
    queryView('bo_capture_health', {
      columns: ['capture_date', 'total_count', 'failed_count'],
      filters: [{ column: 'capture_date', op: 'gte', value: oldest }],
      order: { column: 'capture_date', ascending: false },
      limit: 200,
    }),
    queryView('bo_signup_daily', {
      columns: ['signup_date', 'signup_count'],
      filters: [{ column: 'signup_date', op: 'gte', value: oldest }],
      order: { column: 'signup_date', ascending: false },
      limit: 200,
    }),
  ])

  const byDay = new Map<string, ThroughputDay>(
    days.map((day) => [
      day,
      {
        day,
        aiEvents: 0,
        aiCostMicros: 0,
        briefingTotal: 0,
        briefingFailed: 0,
        notificationTotal: 0,
        notificationFailed: 0,
        captureTotal: 0,
        captureFailed: 0,
        signups: 0,
      },
    ]),
  )

  const add = (key: string, mutate: (day: ThroughputDay) => void): void => {
    const entry = byDay.get(key)
    if (entry) mutate(entry)
  }

  for (const row of ai) {
    add(row.usage_date, (day) => {
      day.aiEvents += row.event_count
      day.aiCostMicros += row.cost_micros
    })
  }
  for (const row of briefings) {
    add(row.for_date, (day) => {
      day.briefingTotal += row.total_count
      day.briefingFailed += row.failed_count
    })
  }
  for (const row of notifications) {
    add(row.delivery_date, (day) => {
      day.notificationTotal += row.total_count
      day.notificationFailed += row.failed_count
    })
  }
  for (const row of captures) {
    add(row.capture_date, (day) => {
      day.captureTotal += row.total_count
      day.captureFailed += row.failed_count
    })
  }
  for (const row of signups) {
    add(row.signup_date, (day) => {
      day.signups += row.signup_count
    })
  }

  return days.map((day) => byDay.get(day) ?? emptyDay(day))
}

function emptyDay(day: string): ThroughputDay {
  return {
    day,
    aiEvents: 0,
    aiCostMicros: 0,
    briefingTotal: 0,
    briefingFailed: 0,
    notificationTotal: 0,
    notificationFailed: 0,
    captureTotal: 0,
    captureFailed: 0,
    signups: 0,
  }
}
