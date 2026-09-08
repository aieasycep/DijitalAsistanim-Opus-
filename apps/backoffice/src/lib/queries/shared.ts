import 'server-only'

import { DAY_MS, HOUR_MS, isAppError, systemClock, type Clock, type ErrorCode } from '@da/domain'
import { isoDateSchema, isoInstantSchema, uuidSchema } from '@da/validation'
import {
  countBuckets,
  countTable,
  countView,
  extremeOf,
  queryTable,
  queryTableKeyset,
  queryTableOne,
  queryView,
  queryViewKeyset,
  queryViewOne,
  queryViewPage,
  type AdminTableName,
  type AdminTableRows,
  type BoViewName,
  type BoViewRows,
  type ViewFilter,
  type ViewOrder,
} from '../db'
import {
  buildOffsetPage,
  emptyKeysetPage,
  emptyOffsetPage,
  firstParam,
  parseOffsetPageRequest,
  parsePageRequest,
  type KeysetCursor,
  type KeysetPage,
  type OffsetPage,
  type OffsetPageRequest,
  type PageRequest,
  type RawSearchParams,
} from '../pagination'

/**
 * The primitives every module's query file is built out of.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS EXISTS TO PREVENT
 * ---------------------------------------------------------------------------
 *
 * Seven module query files already exist, and between them they had written the
 * same four things seven times: read a filter out of `searchParams`, walk a list
 * a page at a time, count rows by status, and turn a thrown `AppError` into
 * something a panel can render instead of a blank screen. Written seven times,
 * those four things are seven chances to fetch a whole table and count it in
 * JavaScript, or to page with an offset and silently skip a row.
 *
 * So they are written once, here, in the shape the schema actually rewards:
 *
 *   - **Paging is keyset.** `timeOrderedPage` needs a time column and a unique
 *     id, which every list in 0017 and 0019 has, and it is an index seek on
 *     page 400 as much as on page 1.
 *   - **Counting is SQL.** `countView` is a `head` request that transfers no
 *     rows at all, and `countBuckets` runs a dashboard's whole tile row as
 *     concurrent counts rather than as one download and a loop.
 *   - **Parameters are validated.** A uuid from a query string is checked
 *     against `@da/validation`'s `uuidSchema` — the same schema the API uses —
 *     before it reaches a filter, so a malformed URL produces an empty list
 *     rather than a database error.
 *   - **Failure is a value.** `attempt` turns a failed read into a rendered
 *     panel with a retry, so one slow view does not blank a page that had five
 *     other panels' worth of usable answers on it.
 *
 * This module deliberately re-exports the `db.ts` primitives a query file needs,
 * so a module has one import for its data layer rather than three.
 */

export {
  countBuckets,
  countTable,
  countView,
  extremeOf,
  queryTable,
  queryTableKeyset,
  queryTableOne,
  queryView,
  queryViewKeyset,
  queryViewOne,
  queryViewPage,
}
export { parsePageRequest, parseOffsetPageRequest, emptyKeysetPage, emptyOffsetPage }
export type {
  KeysetCursor,
  KeysetPage,
  OffsetPage,
  OffsetPageRequest,
  PageRequest,
  RawSearchParams,
  ViewFilter,
  ViewOrder,
}

// ===========================================================================
// Search parameters
// ===========================================================================

/** Next 16 hands a page its `searchParams` as a promise. */
export type AwaitableSearchParams = RawSearchParams | Promise<RawSearchParams>

export async function readSearchParams(
  input: AwaitableSearchParams | undefined,
): Promise<RawSearchParams> {
  if (input === undefined) return {}
  return await input
}

/**
 * A value from a closed set, or the fallback.
 *
 * The point is that a filter reaching a query is always one of the values the
 * screen offers. `?status=' or 1=1--` is not a database problem here because it
 * is not a member of the union and never becomes one.
 */
export function parseEnumParam<T extends string>(
  params: RawSearchParams,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = firstParam(params, name)
  if (raw === undefined) return fallback
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
}

/** As `parseEnumParam`, but "no filter" is a legitimate answer. */
export function parseOptionalEnumParam<T extends string>(
  params: RawSearchParams,
  name: string,
  allowed: readonly T[],
): T | null {
  const raw = firstParam(params, name)
  if (raw === undefined || raw === '') return null
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null
}

/** A uuid, validated with the same schema the API validates one with. */
export function parseUuidParam(params: RawSearchParams, name: string): string | null {
  const raw = firstParam(params, name)
  if (raw === undefined || raw === '') return null
  return uuidSchema.safeParse(raw).success ? raw : null
}

/** An ISO-8601 instant, or null. */
export function parseInstantParam(params: RawSearchParams, name: string): string | null {
  const raw = firstParam(params, name)
  if (raw === undefined || raw === '') return null
  return isoInstantSchema.safeParse(raw).success ? raw : null
}

/** A `YYYY-MM-DD` calendar date, or null. */
export function parseDateParam(params: RawSearchParams, name: string): string | null {
  const raw = firstParam(params, name)
  if (raw === undefined || raw === '') return null
  return isoDateSchema.safeParse(raw).success ? raw : null
}

/** Longest search term the console accepts, so a filter stays an index seek. */
export const MAX_SEARCH_LENGTH = 120

/**
 * A free-text search term, trimmed and bounded.
 *
 * Returned as a plain string for the caller to place in an `eq` or a prefix
 * filter of its own choosing. It is never interpolated into SQL — PostgREST
 * parameterises every filter value — and it is length-bounded so a pathological
 * term cannot turn a lookup into a sequential scan.
 */
export function parseSearchParam(params: RawSearchParams, name = 'q'): string | null {
  const raw = firstParam(params, name)
  if (raw === undefined) return null
  const trimmed = raw.trim().slice(0, MAX_SEARCH_LENGTH)
  return trimmed === '' ? null : trimmed
}

/** True/false/absent, for a three-state toggle. */
export function parseBooleanParam(params: RawSearchParams, name: string): boolean | null {
  const raw = firstParam(params, name)
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return null
}

// ===========================================================================
// Time windows
//
// Every operational screen is "the last N", and every one of them needs the
// same cutoff computed the same way — from the injected clock, never from
// `new Date()`, so a test can pin it and a timezone cannot move it.
// ===========================================================================

export const TIME_WINDOWS = ['24h', '7d', '30d', '90d'] as const
export type TimeWindow = (typeof TIME_WINDOWS)[number]

const WINDOW_MS: Readonly<Record<TimeWindow, number>> = Object.freeze({
  '24h': 24 * HOUR_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
})

export interface ResolvedWindow {
  window: TimeWindow
  /** Inclusive lower bound, ISO-8601. */
  fromIso: string
  /** The instant the page was rendered, ISO-8601. */
  toIso: string
  /** Whole days the window covers, for a label. */
  days: number
}

export function resolveWindow(window: TimeWindow, clock: Clock = systemClock): ResolvedWindow {
  const now = clock.now()
  const from = new Date(now.getTime() - WINDOW_MS[window])
  return {
    window,
    fromIso: from.toISOString(),
    toIso: now.toISOString(),
    days: Math.round(WINDOW_MS[window] / DAY_MS),
  }
}

export function parseWindowParam(
  params: RawSearchParams,
  fallback: TimeWindow = '7d',
  name = 'window',
): TimeWindow {
  return parseEnumParam(params, name, TIME_WINDOWS, fallback)
}

/** An ISO instant `ms` milliseconds before the clock's now. */
export function sinceIso(ms: number, clock: Clock = systemClock): string {
  return new Date(clock.now().getTime() - ms).toISOString()
}

// ===========================================================================
// Filters
// ===========================================================================

/**
 * Drop the filters that did not apply.
 *
 * Optional query parameters produce optional filters, and the alternative to
 * this is an `if` around every `push` — which is where a filter eventually gets
 * pushed into the wrong array and a support screen starts showing another
 * customer's rows.
 */
export function compactFilters<Row>(
  ...filters: readonly (ViewFilter<Row> | null | undefined | false)[]
): readonly ViewFilter<Row>[] {
  const kept: ViewFilter<Row>[] = []
  for (const filter of filters) {
    if (filter !== null && filter !== undefined && filter !== false) kept.push(filter)
  }
  return kept
}

export function eqFilter<Row>(
  column: keyof Row & string,
  value: string | number | boolean | null | undefined,
): ViewFilter<Row> | null {
  if (value === null || value === undefined) return null
  return { column, op: 'eq', value }
}

export function inFilter<Row>(
  column: keyof Row & string,
  values: readonly string[] | null | undefined,
): ViewFilter<Row> | null {
  if (values === null || values === undefined || values.length === 0) return null
  return { column, op: 'in', value: values }
}

/** `column >= from`, when `from` is present. */
export function sinceFilter<Row>(
  column: keyof Row & string,
  fromIso: string | null | undefined,
): ViewFilter<Row> | null {
  if (fromIso === null || fromIso === undefined) return null
  return { column, op: 'gte', value: fromIso }
}

/** `column <= to`, when `to` is present. */
export function untilFilter<Row>(
  column: keyof Row & string,
  toIso: string | null | undefined,
): ViewFilter<Row> | null {
  if (toIso === null || toIso === undefined) return null
  return { column, op: 'lte', value: toIso }
}

/** Both ends of a range, in one call. */
export function rangeFilters<Row>(
  column: keyof Row & string,
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): readonly ViewFilter<Row>[] {
  return compactFilters<Row>(sinceFilter(column, fromIso), untilFilter(column, toIso))
}

/**
 * `column is null` / `column is not null`.
 *
 * The negation is `is_not` rather than `neq`: PostgREST's `neq.null` compares
 * against the four-letter string "null" and matches nothing, which produces an
 * empty panel that looks like an answer.
 */
export function nullFilter<Row>(column: keyof Row & string, isNull: boolean): ViewFilter<Row> {
  return isNull ? { column, op: 'is', value: null } : { column, op: 'is_not', value: null }
}

/**
 * A case-insensitive prefix match — a ticket reference, a flag key, a mail
 * domain. Anchored at the start so the comparison can still use an index; a
 * leading wildcard would turn every keystroke into a sequential scan.
 */
export function prefixFilter<Row>(
  column: keyof Row & string,
  term: string | null | undefined,
): ViewFilter<Row> | null {
  if (term === null || term === undefined || term === '') return null
  // `%` and `_` are LIKE metacharacters; an operator typing them means the
  // literal characters, not a wildcard they did not ask for.
  const escaped = term.replace(/[\\%_]/g, (match) => `\\${match}`)
  return { column, op: 'ilike', value: `${escaped}%` }
}

// ===========================================================================
// Paging a list
// ===========================================================================

function cursorFrom(at: unknown, id: unknown): KeysetCursor {
  return { at: String(at), id: String(id) }
}

/**
 * One keyset page of a time-ordered view — the shape of nearly every list here.
 *
 * `timeColumn` must be NOT NULL in the view. A nullable sort column breaks a
 * keyset silently: nulls compare outside every `<` and `>`, so the walk stops
 * early and the operator sees a list that ends where the data does not. Every
 * column this is used with in 0017 and 0019 (`created_at`, `requested_at`,
 * `revealed_at`, `granted_at`) is declared NOT NULL.
 */
export async function timeOrderedPage<V extends BoViewName>(
  view: V,
  options: {
    timeColumn: keyof BoViewRows[V] & string
    idColumn: keyof BoViewRows[V] & string
    request: PageRequest
    filters?: readonly ViewFilter<BoViewRows[V]>[]
    columns?: readonly (keyof BoViewRows[V] & string)[]
    /** Oldest first. Defaults to newest first, which is what a console wants. */
    ascending?: boolean
  },
): Promise<KeysetPage<BoViewRows[V]>> {
  const { timeColumn, idColumn } = options
  return queryViewKeyset(view, {
    key: {
      sortColumn: timeColumn,
      idColumn,
      descending: options.ascending !== true,
    },
    request: options.request,
    cursorOf: (row) => cursorFrom(row[timeColumn], row[idColumn]),
    ...(options.filters ? { filters: options.filters } : {}),
    ...(options.columns ? { columns: options.columns } : {}),
  })
}

/** As `timeOrderedPage`, for an operator-owned table. */
export async function timeOrderedTablePage<T extends AdminTableName>(
  table: T,
  options: {
    timeColumn: keyof AdminTableRows[T] & string
    idColumn: keyof AdminTableRows[T] & string
    request: PageRequest
    filters?: readonly ViewFilter<AdminTableRows[T]>[]
    columns?: readonly (keyof AdminTableRows[T] & string)[]
    ascending?: boolean
  },
): Promise<KeysetPage<AdminTableRows[T]>> {
  const { timeColumn, idColumn } = options
  return queryTableKeyset(table, {
    key: {
      sortColumn: timeColumn,
      idColumn,
      descending: options.ascending !== true,
    },
    request: options.request,
    cursorOf: (row) => cursorFrom(row[timeColumn], row[idColumn]),
    ...(options.filters ? { filters: options.filters } : {}),
    ...(options.columns ? { columns: options.columns } : {}),
  })
}

/**
 * A numbered page with a total, for the few screens where the total is the
 * answer — a reconciliation report, a ranked top ten over a pre-aggregated view.
 *
 * It costs an exact count on every request, which is why it is not the default.
 * `parseOffsetPageRequest` caps the page number so nobody can ask for offset
 * 10,000,000 by editing the URL.
 */
export async function numberedPage<V extends BoViewName>(
  view: V,
  options: {
    request: OffsetPageRequest
    order: ViewOrder<BoViewRows[V]> | readonly ViewOrder<BoViewRows[V]>[]
    filters?: readonly ViewFilter<BoViewRows[V]>[]
    columns?: readonly (keyof BoViewRows[V] & string)[]
  },
): Promise<OffsetPage<BoViewRows[V]>> {
  const page = await queryViewPage(view, {
    ...(options.filters ? { filters: options.filters } : {}),
    ...(options.columns ? { columns: options.columns } : {}),
    order: options.order,
    limit: options.request.size,
    offset: options.request.offset,
  })
  return buildOffsetPage(page.rows, page.total, options.request)
}

// ===========================================================================
// Failure as a value
// ===========================================================================

export type PanelResult<T> =
  { ok: true; data: T } | { ok: false; code: ErrorCode; retryable: boolean }

/**
 * Run one read and return its outcome instead of throwing.
 *
 * A console page is a grid of independent panels. If a single failing view took
 * the whole page to an error boundary, an operator investigating an outage would
 * lose the four panels that were working — usually the four that would have told
 * them what was wrong. Each panel renders its own error and its own retry, and
 * the page still renders.
 *
 * The `code` is the domain's own vocabulary, so the screen renders
 * `errors.<code>` and never a provider's message.
 */
export async function attempt<T>(load: () => Promise<T>): Promise<PanelResult<T>> {
  try {
    return { ok: true, data: await load() }
  } catch (error) {
    if (isAppError(error)) return { ok: false, code: error.code, retryable: error.retryable }
    return { ok: false, code: 'unknown', retryable: true }
  }
}

/** Several panels at once, each with its own outcome. */
export async function attemptAll<T extends Readonly<Record<string, () => Promise<unknown>>>>(
  loaders: T,
): Promise<{ [K in keyof T]: PanelResult<Awaited<ReturnType<T[K]>>> }> {
  const keys = Object.keys(loaders) as (keyof T)[]
  const results = await Promise.all(
    keys.map((key) => attempt(loaders[key] as () => Promise<unknown>)),
  )
  const out = {} as { [K in keyof T]: PanelResult<Awaited<ReturnType<T[K]>>> }
  keys.forEach((key, index) => {
    out[key] = results[index] as PanelResult<Awaited<ReturnType<T[typeof key]>>>
  })
  return out
}

/** The data, or a stand-in, for a panel that can degrade rather than fail. */
export function orElse<T>(result: PanelResult<T>, fallback: T): T {
  return result.ok ? result.data : fallback
}
