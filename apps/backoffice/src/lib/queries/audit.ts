import 'server-only'

import {
  MINUTE_MS,
  RETENTION_SWEEP,
  isAppError,
  systemClock,
  toIsoDate,
  zonedTimeToUtc,
  type Clock,
} from '@da/domain'
import {
  ACCESS_ACTION,
  ACCESS_ENTITY_TYPE,
  ACTION_COUNT_LIMIT,
  ACTION_DISCOVERY_LIMIT,
  ACTOR_BUCKETS,
  ACTOR_BUCKET_VALUE,
  CANONICAL_ACTIONS,
  DEFAULT_RANGE_PRESET,
  OUTCOME_BUCKETS,
  QUERY_POOL_SIZE,
  RANGE_PRESETS,
  RANGE_PRESET_DAYS,
  REVIEW_ACTION,
  REVIEW_ENTITY_TYPE,
  SUCCESS_OUTCOME,
  SWEEP_ACTION,
  SWEEP_HOUR_UTC,
  SWEEP_MINUTE_UTC,
  isIsoDate,
  type ActorBucket,
  type AuditCursor,
  type OutcomeBucket,
  type PageDirection,
  type RangePreset,
} from '@/components/audit/contract'
import { countView, queryView, queryViewOne, type BoAuditRow, type ViewFilter } from '@/lib/db'
import { OPS_TIME_ZONE } from '@/lib/format'
import { messages } from '@/lib/messages'

/**
 * Every query the audit area makes.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE MAY SEE
 * ---------------------------------------------------------------------------
 *
 * `audit_logs` is the one table a support tool has a genuine reason to read
 * end to end, and it is also the table most likely to accumulate something it
 * should not — a metadata blob is a tempting place to stash "just the subject
 * line, for debugging". Migration 0017 answers that by never projecting the
 * document: `bo_audit` lifts four named scalars out of `metadata` (`actor`,
 * `staff_user_id`, `staff_role`, `outcome`), each through `bo_identifier()`,
 * and otherwise exposes only the *names* of the metadata keys. A subject line
 * put into metadata by a careless writer would arrive here as the string
 * `"subject"` in `metadata_keys` and nothing else — the key is visible, its
 * value is unreachable.
 *
 * The one free-text column the view does expose is `staff_reason`, and only on
 * rows whose actor is `staff`: it is the justification a staff member typed
 * into this console before a destructive action. It is staff-authored text
 * about a staff action, no user-content column feeds it, and a reader who could
 * type it already had it.
 *
 * Everything below is bounded by that view and by nothing else it could reach:
 * `queryView` and `countView` accept only `BoViewName`, so there is no spelling
 * of a query in this file that names a base table.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Every figure the audit pages render is a `count(*)` executed by Postgres.
 * `countView` issues a HEAD request with `count=exact`, so no row body crosses
 * the wire at all, and the buckets are built so their counts partition the
 * table exactly — the three outcome buckets sum to the total, and the four
 * actor buckets plus a derived remainder do the same.
 *
 * There is exactly one place that reads rows in order to learn something rather
 * than to display them, and it is labelled on screen: `discoverActions` reads
 * the `action` column of a bounded, newest-first page to find out which action
 * tokens actually occur, because PostgREST cannot express `select distinct` and
 * the vocabulary is open at the database level. It contributes no number — the
 * counts it feeds are still exact `count(*)`s — and the breakdown prints the
 * remainder so a token neither it nor the canonical list knows about is visible
 * as a figure rather than missing.
 *
 * ---------------------------------------------------------------------------
 * WHY PAGINATION IS KEYSET
 * ---------------------------------------------------------------------------
 *
 * `audit_logs` only ever grows, and this is the page a regulator is shown, so
 * it has to still work at ten million rows. An `OFFSET` pager makes Postgres
 * walk and discard every skipped row on every click, and — worse for a trail —
 * a row written between two clicks shifts the whole result set, so paging
 * forward silently skips rows and paging back repeats them. `loadLogPage`
 * instead continues from the last row it showed: `(created_at, audit_id)`.
 *
 * PostgREST has no row-value comparison, so `(created_at, audit_id) < (T, ID)`
 * cannot be written as one filter. It is written as its two disjuncts instead —
 * rows strictly older than T, and rows exactly at T with a smaller id — issued
 * as two bounded queries and concatenated in order. That is exact: no row is
 * skipped, none is repeated, and neither query is unbounded.
 */

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result that carries its own failure, so a panel built from one
 * renders an error state instead of blanking and a single dead view never takes
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

/** Runs `run` over `items` with at most `size` requests in flight at once. */
async function mapPooled<T, R>(
  items: readonly T[],
  size: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) return
      results[index] = await run(item)
    }
  }

  const workers = Array.from({ length: Math.min(size, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

// ===========================================================================
// The range
//
// Calendar days in Europe/Istanbul. Both ends are inclusive dates an operator
// picked; the query uses the half-open instant range they denote, so a row
// written at 23:59:59.999 on the last day is inside and the first millisecond
// of the next day is not.
// ===========================================================================

export interface AuditRange {
  /** Inclusive first day, `YYYY-MM-DD` in Istanbul. */
  fromDate: string
  /** Inclusive last day, `YYYY-MM-DD` in Istanbul. */
  toDate: string
  /** Istanbul midnight starting `fromDate`, as a UTC instant. */
  fromInstant: string
  /** Istanbul midnight starting the day after `toDate`, as a UTC instant. */
  toExclusiveInstant: string
  /** The preset this range happens to equal, when it equals one. */
  preset: RangePreset | null
  /** True when the requested end was in the future and was pulled back to today. */
  clamped: boolean
  /** True when the two dates arrived the wrong way round and were swapped. */
  swapped: boolean
}

/** `YYYY-MM-DD` shifted by whole calendar days. Pure label arithmetic. */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate(),
  ).padStart(2, '0')}`
}

/** The UTC instant at which Istanbul's clock reads midnight on `date`. */
function startOfDayInstant(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return zonedTimeToUtc(
    { year: year ?? 1970, month: month ?? 1, day: day ?? 1, hour: 0, minute: 0 },
    OPS_TIME_ZONE,
  ).toISOString()
}

function compareDates(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** The first day of a preset that ends today. */
function presetStart(today: string, preset: RangePreset): string {
  return shiftDate(today, -(RANGE_PRESET_DAYS[preset] - 1))
}

export interface RangePresetOption {
  key: RangePreset
  from: string
  to: string
}

/**
 * The preset shortcuts, resolved against the operator's today.
 *
 * Computed on the server from the injected clock and handed to the picker as
 * plain dates, so the client component never has to ask what day it is.
 */
export function rangePresetOptions(clock: Clock = systemClock): readonly RangePresetOption[] {
  const today = toIsoDate(clock.now(), OPS_TIME_ZONE)
  return RANGE_PRESETS.map((key) => ({ key, from: presetStart(today, key), to: today }))
}

/**
 * Turn two raw query parameters into a usable range.
 *
 * Anything unparseable falls back rather than throwing: a range is navigation,
 * and a mistyped URL should land an operator on a sensible page, not an error
 * boundary. What was corrected is reported so the page can say so.
 */
export function resolveRange(
  fromRaw: string | null,
  toRaw: string | null,
  clock: Clock = systemClock,
): AuditRange {
  const today = toIsoDate(clock.now(), OPS_TIME_ZONE)
  const hasFrom = fromRaw !== null && isIsoDate(fromRaw)
  const hasTo = toRaw !== null && isIsoDate(toRaw)

  let from: string
  let to: string
  if (hasFrom && hasTo) {
    from = fromRaw
    to = toRaw
  } else if (hasTo) {
    to = toRaw
    from = shiftDate(to, -(RANGE_PRESET_DAYS[DEFAULT_RANGE_PRESET] - 1))
  } else if (hasFrom) {
    from = fromRaw
    to = today
  } else {
    to = today
    from = presetStart(today, DEFAULT_RANGE_PRESET)
  }

  let swapped = false
  if (compareDates(from, to) > 0) {
    const held = from
    from = to
    to = held
    swapped = true
  }

  let clamped = false
  if (compareDates(to, today) > 0) {
    to = today
    clamped = true
    if (compareDates(from, to) > 0) from = to
  }

  const preset =
    RANGE_PRESETS.find((key) => to === today && from === presetStart(today, key)) ?? null

  return {
    fromDate: from,
    toDate: to,
    fromInstant: startOfDayInstant(from),
    toExclusiveInstant: startOfDayInstant(shiftDate(to, 1)),
    preset,
    clamped,
    swapped,
  }
}

// ===========================================================================
// The scope — the range plus the four filters every query on the page shares
// ===========================================================================

export interface AuditScope {
  range: AuditRange
  actor: ActorBucket | null
  action: string | null
  outcome: OutcomeBucket | null
  subjectUserId: string | null
}

function rangeFilters(range: AuditRange): ViewFilter<BoAuditRow>[] {
  return [
    { column: 'created_at', op: 'gte', value: range.fromInstant },
    { column: 'created_at', op: 'lt', value: range.toExclusiveInstant },
  ]
}

function actorFilter(actor: ActorBucket): ViewFilter<BoAuditRow> {
  const value = ACTOR_BUCKET_VALUE[actor]
  return value === null
    ? { column: 'actor', op: 'is', value: null }
    : { column: 'actor', op: 'eq', value }
}

/**
 * The outcome buckets, as filters.
 *
 * `neq` is `<> 'success'` in SQL, which is NULL — and therefore false — for a
 * row with no outcome key. That is what makes the three buckets a partition
 * rather than three overlapping views of the same rows.
 */
function outcomeFilter(outcome: OutcomeBucket): ViewFilter<BoAuditRow> {
  switch (outcome) {
    case 'basarili':
      return { column: 'outcome', op: 'eq', value: SUCCESS_OUTCOME }
    case 'hata':
      return { column: 'outcome', op: 'neq', value: SUCCESS_OUTCOME }
    case 'belirtilmemis':
      return { column: 'outcome', op: 'is', value: null }
  }
}

export function scopeFilters(scope: AuditScope): ViewFilter<BoAuditRow>[] {
  const filters = rangeFilters(scope.range)
  if (scope.actor !== null) filters.push(actorFilter(scope.actor))
  if (scope.action !== null) filters.push({ column: 'action', op: 'eq', value: scope.action })
  if (scope.outcome !== null) filters.push(outcomeFilter(scope.outcome))
  if (scope.subjectUserId !== null) {
    filters.push({ column: 'subject_user_id', op: 'eq', value: scope.subjectUserId })
  }
  return filters
}

/** The same scope with one dimension replaced, for a tile that adds its own. */
function withActor(scope: AuditScope, actor: ActorBucket): AuditScope {
  return { ...scope, actor }
}

function withOutcome(scope: AuditScope, outcome: OutcomeBucket): AuditScope {
  return { ...scope, outcome }
}

// ===========================================================================
// Headline counts
// ===========================================================================

/** Rows matching the scope exactly. The same number the table is a page of. */
export async function countMatching(scope: AuditScope): Promise<number> {
  return countView('bo_audit', scopeFilters(scope))
}

/** Rows a staff member caused, inside the rest of the scope. */
export async function countStaffRows(scope: AuditScope): Promise<number> {
  return countView('bo_audit', scopeFilters(withActor(scope, 'ekip')))
}

/** Rows carrying an outcome that is not `success`, inside the rest of the scope. */
export async function countFailedRows(scope: AuditScope): Promise<number> {
  return countView('bo_audit', scopeFilters(withOutcome(scope, 'hata')))
}

/**
 * Rows attributable to a user.
 *
 * PostgREST can filter `is null` but not `not is null`, so this is the total
 * minus the null ones — two exact counts and one subtraction, rather than a
 * page of rows tallied in JavaScript.
 */
export async function countUserLinkedRows(scope: AuditScope): Promise<number> {
  const base = scopeFilters({ ...scope, subjectUserId: null })
  const [total, unlinked] = await Promise.all([
    countView('bo_audit', base),
    countView('bo_audit', [...base, { column: 'subject_user_id', op: 'is', value: null }]),
  ])
  return Math.max(0, total - unlinked)
}

// ===========================================================================
// The keyset page
// ===========================================================================

export interface LogPage {
  rows: readonly BoAuditRow[]
  /** A newer page exists above this one. */
  hasNewer: boolean
  /** An older page exists below it. */
  hasOlder: boolean
  /** Cursor for the newer page: the first row on this one. */
  newerCursor: AuditCursor | null
  /** Cursor for the older page: the last row on this one. */
  olderCursor: AuditCursor | null
}

const NEWEST_FIRST = [
  { column: 'created_at' as const, ascending: false },
  { column: 'audit_id' as const, ascending: false },
]

const OLDEST_FIRST = [
  { column: 'created_at' as const, ascending: true },
  { column: 'audit_id' as const, ascending: true },
]

function cursorOf(row: BoAuditRow | undefined): AuditCursor | null {
  return row === undefined ? null : { at: row.created_at, id: row.audit_id }
}

function pageOf(rows: readonly BoAuditRow[], size: number, hasNewer: boolean): LogPage {
  const page = rows.slice(0, size)
  return {
    rows: page,
    hasNewer: page.length === 0 ? false : hasNewer,
    hasOlder: rows.length > size,
    newerCursor: cursorOf(page[0]),
    olderCursor: cursorOf(page[page.length - 1]),
  }
}

/**
 * One keyset page of the trail.
 *
 * Without a cursor this is simply the newest `size` rows. With one it is the
 * rows immediately after (or before) that exact row, found as the two disjuncts
 * of a row-value comparison PostgREST cannot express directly: the tie query
 * handles rows sharing the cursor's timestamp to the microsecond, the range
 * query handles everything past it, and concatenating them in that order
 * reproduces the compound ordering exactly.
 */
export async function loadLogPage(
  scope: AuditScope,
  cursor: AuditCursor | null,
  direction: PageDirection,
  size: number,
): Promise<LogPage> {
  const filters = scopeFilters(scope)

  if (cursor === null) {
    const rows = await queryView('bo_audit', { filters, order: NEWEST_FIRST, limit: size + 1 })
    return pageOf(rows, size, false)
  }

  if (direction === 'ileri') {
    const [tied, older] = await Promise.all([
      queryView('bo_audit', {
        filters: [
          ...filters,
          { column: 'created_at', op: 'eq', value: cursor.at },
          { column: 'audit_id', op: 'lt', value: cursor.id },
        ],
        order: { column: 'audit_id', ascending: false },
        limit: size + 1,
      }),
      queryView('bo_audit', {
        filters: [...filters, { column: 'created_at', op: 'lt', value: cursor.at }],
        order: NEWEST_FIRST,
        limit: size + 1,
      }),
    ])
    return pageOf([...tied, ...older], size, true)
  }

  // Backwards: the same two disjuncts with the comparison and the ordering
  // flipped, read oldest-first from the cursor outwards and then reversed, so
  // the page renders newest-first like every other page.
  const [tied, newer] = await Promise.all([
    queryView('bo_audit', {
      filters: [
        ...filters,
        { column: 'created_at', op: 'eq', value: cursor.at },
        { column: 'audit_id', op: 'gt', value: cursor.id },
      ],
      order: { column: 'audit_id', ascending: true },
      limit: size + 1,
    }),
    queryView('bo_audit', {
      filters: [...filters, { column: 'created_at', op: 'gt', value: cursor.at }],
      order: OLDEST_FIRST,
      limit: size + 1,
    }),
  ])

  const ascending = [...tied, ...newer]
  const slice = ascending.slice(0, size).reverse()
  return {
    rows: slice,
    hasNewer: ascending.length > size,
    hasOlder: slice.length > 0,
    newerCursor: cursorOf(slice[0]),
    olderCursor: cursorOf(slice[slice.length - 1]),
  }
}

// ===========================================================================
// Review notes
//
// A review note is an ordinary audit row whose `entity_id` is the id of the row
// it reviews, so "has anyone looked at this" is answerable with the same view
// the page already reads — no second table, no join the backoffice could not
// express.
// ===========================================================================

export interface ReviewMark {
  count: number
  lastAt: string
  lastStaffUserId: string | null
}

/**
 * Which of the rows on screen carry a review note.
 *
 * One `in` query over the page's own ids, bounded by the page size, then
 * grouped. The grouping is over rows already fetched for display purposes —
 * it produces a marker, not a headline figure.
 */
export async function loadReviewMarks(
  auditIds: readonly string[],
): Promise<ReadonlyMap<string, ReviewMark>> {
  const marks = new Map<string, ReviewMark>()
  if (auditIds.length === 0) return marks

  const rows = await queryView('bo_audit', {
    filters: [
      { column: 'action', op: 'eq', value: REVIEW_ACTION },
      { column: 'entity_type', op: 'eq', value: REVIEW_ENTITY_TYPE },
      { column: 'entity_id', op: 'in', value: auditIds },
    ],
    order: { column: 'created_at', ascending: false },
    limit: Math.min(auditIds.length * 4, 400),
  })

  for (const row of rows) {
    const key = row.entity_id
    if (key === null) continue
    const existing = marks.get(key)
    if (existing === undefined) {
      marks.set(key, { count: 1, lastAt: row.created_at, lastStaffUserId: row.staff_user_id })
      continue
    }
    existing.count += 1
  }
  return marks
}

/** One row of the trail, by id. Null when it does not exist. */
export async function findAuditEntry(auditId: string): Promise<BoAuditRow | null> {
  return queryViewOne('bo_audit', {
    filters: [{ column: 'audit_id', op: 'eq', value: auditId }],
  })
}

/** The review notes filed against one entry, newest first. */
export async function loadEntryReviews(
  auditId: string,
  limit: number,
): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [
      { column: 'action', op: 'eq', value: REVIEW_ACTION },
      { column: 'entity_type', op: 'eq', value: REVIEW_ENTITY_TYPE },
      { column: 'entity_id', op: 'eq', value: auditId },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  })
}

function minutesAgo(minutes: number, clock: Clock): string {
  return new Date(clock.now().getTime() - minutes * MINUTE_MS).toISOString()
}

/**
 * Whether this operator already filed a note on this entry recently.
 *
 * A double-submitted form must not become two identical rows in the record it
 * is supposed to clarify.
 */
export async function hasRecentReview(
  auditId: string,
  staffUserId: string,
  minutes: number,
  clock: Clock = systemClock,
): Promise<boolean> {
  const count = await countView('bo_audit', [
    { column: 'action', op: 'eq', value: REVIEW_ACTION },
    { column: 'entity_id', op: 'eq', value: auditId },
    { column: 'staff_user_id', op: 'eq', value: staffUserId },
    { column: 'created_at', op: 'gte', value: minutesAgo(minutes, clock) },
  ])
  return count > 0
}

/** Whether this operator's view of this exact filter set is already recorded. */
export async function hasRecentAccessRecord(
  staffUserId: string,
  scopeKey: string,
  minutes: number,
  clock: Clock = systemClock,
): Promise<boolean> {
  const count = await countView('bo_audit', [
    { column: 'action', op: 'eq', value: ACCESS_ACTION },
    { column: 'entity_type', op: 'eq', value: ACCESS_ENTITY_TYPE },
    { column: 'entity_id', op: 'eq', value: scopeKey },
    { column: 'staff_user_id', op: 'eq', value: staffUserId },
    { column: 'created_at', op: 'gte', value: minutesAgo(minutes, clock) },
  ])
  return count > 0
}

// ===========================================================================
// Retention
//
// The window and the columns come from @da/domain's RETENTION_SWEEP, which is
// what `cleanup_expired_retention()` in migration 0012 implements and what the
// product's own privacy screen shows the user. Reading the same entry here is
// what stops the figure on this page from drifting away from the one Postgres
// actually enforces.
// ===========================================================================

const AUDIT_SWEEP_RULE = RETENTION_SWEEP.find((rule) => rule.table === 'audit_logs')

/**
 * 400 days, as written in 0012 and asserted by @da/domain's own tests. The
 * fallback exists only because the lookup is typed as optional; it is the same
 * number, so the page cannot show one figure while the job enforces another.
 */
export const AUDIT_RETENTION_DAYS = AUDIT_SWEEP_RULE?.fixedDays ?? 400

export const AUDIT_ANONYMISED_COLUMNS: readonly string[] = AUDIT_SWEEP_RULE?.anonymizeColumns ?? [
  'entity_id',
  'metadata',
]

const DAY_IN_MINUTES = 1440

/** The next time `15 3 * * *` UTC comes round after `now`. */
export function nextSweepAt(clock: Clock = systemClock): string {
  const now = clock.now()
  const todaysRun = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    SWEEP_HOUR_UTC,
    SWEEP_MINUTE_UTC,
  )
  const next = todaysRun > now.getTime() ? todaysRun : todaysRun + DAY_IN_MINUTES * MINUTE_MS
  return new Date(next).toISOString()
}

export interface RetentionStatus {
  days: number
  anonymisedColumns: readonly string[]
  /** Rows created before this instant are eligible to be stripped. */
  cutoff: string
  /** `created_at` of the oldest row still in the table. */
  oldestAt: string | null
  /** Rows past the cutoff, whatever state they are in. */
  overdueTotal: number
  /** Rows past the cutoff that carry neither an entity id nor any metadata. */
  strippedCount: number
  /** Rows past the cutoff that still carry something the sweep will remove. */
  pendingCount: number
  lastSweepAt: string | null
  nextSweepAt: string
}

/**
 * What the retention rule has actually done, rather than what it promises.
 *
 * A row whose metadata was emptied has no metadata keys left, so
 * `metadata_keys is null and entity_id is null` is exactly the shape the sweep
 * leaves behind. Subtracting that from the rows past the cutoff gives the
 * backlog: if it is not zero, the nightly job is behind and the page says so
 * instead of repeating the policy as though it were self-executing.
 */
export async function loadRetentionStatus(clock: Clock = systemClock): Promise<RetentionStatus> {
  const cutoff = new Date(
    clock.now().getTime() - AUDIT_RETENTION_DAYS * DAY_IN_MINUTES * MINUTE_MS,
  ).toISOString()

  const pastCutoff: ViewFilter<BoAuditRow>[] = [{ column: 'created_at', op: 'lt', value: cutoff }]

  const [oldest, overdueTotal, strippedCount, lastSweep] = await Promise.all([
    queryViewOne('bo_audit', {
      columns: ['audit_id', 'created_at'],
      order: { column: 'created_at', ascending: true },
    }),
    countView('bo_audit', pastCutoff),
    countView('bo_audit', [
      ...pastCutoff,
      { column: 'metadata_keys', op: 'is', value: null },
      { column: 'entity_id', op: 'is', value: null },
    ]),
    queryViewOne('bo_audit', {
      filters: [{ column: 'action', op: 'eq', value: SWEEP_ACTION }],
      order: { column: 'created_at', ascending: false },
    }),
  ])

  return {
    days: AUDIT_RETENTION_DAYS,
    anonymisedColumns: AUDIT_ANONYMISED_COLUMNS,
    cutoff,
    oldestAt: oldest?.created_at ?? null,
    overdueTotal,
    strippedCount,
    pendingCount: Math.max(0, overdueTotal - strippedCount),
    lastSweepAt: lastSweep?.created_at ?? null,
    nextSweepAt: nextSweepAt(clock),
  }
}

// ===========================================================================
// Distribution
// ===========================================================================

export interface BucketCount<Key extends string> {
  key: Key
  count: number
}

export interface ActorBreakdown {
  total: number
  buckets: readonly BucketCount<ActorBucket>[]
  /** Rows whose actor is a value none of this codebase writes. */
  other: number
}

/**
 * The four actor buckets, exactly counted, plus the remainder.
 *
 * The remainder is arithmetic rather than a fifth query because PostgREST has
 * no `not in` and inventing one would mean guessing the vocabulary. Total minus
 * the four is exact whatever the fifth value turns out to be.
 */
export async function loadActorBreakdown(scope: AuditScope): Promise<ActorBreakdown> {
  const base = { ...scope, actor: null }
  const [total, ...counts] = await Promise.all([
    countView('bo_audit', scopeFilters(base)),
    ...ACTOR_BUCKETS.map((bucket) => countView('bo_audit', scopeFilters(withActor(base, bucket)))),
  ])

  const buckets = ACTOR_BUCKETS.map((key, index) => ({ key, count: counts[index] ?? 0 }))
  const named = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  return { total, buckets, other: Math.max(0, total - named) }
}

export interface OutcomeBreakdown {
  total: number
  buckets: readonly BucketCount<OutcomeBucket>[]
}

/** The three outcome buckets. They partition the scope, so they sum to it. */
export async function loadOutcomeBreakdown(scope: AuditScope): Promise<OutcomeBreakdown> {
  const base = { ...scope, outcome: null }
  const [total, ...counts] = await Promise.all([
    countView('bo_audit', scopeFilters(base)),
    ...OUTCOME_BUCKETS.map((bucket) =>
      countView('bo_audit', scopeFilters(withOutcome(base, bucket))),
    ),
  ])
  return {
    total,
    buckets: OUTCOME_BUCKETS.map((key, index) => ({ key, count: counts[index] ?? 0 })),
  }
}

/**
 * Which action tokens actually occur in the range.
 *
 * The only read in this file that exists to learn rather than to display. It
 * projects one already-sanitised column, is bounded, and feeds nothing but the
 * list of tokens the exact counts are then taken over.
 */
export async function discoverActions(scope: AuditScope): Promise<readonly string[]> {
  const rows = await queryView('bo_audit', {
    columns: ['action'],
    filters: scopeFilters(scope),
    order: { column: 'created_at', ascending: false },
    limit: ACTION_DISCOVERY_LIMIT,
  })
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.action !== null) seen.add(row.action)
  }
  return [...seen]
}

export interface ActionBreakdown {
  total: number
  rows: readonly BucketCount<string>[]
  /** Rows whose action is not in the counted list. */
  remainder: number
  /** How many tokens were counted, and whether the list had to be cut short. */
  counted: number
  truncated: boolean
  /** Tokens the canonical list did not know about, discovered in the range. */
  discovered: readonly string[]
}

/**
 * An exact `count(*)` per action token over the scope.
 *
 * The token list is the canonical vocabulary unioned with whatever the
 * discovery read turned up, so a token added to an edge function after this
 * console shipped still gets counted. Only tokens with a non-zero count are
 * returned; the remainder makes any token that escaped both lists visible as a
 * number.
 */
export async function loadActionBreakdown(scope: AuditScope): Promise<ActionBreakdown> {
  const base = { ...scope, action: null }
  const discoveredList = await discoverActions(base)
  const discovered = discoveredList.filter((action) => !CANONICAL_ACTIONS.includes(action))

  const union = [...new Set<string>([...discoveredList, ...CANONICAL_ACTIONS])]
  const truncated = union.length > ACTION_COUNT_LIMIT
  const tokens = union.slice(0, ACTION_COUNT_LIMIT)

  const [total, counts] = await Promise.all([
    countView('bo_audit', scopeFilters(base)),
    mapPooled(tokens, QUERY_POOL_SIZE, async (action) =>
      countView('bo_audit', scopeFilters({ ...base, action })),
    ),
  ])

  const rows = tokens
    .map((key, index) => ({ key, count: counts[index] ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))

  const named = rows.reduce((sum, row) => sum + row.count, 0)
  return {
    total,
    rows,
    remainder: Math.max(0, total - named),
    counted: tokens.length,
    truncated,
    discovered,
  }
}
