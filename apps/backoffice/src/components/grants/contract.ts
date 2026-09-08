/**
 * The wire contract of the temporary-Pro area: routes, query parameters, form
 * field names, the vocabularies both sides share and the pure helpers that
 * build a URL.
 *
 * A `'use server'` module may export nothing but async functions, and a Client
 * Component cannot import one without dragging its module graph — and with it
 * `@/lib/db` and the service-role key — across the client boundary. So every
 * name the page, the form and the Server Actions have to agree on lives here,
 * in a plain module with no imports at all. Getting one wrong is a type error
 * rather than a form posting a field nobody reads.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT HERE
 * ---------------------------------------------------------------------------
 *
 * The length bounds of a grant. `admin_entitlement_grants_days_range` in
 * migration 0019 says a grant is between 1 and 365 days, and repeating that
 * number here would create a second source of truth that drifts the first time
 * finance changes it. The form therefore offers common durations as
 * *suggestions* and enforces nothing but "a whole number"; a value the database
 * refuses comes back as a field error saying it was refused. See
 * `GRANT_DAY_SUGGESTIONS` below.
 *
 * Nothing defined here can carry user content. The parameters are uuids, enum
 * tokens and small integers; the only free text crossing this boundary is an
 * operator's own written reason, which is the thing the audit trail exists to
 * keep. No address ever reaches a URL: a grant is addressed by its own id, and
 * the account it belongs to by that account's id.
 */

// ===========================================================================
// Routes
// ===========================================================================

/** Every operator-issued Pro grant. Requires `billing.read`. */
export const GRANTS_PATH = '/billing/grants'

/** The grant form. Requires `billing.grant`. */
export const GRANTS_NEW_PATH = '/billing/grants/new'

/** The billing area this page belongs to. Requires `billing.read`. */
export const BILLING_PATH = '/billing'

/** One grant: its facts, what is actually entitling the account, its trail. */
export function grantPath(grantId: string): string {
  return `${GRANTS_PATH}/${grantId}`
}

/** The user record a grant points at. */
export function userPath(userId: string): string {
  return `/users/${userId}`
}

// ===========================================================================
// Vocabulary
// ===========================================================================

/**
 * `admin_grant_kind`. Re-declared rather than imported because `@/lib/db` is
 * `server-only`; `@/lib/queries/grants.ts` carries a compile-time proof that
 * this list and the database enum still name the same members, so a member
 * added to one without the other fails `tsc`.
 */
export const GRANT_KINDS = ['trial_extension', 'goodwill', 'compensation', 'beta_access'] as const
export type GrantKind = (typeof GRANT_KINDS)[number]

export function isGrantKind(value: string): value is GrantKind {
  return (GRANT_KINDS as readonly string[]).includes(value)
}

/**
 * The three states a grant row can be in, as the filter names them.
 *
 * Every one is expressed against columns `bo_entitlement_grants` already
 * computes — `is_live` is the view's own `revoked_at is null and expires_at >
 * now() and granted_at <= now()` — so the filter and the badge on the row can
 * never disagree about whether a grant is in force.
 */
export const GRANT_STATUSES = ['live', 'expired', 'revoked'] as const
export type GrantStatus = (typeof GRANT_STATUSES)[number]

export function isGrantStatus(value: string): value is GrantStatus {
  return (GRANT_STATUSES as readonly string[]).includes(value)
}

/**
 * Why an account is Pro right now, as `resolveEntitlements` in @da/domain
 * answers it. `admin_grant` is not a member, and that is the point: the
 * product's resolver reads a store subscription and a referral bonus and
 * nothing else, so a screen that listed an operator grant as a fourth possible
 * answer would be describing a rule that does not exist.
 */
export const ENTITLEMENT_SOURCES = ['subscription', 'trial', 'referral_bonus', 'none'] as const
export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number]

/**
 * What a live grant is actually doing for the account it names.
 *
 *   `overlaps_store`    — the account already holds a store subscription or a
 *                         store trial. The product reports that as the source;
 *                         the goodwill is being spent on somebody who is
 *                         paying.
 *   `behind_referral`   — an unexpired referral bonus covers the account, and
 *                         `resolveEntitlements` ranks it ahead of anything an
 *                         operator recorded.
 *   `only_record`       — nothing else entitles the account. This grant is the
 *                         only record of why it should be Pro.
 *   `not_live`          — revoked or expired: the row makes no claim.
 */
export const GRANT_EFFECTS = [
  'overlaps_store',
  'behind_referral',
  'only_record',
  'not_live',
] as const
export type GrantEffect = (typeof GRANT_EFFECTS)[number]

// ===========================================================================
// Query parameters
// ===========================================================================

export const LIST_PARAMS = {
  status: 'status',
  kind: 'kind',
  /** The admin who issued the grant, by `admin_users.id`. */
  admin: 'admin',
  page: 'page',
} as const

/** What a Server Action reports back through the URL. */
export const RESULT_PARAMS = {
  outcome: 'result',
  /** The grant the outcome is about, by id. Never an address. */
  grant: 'grant',
} as const

/** The period panel's own window. Separate names, so it cannot fight a filter. */
export const RANGE_PARAM_NAMES = {
  range: 'range',
  from: 'from',
  to: 'to',
} as const

export const GRANTS_PAGE_SIZE = 25
export const GRANT_TRAIL_LIMIT = 20

/**
 * Columns the list may be ordered by.
 *
 * A closed set, because the value ends up in an `order by`. Every member is a
 * real column of `bo_entitlement_grants`.
 */
export const GRANT_SORT_KEYS = ['granted_at', 'expires_at', 'days', 'days_remaining'] as const
export type GrantSortKey = (typeof GRANT_SORT_KEYS)[number]

export function isGrantSortKey(value: string): value is GrantSortKey {
  return (GRANT_SORT_KEYS as readonly string[]).includes(value)
}

export interface GrantSort {
  readonly key: GrantSortKey
  readonly direction: 'asc' | 'desc'
}

/** Newest first: the grant somebody just issued is the one worth seeing. */
export const DEFAULT_GRANT_SORT: GrantSort = { key: 'granted_at', direction: 'desc' }

// ===========================================================================
// Form fields
//
// `reason` is spelled exactly as `runAdminAction` reads it: the runner pulls
// the justification off the parsed input by that name and refuses the action
// when `admin_sensitive_actions` says it demands one — which it does for both
// `entitlement.granted` and `entitlement.revoked`.
// ===========================================================================

export const GRANT_FIELDS = {
  userId: 'userId',
  kind: 'kind',
  days: 'days',
  ticketId: 'ticketId',
  reason: 'reason',
} as const

export const REVOKE_FIELDS = {
  grantId: 'grantId',
  reason: 'reason',
} as const

/**
 * Durations the form offers as a datalist.
 *
 * Suggestions, not bounds: the input accepts any whole number and the database
 * decides which ones are legal. A month, a fortnight, a billing cycle and a
 * quarter are what an operator actually types; offering them saves a keystroke
 * without teaching this file a rule it would then have to keep in step with
 * `admin_entitlement_grants_days_range`.
 */
export const GRANT_DAY_SUGGESTIONS = [7, 14, 30, 90] as const

/** The kind a form starts on. Goodwill is `admin_grant_kind`'s own default. */
export const DEFAULT_GRANT_KIND: GrantKind = 'goodwill'

// ===========================================================================
// What a form gets back
// ===========================================================================

/**
 * The answer the grant form renders.
 *
 * Field issues are keyed by the form field they belong to, so a message lands
 * under the input that caused it rather than in a banner saying "something was
 * wrong" to somebody who has just filled in four fields.
 */
export interface GrantFormState {
  readonly status: 'idle' | 'error'
  readonly message: string | null
  readonly issues: Readonly<Record<string, string>>
}

export const initialGrantFormState: GrantFormState = {
  status: 'idle',
  message: null,
  issues: {},
}

// ===========================================================================
// Outcomes
// ===========================================================================

export const GRANT_OUTCOMES = [
  /** A grant was written. */
  'granted',
  /** A live grant was revoked. */
  'revoked',
  /** The grant was already revoked when the click landed. */
  'alreadyRevoked',
  /** The database refused an overlapping window for the same account. */
  'overlap',
  /** The database refused the row: a length or a window outside its bounds. */
  'rejected',
  /** A malformed id or a missing reason. */
  'invalid',
  /** The operator does not hold the permission. */
  'forbidden',
  /** The grant named by the form does not exist. */
  'notfound',
  /** Too many privileged writes in the window. */
  'ratelimited',
  /** Anything else. */
  'failed',
  /** The change happened and the audit row did not. */
  'auditMissing',
] as const

export type GrantOutcome = (typeof GRANT_OUTCOMES)[number]

export function isGrantOutcome(value: string): value is GrantOutcome {
  return (GRANT_OUTCOMES as readonly string[]).includes(value)
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isUuidParam(value: string): boolean {
  return UUID_RE.test(value)
}

/** `path?result=granted&grant=<uuid>` — where an action lands. */
export function withOutcome(
  path: string,
  outcome: GrantOutcome,
  grantId: string | null = null,
): string {
  const query = new URLSearchParams()
  query.set(RESULT_PARAMS.outcome, outcome)
  if (grantId !== null && isUuidParam(grantId)) query.set(RESULT_PARAMS.grant, grantId)
  return `${path}?${query.toString()}`
}

// ===========================================================================
// Parsing what arrives on the URL
// ===========================================================================

export function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const raw = params[key]
  if (Array.isArray(raw)) return (raw[0] ?? '').trim()
  return (raw ?? '').trim()
}

/**
 * Every parameter currently on the page, flattened.
 *
 * The table's own sort, page and column links are built from this, so paging
 * never drops a filter the table itself knows nothing about.
 */
export function toQueryRecord(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const record: Record<string, string> = {}
  for (const key of Object.keys(params)) {
    const value = firstParam(params, key)
    if (value !== '') record[key] = value
  }
  return record
}

/**
 * The same query without the last action's answer.
 *
 * A result banner belongs to the navigation that produced it. Carrying
 * `?result=revoked` into a page link would re-announce a revocation every time
 * somebody turned a page.
 */
export function withoutResultParams(query: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (key === RESULT_PARAMS.outcome || key === RESULT_PARAMS.grant) continue
    next[key] = value
  }
  return next
}

/** `path?a=1` from a flat query record, with the keys in a stable order. */
export function hrefWithQuery(path: string, query: Record<string, string>): string {
  const search = new URLSearchParams()
  for (const key of Object.keys(query).sort()) search.set(key, query[key] ?? '')
  const encoded = search.toString()
  return encoded === '' ? path : `${path}?${encoded}`
}

export interface GrantListParams {
  readonly status: GrantStatus | null
  readonly kind: GrantKind | null
  /** An `admin_users.id`, or null when the parameter was absent or malformed. */
  readonly admin: string | null
  readonly page: number
}

export function parseGrantListParams(
  params: Record<string, string | string[] | undefined>,
): GrantListParams {
  const statusRaw = firstParam(params, LIST_PARAMS.status)
  const kindRaw = firstParam(params, LIST_PARAMS.kind)
  const adminRaw = firstParam(params, LIST_PARAMS.admin)
  const pageRaw = Number(firstParam(params, LIST_PARAMS.page))

  return {
    status: isGrantStatus(statusRaw) ? statusRaw : null,
    kind: isGrantKind(kindRaw) ? kindRaw : null,
    admin: isUuidParam(adminRaw) ? adminRaw : null,
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1,
  }
}

/** The same values back as strings, for `Filters` and for link building. */
export function grantListParamValues(params: GrantListParams): Record<string, string> {
  return {
    [LIST_PARAMS.status]: params.status ?? '',
    [LIST_PARAMS.kind]: params.kind ?? '',
    [LIST_PARAMS.admin]: params.admin ?? '',
    [LIST_PARAMS.page]: params.page > 1 ? String(params.page) : '',
  }
}

export function isFiltered(params: GrantListParams): boolean {
  return params.status !== null || params.kind !== null || params.admin !== null
}
