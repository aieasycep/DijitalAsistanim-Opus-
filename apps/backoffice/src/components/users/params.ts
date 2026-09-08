import type { SubscriptionStatus } from '@da/domain'

/**
 * The URL contract of the users area: what a parameter is called, what values
 * it may hold, and how a typed lookup becomes one of them.
 *
 * It lives apart from `@/lib/queries/users` because both sides of the boundary
 * need it. The list page parses the URL on the server; the search box has to
 * apply the same rules in the browser, *before* navigating, since the one thing
 * it must guarantee — that a full address never reaches a query string — cannot
 * be enforced after the fact. Sharing the parser is what keeps the two from
 * drifting, and nothing in this module touches the database, so a client
 * component can import it without pulling `server-only` code with it.
 */

// ===========================================================================
// Lookup
// ===========================================================================

/** The mask `bo_redact_email()` writes: one character, three bullets, domain. */
const MASK = '•••'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `a•••@x.com`, and the shapes a keyboard produces instead of a bullet when an
 * operator retypes a mask from a screenshot. Letters are deliberately not among
 * them: `axxx@ornek.com` is somebody's real address, and treating it as a mask
 * would skip the notice that says an address was masked.
 */
const MASKED_PATTERN = /^(.)(?:•{1,3}|\*{1,3}|\.{2,3}|…)@([^\s@]+)$/

/** A whole address. Matched in order to be masked, never in order to be sent. */
const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DOMAIN_PATTERN =
  /^@?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)$/i

/** Looks like part of a uuid — the usual paste of a short id from a table row. */
const ID_FRAGMENT_PATTERN = /^[0-9a-f-]{4,35}$/i

export type UserSearch =
  | { kind: 'empty' }
  | { kind: 'user_id'; userId: string }
  | { kind: 'redacted'; redacted: string }
  | { kind: 'domain'; domain: string }
  /** A full address was typed. Carries the mask to use instead; never queried. */
  | { kind: 'full_address'; redacted: string }
  | { kind: 'id_fragment' }
  | { kind: 'unparsed' }

export function isUserId(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/** The redacted form of an address, byte for byte what `bo_redact_email` makes. */
export function redactAddress(address: string): string {
  const at = address.indexOf('@')
  if (at <= 0) return address
  return `${address.slice(0, 1)}${MASK}@${address.slice(at + 1)}`
}

/**
 * Classify what an operator typed into the search box.
 *
 * The `full_address` branch is the point of this function. Support is usually
 * handed a whole address by the person writing in, and the natural thing to do
 * is paste it — which would put a user's address into a query string, a server
 * log and a browser history, in a tool whose entire premise is that it cannot
 * identify anyone. So an address is classified rather than accepted, and the
 * callers search for its mask, which finds the same row and names nobody.
 */
export function parseUserSearch(raw: string): UserSearch {
  const value = raw.trim()
  if (value === '') return { kind: 'empty' }

  if (isUserId(value)) return { kind: 'user_id', userId: value.toLowerCase() }

  const masked = MASKED_PATTERN.exec(value)
  if (masked) {
    const first = masked[1] ?? ''
    const domain = masked[2] ?? ''
    return { kind: 'redacted', redacted: `${first}${MASK}@${domain}` }
  }

  if (ADDRESS_PATTERN.test(value)) {
    return { kind: 'full_address', redacted: redactAddress(value) }
  }

  const domain = DOMAIN_PATTERN.exec(value)
  if (domain) return { kind: 'domain', domain: (domain[1] ?? '').toLowerCase() }

  if (ID_FRAGMENT_PATTERN.test(value)) return { kind: 'id_fragment' }

  return { kind: 'unparsed' }
}

/**
 * The query-string value a parsed search should be stored as.
 *
 * A full address is stored as its mask, and a search the tool refuses to run is
 * stored as nothing — so changing a filter never carries an unusable, or
 * unmaskable, value forward into the next URL.
 */
export function searchParamValue(search: UserSearch): string {
  switch (search.kind) {
    case 'user_id':
      return search.userId
    case 'redacted':
    case 'full_address':
      return search.redacted
    case 'domain':
      return `@${search.domain}`
    default:
      return ''
  }
}

/**
 * True when the search is something the roster query can actually run. A full
 * address, a partial id and an unrecognised string are all refused before a
 * request is made, so the page explains itself instead of returning nothing.
 */
export function isQueryableSearch(search: UserSearch): boolean {
  return (
    search.kind === 'empty' ||
    search.kind === 'user_id' ||
    search.kind === 'redacted' ||
    search.kind === 'domain'
  )
}

// ===========================================================================
// Parameters
// ===========================================================================

export const USERS_PAGE_SIZE = 25

export const SEARCH_PARAM = 'ara'
export const PLAN_PARAM = 'plan'
export const HEALTH_PARAM = 'saglik'
export const ONBOARDING_PARAM = 'kurulum'
export const DELETED_PARAM = 'silinmis'
export const SORT_PARAM = 'sirala'
export const PAGE_PARAM = 'sayfa'

export const SUBSCRIPTION_STATUSES = [
  'free',
  'trialing',
  'active',
  'grace_period',
  'expired',
  'billing_issue',
] as const satisfies readonly SubscriptionStatus[]

export const HEALTH_FILTERS = [
  'saglikli',
  'baglanti_yok',
  'hatali_baglanti',
  'senk_hatasi',
] as const
export type HealthFilter = (typeof HEALTH_FILTERS)[number]

export const ONBOARDING_FILTERS = ['tamam', 'eksik'] as const
export type OnboardingFilter = (typeof ONBOARDING_FILTERS)[number]

export const DELETED_FILTERS = ['haric', 'dahil', 'sadece'] as const
export type DeletedFilter = (typeof DELETED_FILTERS)[number]

export const USER_SORTS = ['yeni', 'etkinlik', 'bayat'] as const
export type UserSort = (typeof USER_SORTS)[number]

export interface UserListParams {
  search: UserSearch
  /** Raw text as typed, so the input can be re-rendered with it. */
  searchRaw: string
  plan: SubscriptionStatus | null
  health: HealthFilter | null
  onboarding: OnboardingFilter | null
  deleted: DeletedFilter
  sort: UserSort
  page: number
}

export type RawSearchParams = Record<string, string | string[] | undefined>

function single(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
}

function oneOf<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
): T | null {
  const value = single(raw)
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

/**
 * Turn the URL into typed parameters. One parser, used by the page, the filter
 * bar and the pagination links, so a filter and its page cursor can never
 * disagree about what the current query is.
 */
export function parseUserListParams(params: RawSearchParams): UserListParams {
  const searchRaw = single(params[SEARCH_PARAM]).trim()
  const pageRaw = Number.parseInt(single(params[PAGE_PARAM]), 10)

  return {
    search: parseUserSearch(searchRaw),
    searchRaw,
    plan: oneOf(params[PLAN_PARAM], SUBSCRIPTION_STATUSES),
    health: oneOf(params[HEALTH_PARAM], HEALTH_FILTERS),
    onboarding: oneOf(params[ONBOARDING_PARAM], ONBOARDING_FILTERS),
    deleted: oneOf(params[DELETED_PARAM], DELETED_FILTERS) ?? 'haric',
    sort: oneOf(params[SORT_PARAM], USER_SORTS) ?? 'yeni',
    page: Number.isFinite(pageRaw) && pageRaw > 1 ? pageRaw : 1,
  }
}

/** The parameters as the URL spells them, for building links and filter state. */
export function userListParamValues(params: UserListParams): Record<string, string> {
  return {
    [SEARCH_PARAM]: searchParamValue(params.search),
    [PLAN_PARAM]: params.plan ?? '',
    [HEALTH_PARAM]: params.health ?? '',
    [ONBOARDING_PARAM]: params.onboarding ?? '',
    [DELETED_PARAM]: params.deleted,
    [SORT_PARAM]: params.sort,
    [PAGE_PARAM]: params.page > 1 ? String(params.page) : '',
  }
}
