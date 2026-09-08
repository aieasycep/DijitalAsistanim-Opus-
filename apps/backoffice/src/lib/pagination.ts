/**
 * Keyset pagination, as the only way the console walks a large table.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT OFFSET
 * ---------------------------------------------------------------------------
 *
 * `offset 20000 limit 50` makes Postgres produce twenty thousand rows and throw
 * them away, and it gets slower the further an operator scrolls — which is
 * exactly when they are investigating something. Worse, it is not stable: rows
 * arriving while someone pages will shift the window, so a row can be shown
 * twice or skipped entirely. An audit trail that silently skips a row is not an
 * audit trail.
 *
 * A keyset cursor names a position — `(created_at, id)` — instead of a count.
 * The next page is "everything strictly after that position", which is an index
 * seek whatever the page number, and which cannot skip a row because the
 * position is a value in the data rather than an ordinal.
 *
 * The tie-break on a unique id is not optional. Timestamps collide: 0019's
 * cleanup, a batch resync and a bulk import all write many rows inside the same
 * microsecond, and a cursor on `created_at` alone would either loop on them
 * forever or step over the whole group.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE IS AND IS NOT
 * ---------------------------------------------------------------------------
 *
 * Pure. It imports nothing, touches no database and reads no clock, so it can be
 * reasoned about and reused from anywhere. `db.ts` executes the plan this module
 * produces; `queries/shared.ts` is what a page actually calls.
 */

// ===========================================================================
// Cursors
// ===========================================================================

/**
 * A position in an ordered result.
 *
 * `at` is the value of the sort column as the database rendered it — an ISO
 * instant for a `timestamptz`, `YYYY-MM-DD` for a `date`. It is passed back
 * verbatim rather than reparsed, because a round trip through `Date` loses the
 * microseconds Postgres keeps and the cursor would then land between two rows.
 */
export interface KeysetCursor {
  at: string
  id: string
}

/** Page sizes the console offers. */
export const PAGE_SIZES = [25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export const DEFAULT_PAGE_SIZE = 50

/**
 * Hard ceiling on rows in one response, whatever a query string asks for. The
 * point of server-side pagination is that no request can pull a whole table into
 * a browser, so the limit is enforced here rather than trusted from the caller.
 */
export const MAX_PAGE_SIZE = 200

/** Where a page request is travelling relative to the list's own order. */
export type PageDirection = 'forward' | 'backward'

export interface PageRequest {
  size: number
  cursor: KeysetCursor | null
  direction: PageDirection
}

export const FIRST_PAGE: PageRequest = Object.freeze({
  size: DEFAULT_PAGE_SIZE,
  cursor: null,
  direction: 'forward',
})

/** Query-string parameter names, so a page and its pager cannot disagree. */
export const CURSOR_PARAM = 'cursor'
export const DIRECTION_PARAM = 'dir'
export const SIZE_PARAM = 'size'

/**
 * NUL. Postgres cannot hold one inside a `text` value, so it can appear in
 * neither half of a cursor — which makes "everything before the first
 * separator is the sort value" true rather than merely usually true.
 */
const CURSOR_SEPARATOR = '\u0000'
/** Generous enough for an ISO instant plus a uuid, tight enough to be a limit. */
const MAX_CURSOR_LENGTH = 512

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string | null {
  try {
    const normalised = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/**
 * Encode a cursor for a URL.
 *
 * Opaque on purpose: a cursor is a database position, and an operator editing
 * one by hand in the address bar produces a page that is silently wrong rather
 * than an error. Encoding it means a malformed cursor fails to decode and is
 * treated as "start from the beginning", which is a state the UI can render.
 */
export function encodeCursor(cursor: KeysetCursor): string {
  return toBase64Url(`${cursor.at}${CURSOR_SEPARATOR}${cursor.id}`)
}

/** Decode a cursor. Null — never a throw — for anything unreadable. */
export function decodeCursor(raw: string | null | undefined): KeysetCursor | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw.length > MAX_CURSOR_LENGTH) return null
  const decoded = fromBase64Url(raw)
  if (decoded === null) return null
  const separator = decoded.indexOf(CURSOR_SEPARATOR)
  if (separator <= 0) return null
  const at = decoded.slice(0, separator)
  const id = decoded.slice(separator + 1)
  if (at === '' || id === '') return null
  return { at, id }
}

// ===========================================================================
// Reading a page request off a URL
// ===========================================================================

/** What Next hands a page as `searchParams`, after it is awaited. */
export type RawSearchParams = Record<string, string | string[] | undefined>

/** First value of a parameter that may legitimately repeat. */
export function firstParam(params: RawSearchParams, name: string): string | undefined {
  const value = params[name]
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value[0]
  return value
}

export function clampPageSize(value: number | undefined, fallback = DEFAULT_PAGE_SIZE): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  const rounded = Math.floor(value)
  if (rounded < 1) return 1
  if (rounded > MAX_PAGE_SIZE) return MAX_PAGE_SIZE
  return rounded
}

/**
 * Read a page request from a URL.
 *
 * Every failure mode collapses to the first page: an unparseable size, a
 * tampered cursor, a direction that is neither of the two. A list that quietly
 * shows page one is recoverable; a list that throws on a stale bookmark is not.
 */
export function parsePageRequest(
  params: RawSearchParams,
  defaultSize: number = DEFAULT_PAGE_SIZE,
): PageRequest {
  const rawSize = firstParam(params, SIZE_PARAM)
  const size = clampPageSize(rawSize === undefined ? undefined : Number(rawSize), defaultSize)
  const cursor = decodeCursor(firstParam(params, CURSOR_PARAM))
  const rawDirection = firstParam(params, DIRECTION_PARAM)
  const direction: PageDirection =
    cursor !== null && rawDirection === 'backward' ? 'backward' : 'forward'
  return { size, cursor, direction }
}

// ===========================================================================
// The plan
// ===========================================================================

/** The columns a keyset walks. `sortColumn` must be NOT NULL in the source. */
export interface KeysetKey {
  sortColumn: string
  /** A unique column, to break ties inside the same instant. */
  idColumn: string
  /** True for a newest-first list, which is almost every list here. */
  descending: boolean
}

export interface KeysetPlan {
  /**
   * A PostgREST `or=` expression placing the result strictly beyond the cursor,
   * or null on the first page.
   */
  predicate: string | null
  /** The order to ask the database for — not necessarily the display order. */
  ascending: boolean
  /**
   * True when the rows arrive in the reverse of display order and must be
   * flipped after fetching. Paging backwards reads outwards from the cursor, so
   * the database has to sort the other way to find the adjacent rows at all.
   */
  reversed: boolean
  /** Rows to request: one more than the page, to detect a further page. */
  fetchSize: number
}

/**
 * Quote a value for a PostgREST filter.
 *
 * `or=(...)` is parsed as a comma-separated list inside parentheses, so a value
 * containing a comma, a parenthesis or a dot would end the clause early.
 * Double-quoting is PostgREST's own escape for exactly that, and the backslash
 * and quote inside are escaped in turn.
 */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Turn a cursor into the comparison that finds the next page.
 *
 * The expression is the standard row-value comparison written out by hand,
 * because PostgREST has no row-constructor syntax:
 *
 *   (sort < at) OR (sort = at AND id < id)
 *
 * which is `(sort, id) < (at, id)` — strictly beyond the cursor, and therefore
 * unable to repeat the row the cursor points at or to skip its ties.
 */
export function keysetPredicate(
  key: KeysetKey,
  cursor: KeysetCursor,
  direction: PageDirection,
): string {
  // Travelling forward through a descending list means going down; travelling
  // backward through it means going up. An ascending list is the mirror.
  const goingDown = key.descending === (direction === 'forward')
  const op = goingDown ? 'lt' : 'gt'
  const at = quoteFilterValue(cursor.at)
  const id = quoteFilterValue(cursor.id)
  return `${key.sortColumn}.${op}.${at},and(${key.sortColumn}.eq.${at},${key.idColumn}.${op}.${id})`
}

export function planKeyset(key: KeysetKey, request: PageRequest): KeysetPlan {
  const backward = request.direction === 'backward' && request.cursor !== null
  return {
    predicate:
      request.cursor === null ? null : keysetPredicate(key, request.cursor, request.direction),
    // Forwards, the fetch order is the display order. Backwards, it is inverted
    // so the rows nearest the cursor are the ones the limit keeps.
    ascending: backward ? key.descending : !key.descending,
    reversed: backward,
    fetchSize: request.size + 1,
  }
}

// ===========================================================================
// The page
// ===========================================================================

export interface KeysetPage<Row> {
  rows: readonly Row[]
  /** Rows exist before this page in display order. */
  hasNewer: boolean
  /** Rows exist after this page in display order. */
  hasOlder: boolean
  /** Cursor for the previous page: the first row shown. */
  newerCursor: KeysetCursor | null
  /** Cursor for the next page: the last row shown. */
  olderCursor: KeysetCursor | null
  /** The page size actually applied, after clamping. */
  size: number
}

/** An empty page, for an error boundary or a filter that matches nothing. */
export function emptyKeysetPage<Row>(size: number = DEFAULT_PAGE_SIZE): KeysetPage<Row> {
  return { rows: [], hasNewer: false, hasOlder: false, newerCursor: null, olderCursor: null, size }
}

/**
 * Assemble a page from the `size + 1` rows the plan fetched.
 *
 * The extra row is the whole detection mechanism: if it came back there is
 * another page, and it is dropped rather than shown. Nothing here counts the
 * table — an operator does not need to know there are 4,318,905 audit rows, and
 * asking Postgres to count them on every page view is the expensive half of
 * pagination.
 */
export function buildKeysetPage<Row>(
  fetched: readonly Row[],
  request: PageRequest,
  cursorOf: (row: Row) => KeysetCursor,
  plan: KeysetPlan,
): KeysetPage<Row> {
  const hasExtra = fetched.length > request.size
  const kept = hasExtra ? fetched.slice(0, request.size) : [...fetched]
  const ordered = plan.reversed ? kept.reverse() : kept

  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const cameFromSomewhere = request.cursor !== null

  return {
    rows: ordered,
    // Paging forward from a cursor means the rows we came from are newer;
    // paging backward means they are older. On the first page neither holds.
    hasNewer: request.direction === 'forward' ? cameFromSomewhere : hasExtra,
    hasOlder: request.direction === 'forward' ? hasExtra : cameFromSomewhere,
    newerCursor: first === undefined ? null : cursorOf(first),
    olderCursor: last === undefined ? null : cursorOf(last),
    size: request.size,
  }
}

/**
 * The query string for a pager button, preserving every filter already on the
 * URL. Returns null when there is no such page, so a component renders a
 * disabled control instead of a link that reloads the same rows.
 */
export function pageHref(
  basePath: string,
  params: RawSearchParams,
  page: KeysetPage<unknown>,
  direction: PageDirection,
): string | null {
  const cursor = direction === 'forward' ? page.olderCursor : page.newerCursor
  const available = direction === 'forward' ? page.hasOlder : page.hasNewer
  if (!available || cursor === null) return null

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === CURSOR_PARAM || key === DIRECTION_PARAM) continue
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const entry of value) search.append(key, entry)
    } else {
      search.set(key, value)
    }
  }
  search.set(CURSOR_PARAM, encodeCursor(cursor))
  search.set(DIRECTION_PARAM, direction)
  return `${basePath}?${search.toString()}`
}

// ===========================================================================
// Offset pagination, for the few places a total is the point
//
// Kept deliberately small and separate. A ranked list — "the ten accounts that
// cost the most this month" — is a fixed, short window over a pre-aggregated
// view, where an offset is both correct and cheap. Everything that walks a
// growing table uses the keyset above.
// ===========================================================================

export interface OffsetPageRequest {
  /** One-based, as a person counts pages. */
  page: number
  size: number
  offset: number
}

/** Ceiling on offset paging: past this, a filter is the answer, not a page. */
export const MAX_OFFSET_PAGE = 200

export function parseOffsetPageRequest(
  params: RawSearchParams,
  defaultSize: number = DEFAULT_PAGE_SIZE,
  pageParam = 'page',
): OffsetPageRequest {
  const rawSize = firstParam(params, SIZE_PARAM)
  const size = clampPageSize(rawSize === undefined ? undefined : Number(rawSize), defaultSize)
  const rawPage = Number(firstParam(params, pageParam) ?? '1')
  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(Math.floor(rawPage), MAX_OFFSET_PAGE) : 1
  return { page, size, offset: (page - 1) * size }
}

export interface OffsetPage<Row> {
  rows: readonly Row[]
  total: number
  page: number
  size: number
  pageCount: number
  hasPrevious: boolean
  hasNext: boolean
}

export function buildOffsetPage<Row>(
  rows: readonly Row[],
  total: number,
  request: OffsetPageRequest,
): OffsetPage<Row> {
  const pageCount = total === 0 ? 1 : Math.ceil(total / request.size)
  return {
    rows,
    total,
    page: request.page,
    size: request.size,
    pageCount,
    hasPrevious: request.page > 1,
    hasNext: request.page < pageCount,
  }
}

export function emptyOffsetPage<Row>(size: number = DEFAULT_PAGE_SIZE): OffsetPage<Row> {
  return { rows: [], total: 0, page: 1, size, pageCount: 1, hasPrevious: false, hasNext: false }
}
