/**
 * URL arithmetic for the table.
 *
 * The table's whole state — which page, which sort, which columns — lives in
 * the query string and nowhere else. That is not a stylistic preference:
 *
 *   - the rows are fetched on the server, so the server has to be able to read
 *     the state from the request;
 *   - an operator pasting a link into a ticket must reproduce what they saw;
 *   - sorting a 40 000-row view in the browser would require having fetched
 *     40 000 rows, which is the thing the specification forbids.
 *
 * Every function here is pure and total, so the same helpers build the links
 * the server renders and the links the column menu navigates to.
 */

export type SortDirection = 'asc' | 'desc'

export interface TableSort {
  /** The column's `sortKey`, not its display key. */
  readonly key: string
  readonly direction: SortDirection
}

/** Where the table lives and what is currently on its query string. */
export interface TableLocation {
  /** The page's own path, e.g. `/users`. No query. */
  readonly path: string
  /** Every parameter currently set on the page, so none is dropped by a link. */
  readonly query: Readonly<Record<string, string>>
}

/** The parameter names. Overridable per page; these are the defaults. */
export const TABLE_PARAMS = {
  page: 'page',
  pageSize: 'size',
  sort: 'sort',
  columns: 'cols',
} as const

/**
 * Parameters that a filter or range change must clear.
 *
 * Changing what is being listed changes what page one contains, and a keyset
 * cursor points at a row in the previous result set — carrying either forward
 * lands an operator on an empty page and looks like "no results".
 *
 * Two vocabularies are listed because the console currently has two. The kit
 * uses `page` / `cursor`; the modules built before it use `sayfa` / `imlec`,
 * and clearing a parameter that is not present costs nothing. When those
 * modules move to English query parameters — the route segments already are —
 * the last two entries come out.
 */
export const PAGINATION_RESET_PARAMS: readonly string[] = Object.freeze([
  'page',
  'cursor',
  'sayfa',
  'imlec',
])

/**
 * `path?a=1&b=2`, with `patch` applied. A `null` removes the parameter, an
 * empty string removes it too — an empty filter is not a filter — and keys are
 * emitted in sorted order so the same state is always the same URL.
 */
export function withParams(
  location: TableLocation,
  patch: Readonly<Record<string, string | null>>,
): string {
  const next = new Map<string, string>()
  for (const [key, value] of Object.entries(location.query)) {
    if (value !== '') next.set(key, value)
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
  }
  const params = new URLSearchParams()
  for (const key of [...next.keys()].sort()) {
    params.set(key, next.get(key) ?? '')
  }
  const query = params.toString()
  return query === '' ? location.path : `${location.path}?${query}`
}

// ===========================================================================
// Sorting
// ===========================================================================

/** `created_at:desc` — the wire form of a sort. */
export function encodeSort(sort: TableSort): string {
  return `${sort.key}:${sort.direction}`
}

/**
 * Read a sort off the query string.
 *
 * `allowed` is the closed set of sortable columns. A parameter naming anything
 * else returns null rather than being passed to the database: the value ends up
 * in an `order by`, and an allowlist is what keeps that from being an injection
 * point as the query builder grows.
 */
export function parseSort(raw: string | undefined, allowed: readonly string[]): TableSort | null {
  if (raw === undefined || raw === '') return null
  const separator = raw.lastIndexOf(':')
  if (separator <= 0) return null
  const key = raw.slice(0, separator)
  const direction = raw.slice(separator + 1)
  if (!allowed.includes(key)) return null
  if (direction !== 'asc' && direction !== 'desc') return null
  return { key, direction }
}

/**
 * The sort a header click produces: first click descending, second ascending,
 * third clears it.
 *
 * Descending first because every sortable column in this console is a count, a
 * cost or a timestamp, and the interesting end of all three is the big end.
 */
export function nextSort(current: TableSort | null, key: string): TableSort | null {
  if (current === null || current.key !== key) return { key, direction: 'desc' }
  if (current.direction === 'desc') return { key, direction: 'asc' }
  return null
}

// ===========================================================================
// Column visibility
// ===========================================================================

/**
 * Hidden columns are listed, not the visible ones, so a table at its defaults
 * has no parameter at all.
 *
 * Three states, and the third is the reason for the sentinel:
 *
 *   - parameter absent  → `null`: the operator has not chosen, so each column's
 *     own `defaultHidden` applies;
 *   - parameter `-`     → `[]`: they chose, and chose to hide nothing. Without
 *     this, "show every column" would encode as an empty string, drop out of
 *     the URL, and be read back as "no choice" — which would immediately
 *     re-hide the columns marked `defaultHidden`;
 *   - parameter `a,b`   → `['a','b']`.
 */
export const ALL_COLUMNS_VISIBLE = '-'

export function parseColumnVisibility(raw: string | undefined): readonly string[] | null {
  if (raw === undefined || raw === '') return null
  if (raw === ALL_COLUMNS_VISIBLE) return []
  const keys = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '')
  return keys.length === 0 ? [] : keys
}

/** The inverse. `null` means "remove the parameter", never "hide nothing". */
export function encodeHiddenColumns(keys: readonly string[]): string | null {
  const unique = [...new Set(keys)].sort()
  return unique.length === 0 ? null : unique.join(',')
}

// ===========================================================================
// Pagination
// ===========================================================================

export interface PageWindow {
  /** 1-based. */
  readonly page: number
  readonly pageSize: number
  readonly total: number
  readonly lastPage: number
  /** 1-based index of the first row on this page; 0 when there are none. */
  readonly firstRow: number
  /** 1-based index of the last row on this page; 0 when there are none. */
  readonly lastRow: number
  readonly hasPrevious: boolean
  readonly hasNext: boolean
}

export function pageWindow(page: number, pageSize: number, total: number): PageWindow {
  const size = Math.max(1, Math.floor(pageSize))
  const lastPage = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, Math.floor(page)), lastPage)
  const firstRow = total === 0 ? 0 : (current - 1) * size + 1
  const lastRow = total === 0 ? 0 : Math.min(current * size, total)
  return {
    page: current,
    pageSize: size,
    total,
    lastPage,
    firstRow,
    lastRow,
    hasPrevious: current > 1,
    hasNext: current < lastPage,
  }
}

/** Clamp a page parameter. Anything unparseable is page 1, never an error. */
export function parsePage(raw: string | undefined): number {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1
}

/** Clamp a page-size parameter to the offered set; anything else is the default. */
export function parsePageSize(
  raw: string | undefined,
  options: readonly number[],
  fallback: number,
): number {
  const value = Number(raw)
  return Number.isFinite(value) && options.includes(value) ? value : fallback
}
