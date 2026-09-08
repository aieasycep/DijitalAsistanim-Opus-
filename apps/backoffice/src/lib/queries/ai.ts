import 'server-only'

import {
  APPROVAL_ACTION_TYPES,
  DAY_MS,
  addLocalDays,
  isAppError,
  startOfLocalDay,
  systemClock,
  toIsoDate,
  type Clock,
} from '@da/domain'
import {
  DAILY_EVENT_CAP,
  QUOTA_REVIEW_ACTION,
  capTierFor,
  type CapTier,
  type CeilingSort,
  type SpendWindowKey,
} from '@/components/ai/contract'
import {
  countView,
  queryView,
  queryViewOne,
  queryViewPage,
  type BoAiSpendDailyRow,
  type BoAiSpendRow,
  type BoApprovalRow,
  type BoAuditRow,
  type ViewFilter,
  type ViewOrder,
} from '@/lib/db'
import { OPS_TIME_ZONE } from '@/lib/format'
import { messages } from '@/lib/messages'

/**
 * Every query the AI area makes.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE MAY READ, AND WHAT IT DELIBERATELY CANNOT
 * ---------------------------------------------------------------------------
 *
 * `ai_usage_events` is content-free by construction — 0009 forbids prompt and
 * completion text in it — and `bo_ai_spend` / `bo_ai_spend_daily` reduce even
 * that to sums, so no single request is inspectable. Everything else here is a
 * state, a timestamp or a `count(*)`. `queryView` accepts only `BoViewName`, so
 * there is no spelling of any function below that reaches `email_messages`,
 * `assistant_messages`, `approval_actions.payload` or a contact.
 *
 * Two consequences of that promise shape this module, and both are visible on
 * screen rather than hidden in a comment:
 *
 *   1. **The triage funnel has no denominator.** "What share of mail never
 *      reached a model" would need a count of `email_messages`, and how much
 *      mail a person receives is itself a fact about their correspondence. No
 *      `bo_*` view counts it and none should. What is measurable is the
 *      numerator — `email_analysis` calls, which the ingest pipeline writes
 *      exactly once per message that survived triage — plus the connected
 *      mailbox count, so the funnel is reported as calls per mailbox per day.
 *
 *   2. **Quality is not read from `ai_feedback`.** That table holds a note
 *      column and is keyed to the entity a user reacted to; there is no
 *      content-blind aggregate view over it, and this app may not add one. So
 *      quality is measured from the decision the user actually took: a rejected
 *      draft, a briefing nobody opened, a capture the model could not classify.
 *
 * Where a number is derived rather than counted — the cap ratio, cost per call,
 * a weighted average — the derivation is named in the UI beside it.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE ARITHMETIC HAPPENS
 * ---------------------------------------------------------------------------
 *
 * In Postgres, wherever PostgREST exposes it: `countView` is a `HEAD` request
 * with `count=exact` (a real `count(*)`, no row bodies on the wire) and
 * `queryViewPage` returns the exact total beside a bounded page.
 *
 * The one place this module folds in JavaScript is over `bo_ai_spend_daily`,
 * whose rows are *already* `GROUP BY (day, model, operation)` in the view.
 * PostgREST offers no `SUM`, so summing those pre-aggregated buckets is the only
 * way to get a window total — a few hundred rows for a month, not a scan. It is
 * paged to a hard ceiling and reports `truncated` when the ceiling was hit, so a
 * partial fold is stated rather than shown as a smaller truth.
 */

// ===========================================================================
// Failure isolation
// ===========================================================================

/** A query result that carries its own failure, so one panel can fail alone. */
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
// Days
// ===========================================================================

/**
 * One Istanbul calendar day: the key the daily views bucket on, and the two
 * instants that bound it.
 *
 * `bo_ai_spend_daily` buckets on `(occurred_at at time zone 'Europe/Istanbul')`,
 * so a range filter built from anything else would put a day's model calls in
 * one row of a table and its approvals in another.
 */
export interface DayWindow {
  key: string
  startIso: string
  endIso: string
}

/** The last `count` Istanbul days, newest first. */
export function recentDays(clock: Clock, count: number): readonly DayWindow[] {
  const now = clock.now()
  return Array.from({ length: count }, (_unused, index) => {
    const start = startOfLocalDay(addLocalDays(now, -index, OPS_TIME_ZONE), OPS_TIME_ZONE)
    const end = addLocalDays(start, 1, OPS_TIME_ZONE)
    return {
      key: toIsoDate(start, OPS_TIME_ZONE),
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    }
  })
}

/** The day key `count - 1` days back — the `>=` bound for a daily view. */
function oldestDayKey(clock: Clock, count: number): string {
  const days = recentDays(clock, count)
  return days[days.length - 1]?.key ?? toIsoDate(clock.now(), OPS_TIME_ZONE)
}

/** The instant that starts the oldest day in the window. */
function oldestDayStartIso(clock: Clock, count: number): string {
  const days = recentDays(clock, count)
  return (
    days[days.length - 1]?.startIso ?? startOfLocalDay(clock.now(), OPS_TIME_ZONE).toISOString()
  )
}

// ===========================================================================
// Spend
// ===========================================================================

/** The operation the ingest pipeline writes once per message it sends to a model. */
export const EMAIL_ANALYSIS_OPERATION = 'email_analysis'

/** Rows per request when folding `bo_ai_spend_daily`, and the page ceiling. */
export const SPEND_PAGE_SIZE = 1000
export const SPEND_MAX_PAGES = 4

export interface SpendTotals {
  events: number
  tokensIn: number
  tokensOut: number
  costMicros: number
}

export interface DailySpend extends SpendTotals {
  day: string
}

export interface SpendBreakdownRow extends SpendTotals {
  /** Model name or operation label, exactly as the database holds it. */
  key: string
  /** Distinct Istanbul days this key appeared on, inside the window. */
  dayCount: number
}

export interface SpendWindow {
  dayCount: number
  /** Newest first, one entry per day in the window even when it had no calls. */
  days: readonly string[]
  current: SpendTotals
  /** The equally long period immediately before it, for a real delta. */
  previous: SpendTotals
  daily: readonly DailySpend[]
  models: readonly SpendBreakdownRow[]
  operations: readonly SpendBreakdownRow[]
  /** The `email_analysis` slice of `current`, for the triage funnel. */
  emailAnalysis: SpendTotals
  emailAnalysisDaily: readonly DailySpend[]
  rowsRead: number
  rowTotal: number
  truncated: boolean
}

function emptyTotals(): SpendTotals {
  return { events: 0, tokensIn: 0, tokensOut: 0, costMicros: 0 }
}

function addRow(target: SpendTotals, row: BoAiSpendDailyRow): void {
  target.events += row.event_count
  target.tokensIn += row.tokens_in
  target.tokensOut += row.tokens_out
  target.costMicros += row.cost_micros
}

/**
 * Reads every `bo_ai_spend_daily` bucket from `oldest` onward.
 *
 * Ordered by the view's own group key — `(usage_date, model, operation)` is
 * unique in the view — so paging is deterministic: two requests can never
 * return the same bucket twice or skip one between them.
 *
 * The offset advances by the rows actually returned rather than by the
 * requested page size, because PostgREST may cap a response below what was
 * asked for (`db-max-rows`). Assuming the requested size would then skip
 * buckets and silently under-report the window; this way a smaller page simply
 * means more requests, and the loop still stops at `SPEND_MAX_PAGES` so a
 * misconfigured cap cannot turn one page render into an unbounded crawl.
 */
async function readSpendBuckets(
  oldest: string,
): Promise<{ rows: readonly BoAiSpendDailyRow[]; total: number; truncated: boolean }> {
  const collected: BoAiSpendDailyRow[] = []
  let total = 0
  let offset = 0

  for (let request = 0; request < SPEND_MAX_PAGES; request += 1) {
    const result = await queryViewPage('bo_ai_spend_daily', {
      filters: [{ column: 'usage_date', op: 'gte', value: oldest }],
      order: [
        { column: 'usage_date', ascending: false },
        { column: 'model', ascending: true },
        { column: 'operation', ascending: true },
      ],
      limit: SPEND_PAGE_SIZE,
      offset,
    })
    total = result.total
    collected.push(...result.rows)
    offset += result.rows.length
    if (result.rows.length === 0 || collected.length >= total) break
  }

  return { rows: collected, total, truncated: collected.length < total }
}

function foldBreakdown(
  rows: readonly BoAiSpendDailyRow[],
  keyOf: (row: BoAiSpendDailyRow) => string,
): readonly SpendBreakdownRow[] {
  const tally = new Map<string, SpendBreakdownRow & { days: Set<string> }>()

  for (const row of rows) {
    const key = keyOf(row)
    const existing = tally.get(key) ?? { key, ...emptyTotals(), dayCount: 0, days: new Set() }
    addRow(existing, row)
    existing.days.add(row.usage_date)
    tally.set(key, existing)
  }

  return [...tally.values()]
    .map(({ days, ...rest }) => ({ ...rest, dayCount: days.size }))
    .sort(
      (left, right) =>
        right.costMicros - left.costMicros ||
        right.events - left.events ||
        left.key.localeCompare(right.key, 'tr-TR'),
    )
}

/**
 * A window of platform spend, plus the equally long window before it.
 *
 * Both periods come from one paged read: the comparison is the whole point of
 * a cost page — a total without a direction is a number nobody can act on —
 * and fetching twice the days once is cheaper than two round trips.
 */
export async function loadSpendWindow(
  dayCount: number,
  clock: Clock = systemClock,
): Promise<SpendWindow> {
  const currentDays = recentDays(clock, dayCount)
  const oldest = oldestDayKey(clock, dayCount * 2)
  const { rows, total, truncated } = await readSpendBuckets(oldest)

  // Both sets are named explicitly rather than one being "everything else":
  // a bucket dated in the future — a clock skew on a worker, a backfill with a
  // bad timestamp — would otherwise be counted as part of the previous period
  // and quietly move the comparison.
  const currentKeys = new Set(currentDays.map((day) => day.key))
  const previousKeys = new Set(
    recentDays(clock, dayCount * 2)
      .slice(dayCount)
      .map((day) => day.key),
  )
  const currentRows = rows.filter((row) => currentKeys.has(row.usage_date))
  const previousRows = rows.filter((row) => previousKeys.has(row.usage_date))

  const current = emptyTotals()
  for (const row of currentRows) addRow(current, row)

  const previous = emptyTotals()
  for (const row of previousRows) addRow(previous, row)

  const daily = new Map<string, DailySpend>(
    currentDays.map((day) => [day.key, { day: day.key, ...emptyTotals() }]),
  )
  const emailDaily = new Map<string, DailySpend>(
    currentDays.map((day) => [day.key, { day: day.key, ...emptyTotals() }]),
  )
  const emailAnalysis = emptyTotals()

  for (const row of currentRows) {
    const bucket = daily.get(row.usage_date)
    if (bucket) addRow(bucket, row)
    if (row.operation === EMAIL_ANALYSIS_OPERATION) {
      addRow(emailAnalysis, row)
      const emailBucket = emailDaily.get(row.usage_date)
      if (emailBucket) addRow(emailBucket, row)
    }
  }

  const orderedDays = currentDays.map((day) => day.key)

  return {
    dayCount,
    days: orderedDays,
    current,
    previous,
    daily: orderedDays.map((day) => daily.get(day) ?? { day, ...emptyTotals() }),
    models: foldBreakdown(currentRows, (row) => row.model),
    operations: foldBreakdown(currentRows, (row) => row.operation),
    emailAnalysis,
    emailAnalysisDaily: orderedDays.map((day) => emailDaily.get(day) ?? { day, ...emptyTotals() }),
    rowsRead: rows.length,
    rowTotal: total,
    truncated,
  }
}

// ===========================================================================
// Per-user spend
// ===========================================================================

/** The pre-summed column each rolling window lives in on `bo_ai_spend`. */
export const SPEND_COST_COLUMN = {
  '24s': 'cost_micros_24h',
  '7g': 'cost_micros_7d',
  '30g': 'cost_micros_30d',
} as const satisfies Record<
  SpendWindowKey,
  'cost_micros_24h' | 'cost_micros_7d' | 'cost_micros_30d'
>

export interface TopSpender {
  userId: string
  emailRedacted: string | null
  costMicros: number
  costMicros24h: number
  costMicros30d: number
  eventCount30d: number
  modelCount: number
  lastEventAt: string | null
}

/**
 * The head of the per-user cost distribution in one window.
 *
 * Ordered and limited in Postgres — ten rows come back, never a table of users
 * sorted in JavaScript.
 */
export async function loadTopSpenders(
  windowKey: SpendWindowKey,
  limit: number,
): Promise<readonly TopSpender[]> {
  const column = SPEND_COST_COLUMN[windowKey]
  const rows = await queryView('bo_ai_spend', {
    filters: [{ column, op: 'gt', value: 0 }],
    order: [
      { column, ascending: false },
      { column: 'user_id', ascending: true },
    ],
    limit,
  })

  return rows.map((row) => ({
    userId: row.user_id,
    emailRedacted: row.email_redacted,
    costMicros: row[column],
    costMicros24h: row.cost_micros_24h,
    costMicros30d: row.cost_micros_30d,
    eventCount30d: row.event_count_30d,
    modelCount: row.model_count,
    lastEventAt: row.last_event_at,
  }))
}

export interface SpenderCounts {
  in24h: number
  in7d: number
  in30d: number
}

/**
 * How many distinct users carried a cost in each rolling window.
 *
 * Three exact `count(*)`s over `bo_ai_spend`, which is already one row per
 * user. Summing `bo_ai_spend_daily.user_count` would be wrong and is never done
 * anywhere in this file: that column counts distinct users *within* a
 * (day, model, operation) bucket, so adding two buckets double-counts anyone
 * who appears in both.
 */
export async function loadSpenderCounts(): Promise<SpenderCounts> {
  const [in24h, in7d, in30d] = await Promise.all([
    countView('bo_ai_spend', [{ column: 'cost_micros_24h', op: 'gt', value: 0 }]),
    countView('bo_ai_spend', [{ column: 'cost_micros_7d', op: 'gt', value: 0 }]),
    countView('bo_ai_spend', [{ column: 'event_count_30d', op: 'gt', value: 0 }]),
  ])
  return { in24h, in7d, in30d }
}

// ===========================================================================
// Triage
// ===========================================================================

/**
 * Mailboxes the pipeline is currently ingesting from — the only honest
 * denominator this tool has for mail volume.
 *
 * It is a count of *accounts*, not of messages, and it is the count as of now
 * rather than as of each day in the window. The panel says both.
 */
export async function loadConnectedMailAccounts(): Promise<number> {
  return countView('bo_accounts', [
    { column: 'kinds', op: 'contains', value: ['mail'] },
    { column: 'status', op: 'eq', value: 'connected' },
  ])
}

// ===========================================================================
// Draft quality
// ===========================================================================

export interface DraftQualityRow {
  type: string
  total: number
  rejected: number
  executed: number
  failed: number
  expired: number
  /** Pending, approved or executing — everything not yet resolved. */
  open: number
}

function createdWithin(sinceIso: string): ViewFilter<BoApprovalRow> {
  return { column: 'created_at', op: 'gte', value: sinceIso }
}

/**
 * What became of the drafts created in the window, per action type.
 *
 * The cohort is fixed by `created_at`, not by decision time: a draft written on
 * Monday and rejected on Tuesday belongs to Monday's quality, because the
 * question this page answers is "were the things we generated then any good".
 *
 * Two waves, the same shape the ops area uses for providers: ask each type how
 * many drafts it produced, then ask the four follow-up questions only of the
 * types that produced any. On a platform sending mail and nothing else that is
 * ten exact counts instead of thirty.
 *
 * `open` is arithmetic rather than a fifth query — `approval_status` is a
 * single not-null enum, so the five buckets are disjoint and total.
 */
export async function loadDraftQuality(
  dayCount: number,
  clock: Clock = systemClock,
): Promise<readonly DraftQualityRow[]> {
  const since = oldestDayStartIso(clock, dayCount)

  const totals = await Promise.all(
    APPROVAL_ACTION_TYPES.map((type) =>
      countView('bo_approvals', [createdWithin(since), { column: 'type', op: 'eq', value: type }]),
    ),
  )

  const present = APPROVAL_ACTION_TYPES.map((type, index) => ({
    type,
    total: totals[index] ?? 0,
  })).filter((entry) => entry.total > 0)

  const rows = await Promise.all(
    present.map(async (entry) => {
      const status = (value: string): readonly ViewFilter<BoApprovalRow>[] => [
        createdWithin(since),
        { column: 'type', op: 'eq', value: entry.type },
        { column: 'status', op: 'eq', value },
      ]

      const [rejected, executed, failed, expired] = await Promise.all([
        countView('bo_approvals', status('rejected')),
        countView('bo_approvals', status('executed')),
        countView('bo_approvals', status('failed')),
        countView('bo_approvals', status('expired')),
      ])

      return {
        type: entry.type,
        total: entry.total,
        rejected,
        executed,
        failed,
        expired,
        open: Math.max(0, entry.total - rejected - executed - failed - expired),
      }
    }),
  )

  return rows.sort((left, right) => right.total - left.total)
}

export interface DraftTrendDay {
  day: string
  created: number
  rejected: number
}

/**
 * The daily rejection cohort: of the drafts created on a day, how many the user
 * eventually said no to. Two exact counts per day, both bounded by the same
 * Istanbul day the rest of the console buckets on.
 */
export async function loadDraftTrend(
  dayCount: number,
  clock: Clock = systemClock,
): Promise<readonly DraftTrendDay[]> {
  const days = recentDays(clock, dayCount)

  return Promise.all(
    days.map(async (day) => {
      const within: readonly ViewFilter<BoApprovalRow>[] = [
        { column: 'created_at', op: 'gte', value: day.startIso },
        { column: 'created_at', op: 'lt', value: day.endIso },
      ]
      const [created, rejected] = await Promise.all([
        countView('bo_approvals', within),
        countView('bo_approvals', [...within, { column: 'status', op: 'eq', value: 'rejected' }]),
      ])
      return { day: day.key, created, rejected }
    }),
  )
}

// ===========================================================================
// Briefing and capture quality
// ===========================================================================

export interface BriefingQualityRow {
  kind: string
  total: number
  ready: number
  failed: number
  skipped: number
  opened: number
  /** Weighted by ready briefings; the view rounds each day's average to a second. */
  generationSeconds: number | null
}

export interface BriefingQualityDay {
  day: string
  ready: number
  opened: number
  failed: number
}

export interface BriefingQuality {
  byKind: readonly BriefingQualityRow[]
  daily: readonly BriefingQualityDay[]
}

/** Rows a daily health view can return for a 30-day window: kinds × days. */
const HEALTH_ROW_LIMIT = 400

export async function loadBriefingQuality(
  dayCount: number,
  clock: Clock = systemClock,
): Promise<BriefingQuality> {
  const oldest = oldestDayKey(clock, dayCount)
  const rows = await queryView('bo_briefing_health', {
    filters: [{ column: 'for_date', op: 'gte', value: oldest }],
    order: [
      { column: 'for_date', ascending: false },
      { column: 'kind', ascending: true },
    ],
    limit: HEALTH_ROW_LIMIT,
  })

  const byKind = new Map<string, BriefingQualityRow & { weighted: number; weight: number }>()
  const byDay = new Map<string, BriefingQualityDay>(
    recentDays(clock, dayCount).map((day) => [
      day.key,
      { day: day.key, ready: 0, opened: 0, failed: 0 },
    ]),
  )

  for (const row of rows) {
    const kind = byKind.get(row.kind) ?? {
      kind: row.kind,
      total: 0,
      ready: 0,
      failed: 0,
      skipped: 0,
      opened: 0,
      generationSeconds: null,
      weighted: 0,
      weight: 0,
    }
    kind.total += row.total_count
    kind.ready += row.ready_count
    kind.failed += row.failed_count
    kind.skipped += row.skipped_count
    kind.opened += row.opened_count
    if (row.avg_generation_seconds !== null && row.ready_count > 0) {
      kind.weighted += row.avg_generation_seconds * row.ready_count
      kind.weight += row.ready_count
    }
    byKind.set(row.kind, kind)

    const day = byDay.get(row.for_date)
    if (day) {
      day.ready += row.ready_count
      day.opened += row.opened_count
      day.failed += row.failed_count
    }
  }

  return {
    byKind: [...byKind.values()]
      .map(({ weighted, weight, ...rest }) => ({
        ...rest,
        generationSeconds: weight > 0 ? weighted / weight : null,
      }))
      .sort((left, right) => right.total - left.total),
    daily: [...byDay.values()],
  }
}

export interface CaptureQualityRow {
  kind: string
  total: number
  ready: number
  failed: number
  classified: number
  analysisSeconds: number | null
}

export async function loadCaptureQuality(
  dayCount: number,
  clock: Clock = systemClock,
): Promise<readonly CaptureQualityRow[]> {
  const oldest = oldestDayKey(clock, dayCount)
  const rows = await queryView('bo_capture_health', {
    filters: [{ column: 'capture_date', op: 'gte', value: oldest }],
    order: [
      { column: 'capture_date', ascending: false },
      { column: 'kind', ascending: true },
    ],
    limit: HEALTH_ROW_LIMIT,
  })

  const byKind = new Map<string, CaptureQualityRow & { weighted: number; weight: number }>()

  for (const row of rows) {
    const kind = byKind.get(row.kind) ?? {
      kind: row.kind,
      total: 0,
      ready: 0,
      failed: 0,
      classified: 0,
      analysisSeconds: null,
      weighted: 0,
      weight: 0,
    }
    kind.total += row.total_count
    kind.ready += row.ready_count
    kind.failed += row.failed_count
    kind.classified += row.classified_count
    if (row.avg_analysis_seconds !== null && row.ready_count > 0) {
      kind.weighted += row.avg_analysis_seconds * row.ready_count
      kind.weight += row.ready_count
    }
    byKind.set(row.kind, kind)
  }

  return [...byKind.values()]
    .map(({ weighted, weight, ...rest }) => ({
      ...rest,
      analysisSeconds: weight > 0 ? weighted / weight : null,
    }))
    .sort((left, right) => right.total - left.total)
}

// ===========================================================================
// The cost ceiling
// ===========================================================================

export interface QuotaReview {
  at: string
  decision: string | null
  reason: string | null
  staffUserId: string | null
}

export interface CeilingEntry {
  userId: string
  emailRedacted: string | null
  costMicrosWindow: number
  costMicros24h: number
  costMicros7d: number
  costMicros30d: number
  eventCount30d: number
  modelCount: number
  firstEventAt: string | null
  lastEventAt: string | null
  subscriptionStatus: string | null
  isDeleted: boolean
  tier: CapTier
  capPerDay: number
  /** Days the average divides by: capped at 30, never below 1. */
  activeDays: number
  dailyAverageEvents: number
  /** Daily average as a share of the plan's enforced 24-hour ceiling. */
  capRatio: number
  lastReview: QuotaReview | null
}

export interface CeilingQuery {
  window: SpendWindowKey
  /** Micros. Zero means "any spend at all in the window". */
  minCostMicros: number
  /** Which column Postgres orders by — money, or proximity to the call cap. */
  sort: CeilingSort
  limit: number
  offset: number
}

export interface CeilingPage {
  entries: readonly CeilingEntry[]
  total: number
}

/** Newest reviews read per page of users. Comfortably more than one each. */
const REVIEW_SAMPLE_LIMIT = 200

/** The rolling window `event_count_30d` covers, and the cap on `activeDays`. */
const AVERAGE_WINDOW_DAYS = 30

function costFilter(query: CeilingQuery): ViewFilter<BoAiSpendRow> {
  const column = SPEND_COST_COLUMN[query.window]
  return query.minCostMicros > 0
    ? { column, op: 'gte', value: query.minCostMicros }
    : { column, op: 'gt', value: 0 }
}

/**
 * One page of the per-user spend distribution, enriched with the plan ceiling
 * each user is actually measured against and the last review an operator filed.
 *
 * Three queries, in two waves. The first is ordered and paginated in Postgres,
 * so "the twenty most expensive accounts in this window" is a real `ORDER BY …
 * LIMIT`, not a sort of everything. The second wave asks `bo_users` and
 * `bo_audit` about exactly those twenty ids.
 *
 * `dailyAverageEvents` is the one derived figure. The enforced cap counts calls
 * in a rolling 24 hours per user, and no content-blind view exposes that; what
 * exists is `event_count_30d`. So the average divides that by the days the user
 * has actually been making calls — clamped to the 30-day window, and never
 * below one so a first-day account is not divided into a fantasy. The column
 * header on the page states the derivation.
 */
export async function loadCeilingPage(
  query: CeilingQuery,
  clock: Clock = systemClock,
): Promise<CeilingPage> {
  const column = SPEND_COST_COLUMN[query.window]

  // Either ordering is a real `ORDER BY … LIMIT` on the view; the tie-break on
  // `user_id` makes paging stable, so page two cannot repeat a row from page
  // one when two accounts hold the same figure.
  const sortColumn: keyof BoAiSpendRow & string =
    query.sort === 'cagri' ? 'event_count_30d' : column
  const order: readonly ViewOrder<BoAiSpendRow>[] = [
    { column: sortColumn, ascending: false },
    { column: 'user_id', ascending: true },
  ]

  const page = await queryViewPage('bo_ai_spend', {
    filters: [costFilter(query)],
    order,
    limit: query.limit,
    offset: query.offset,
  })

  if (page.rows.length === 0) return { entries: [], total: page.total }

  const ids = page.rows.map((row) => row.user_id)

  const [users, reviews] = await Promise.all([
    queryView('bo_users', {
      columns: ['user_id', 'subscription_status', 'is_deleted'],
      filters: [{ column: 'user_id', op: 'in', value: ids }],
      order: { column: 'user_id', ascending: true },
      limit: ids.length,
    }),
    queryView('bo_audit', {
      columns: ['entity_id', 'created_at', 'outcome', 'staff_reason', 'staff_user_id'],
      filters: [
        { column: 'action', op: 'eq', value: QUOTA_REVIEW_ACTION },
        { column: 'entity_id', op: 'in', value: ids },
      ],
      order: { column: 'created_at', ascending: false },
      limit: REVIEW_SAMPLE_LIMIT,
    }),
  ])

  const byUser = new Map(users.map((row) => [row.user_id, row]))
  const latestReview = new Map<string, BoAuditRow>()
  for (const row of reviews) {
    // The list arrives newest first, so the first sighting of an id is the last
    // review of that account.
    if (row.entity_id !== null && !latestReview.has(row.entity_id)) {
      latestReview.set(row.entity_id, row)
    }
  }

  const nowMs = clock.now().getTime()
  const windowStartMs = nowMs - AVERAGE_WINDOW_DAYS * DAY_MS

  const entries = page.rows.map((row): CeilingEntry => {
    const user = byUser.get(row.user_id)
    const tier = capTierFor(user?.subscription_status ?? null)
    const capPerDay = DAILY_EVENT_CAP[tier]

    const firstMs = row.first_event_at === null ? Number.NaN : Date.parse(row.first_event_at)
    const startMs = Number.isNaN(firstMs) ? windowStartMs : Math.max(firstMs, windowStartMs)
    const activeDays = Math.min(
      AVERAGE_WINDOW_DAYS,
      Math.max(1, Math.round((nowMs - startMs) / DAY_MS)),
    )
    const dailyAverageEvents = row.event_count_30d / activeDays

    const review = latestReview.get(row.user_id)

    return {
      userId: row.user_id,
      emailRedacted: row.email_redacted,
      costMicrosWindow: row[column],
      costMicros24h: row.cost_micros_24h,
      costMicros7d: row.cost_micros_7d,
      costMicros30d: row.cost_micros_30d,
      eventCount30d: row.event_count_30d,
      modelCount: row.model_count,
      firstEventAt: row.first_event_at,
      lastEventAt: row.last_event_at,
      subscriptionStatus: user?.subscription_status ?? null,
      isDeleted: user?.is_deleted ?? false,
      tier,
      capPerDay,
      activeDays,
      dailyAverageEvents,
      capRatio: dailyAverageEvents / capPerDay,
      lastReview:
        review === undefined
          ? null
          : {
              at: review.created_at,
              decision: review.outcome,
              reason: review.staff_reason,
              staffUserId: review.staff_user_id,
            },
    }
  })

  return { entries, total: page.total }
}

export interface UserSpendSnapshot {
  costMicros24h: number
  costMicros7d: number
  costMicros30d: number
  eventCount30d: number
  modelCount: number
  lastEventAt: string | null
}

/**
 * One user's spend totals, read fresh at the moment a review is filed.
 *
 * The Server Action writes these into the audit row rather than trusting the
 * numbers the form was rendered with: a review that says "1.4 dolar" has to
 * mean the figure the database held when the operator pressed the button, not
 * whatever a stale tab was showing. A user with no `bo_ai_spend` row has never
 * called a model, and there is nothing to review.
 */
export async function loadUserSpendSnapshot(userId: string): Promise<UserSpendSnapshot | null> {
  const row = await queryViewOne('bo_ai_spend', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
  })
  if (row === null) return null
  return {
    costMicros24h: row.cost_micros_24h,
    costMicros7d: row.cost_micros_7d,
    costMicros30d: row.cost_micros_30d,
    eventCount30d: row.event_count_30d,
    modelCount: row.model_count,
    lastEventAt: row.last_event_at,
  }
}

export interface CeilingSummary {
  /** Users matching exactly the table's filters, counted by Postgres. */
  spendersInWindow: number
  topUserCostMicros: number | null
  platformCost24hMicros: number | null
  platformCost30dMicros: number | null
  generatedAt: string | null
}

export async function loadCeilingSummary(query: CeilingQuery): Promise<CeilingSummary> {
  const column = SPEND_COST_COLUMN[query.window]

  const [spendersInWindow, top, overview] = await Promise.all([
    countView('bo_ai_spend', [costFilter(query)]),
    queryViewOne('bo_ai_spend', {
      columns: [column],
      filters: [{ column, op: 'gt', value: 0 }],
      order: { column, ascending: false },
    }),
    queryViewOne('bo_platform_overview', {
      columns: ['ai_cost_micros_24h', 'ai_cost_micros_30d', 'generated_at'],
    }),
  ])

  return {
    spendersInWindow,
    topUserCostMicros: top === null ? null : top[column],
    platformCost24hMicros: overview?.ai_cost_micros_24h ?? null,
    platformCost30dMicros: overview?.ai_cost_micros_30d ?? null,
    generatedAt: overview?.generated_at ?? null,
  }
}
