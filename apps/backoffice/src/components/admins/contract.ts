/**
 * The wire contract for the admin-management area: routes, query parameters,
 * form field names and the pure helpers both sides of the client boundary
 * share.
 *
 * A `'use server'` module may export nothing but async functions, and a Client
 * Component cannot import one without dragging its module graph — and with it
 * `@/lib/db` and the service-role key — across the boundary. So every name the
 * pages, the forms and the Server Actions have to agree on lives here.
 *
 * The one import is `@/lib/permissions`, which is pure by construction: no
 * database client, no cookies, no `server-only`. The roles, statuses and the
 * 36-permission union are taken from there rather than re-declared, because
 * they are the console's authorization vocabulary and a second copy of it is
 * exactly the drift this file exists to prevent.
 *
 * Nothing defined here can carry user content. The parameters are uuids, enum
 * tokens, a mail domain and small integers; the only free text that crosses
 * this boundary is an operator's own written reason and the address of the
 * colleague they are inviting.
 */

import { ADMIN_ROLES, ADMIN_STATUSES, type AdminRole, type AdminStatus } from '@/lib/permissions'

// ===========================================================================
// Routes
// ===========================================================================

/** The roster. Requires `admin.read`. */
export const ADMINS_PATH = '/system/admins'

/** The invite form. Requires `admin.invite`. */
export const ADMINS_INVITE_PATH = '/system/admins/invite'

/** The role → permission matrix, read from the database. Requires `admin.read`. */
export const ROLES_PATH = '/system/roles'

/** One admin: role, status, sessions and the trail. Requires `admin.read`. */
export function adminPath(adminUserId: string): string {
  return `${ADMINS_PATH}/${adminUserId}`
}

/**
 * The console's own audit page.
 *
 * Deliberately unfiltered: `/audit` filters by actor, action, outcome, user and
 * date, and has no entity parameter, so a link that pretended to open one
 * admin's record would land on the whole log. The record for one admin is
 * rendered on their own page instead, from the same `bo_audit` view.
 */
export const AUDIT_PATH = '/audit'

// ===========================================================================
// Vocabulary
//
// Re-exported rather than re-declared: a Client Component that needs the role
// list imports it from here, and it is the same array `permissions.ts` mirrors
// from the `admin_role` enum.
// ===========================================================================

export { ADMIN_ROLES, ADMIN_STATUSES }
export type { AdminRole, AdminStatus }

const ROLE_SET: ReadonlySet<string> = new Set<string>(ADMIN_ROLES)
const STATUS_SET: ReadonlySet<string> = new Set<string>(ADMIN_STATUSES)

export function isRole(value: string): value is AdminRole {
  return ROLE_SET.has(value)
}

export function isStatus(value: string): value is AdminStatus {
  return STATUS_SET.has(value)
}

/** The MFA filter: enrolled, or not. A third value would mean "unknown". */
export const MFA_FILTERS = ['var', 'yok'] as const
export type MfaFilter = (typeof MFA_FILTERS)[number]

export function isMfaFilter(value: string): value is MfaFilter {
  return (MFA_FILTERS as readonly string[]).includes(value)
}

// ===========================================================================
// Shapes the database enforces
//
// Each mirrors a CHECK constraint in migration 0019. They are here so an
// operator is told which character is wrong before they submit; the constraint
// is still what refuses the write, and a post that skipped this form meets the
// same schema on the way in.
// ===========================================================================

/** `admin_users_email_shape` / `admin_invites_email_shape`. */
export const ADMIN_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The column is `text`; 320 is the addressing standard's ceiling. */
export const ADMIN_EMAIL_MAX = 320

/** Uuid, as it arrives from a route segment or a form. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidParam(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/**
 * How long an invite may stay open, in days.
 *
 * A duration rather than a date: the operator's browser and the server do not
 * share a timezone, and a `datetime-local` that silently lands three hours out
 * would either expire an invite early or leave one open a day longer than
 * intended. The instant is computed server-side from the injected clock, and
 * `admin_invites_expiry_after_creation` refuses anything in the past.
 */
export const INVITE_TTL_DAYS = [1, 3, 7, 14] as const
export type InviteTtlDays = (typeof INVITE_TTL_DAYS)[number]
export const DEFAULT_INVITE_TTL_DAYS: InviteTtlDays = 7

export function isInviteTtl(value: number): value is InviteTtlDays {
  return (INVITE_TTL_DAYS as readonly number[]).includes(value)
}

// ===========================================================================
// Query parameters
// ===========================================================================

export const LIST_PARAMS = {
  role: 'role',
  status: 'status',
  mfa: 'mfa',
  q: 'q',
  page: 'page',
} as const

/** The pending-invite table's own pager, so it does not fight the roster's. */
export const INVITE_PAGE_PARAM = 'davet'

/** What a Server Action reports back through the URL. */
export const RESULT_PARAMS = {
  outcome: 'result',
  /** The admin or invite the outcome is about, for the banner's sentence. */
  subject: 'kim',
} as const

export const ADMINS_PAGE_SIZE = 25
export const INVITES_PAGE_SIZE = 10
export const SESSIONS_LIMIT = 25
export const TRAIL_LIMIT = 20

/**
 * Columns the roster may be ordered by.
 *
 * A closed set, because the value ends up in an `order by`. Every member is a
 * real, NOT NULL-safe column of `bo_admin_users`.
 */
export const ADMIN_SORT_KEYS = [
  'role_rank',
  'last_login_at',
  'created_at',
  'action_count_30d',
] as const
export type AdminSortKey = (typeof ADMIN_SORT_KEYS)[number]

export function isAdminSortKey(value: string): value is AdminSortKey {
  return (ADMIN_SORT_KEYS as readonly string[]).includes(value)
}

export interface AdminSort {
  readonly key: AdminSortKey
  readonly direction: 'asc' | 'desc'
}

/** Most privileged first, which is the order a reviewer reads a roster in. */
export const DEFAULT_ADMIN_SORT: AdminSort = { key: 'role_rank', direction: 'desc' }

// ===========================================================================
// Search
//
// The roster is a list of colleagues, and their addresses are redacted in
// `bo_admin_users` exactly as a user's is — an admin is a person too. So the
// search box accepts what the view can actually match: an admin id, a mail
// domain, or a display name. A full address is refused rather than trimmed,
// because a "cleaned up" query is a query nobody typed, and because the
// address would then travel in the URL an operator shares.
// ===========================================================================

export type AdminSearch =
  | { readonly kind: 'none' }
  | { readonly kind: 'admin_id'; readonly adminUserId: string }
  | { readonly kind: 'domain'; readonly domain: string }
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'rejected'; readonly why: 'full_address' | 'too_short' }

const DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i

/** The shortest name fragment worth an `ilike`. */
export const MIN_NAME_SEARCH = 2

export function parseAdminSearch(raw: string): AdminSearch {
  const value = raw.trim()
  if (value === '') return { kind: 'none' }
  if (isUuidParam(value)) return { kind: 'admin_id', adminUserId: value.toLowerCase() }

  const at = value.indexOf('@')
  if (at > 0) return { kind: 'rejected', why: 'full_address' }

  const bare = at === 0 ? value.slice(1) : value
  if (bare === '') return { kind: 'rejected', why: 'too_short' }
  if (DOMAIN_PATTERN.test(bare) && bare.includes('.')) {
    return { kind: 'domain', domain: bare.toLowerCase() }
  }
  if (at === 0) return { kind: 'rejected', why: 'too_short' }
  if (bare.length < MIN_NAME_SEARCH) return { kind: 'rejected', why: 'too_short' }
  return { kind: 'name', name: bare }
}

/** Whether this search can be turned into a filter at all. */
export function isQueryableSearch(search: AdminSearch): boolean {
  return search.kind !== 'rejected'
}

// ===========================================================================
// List parameters
// ===========================================================================

export interface AdminListParams {
  readonly role: AdminRole | null
  readonly status: AdminStatus | null
  readonly mfa: MfaFilter | null
  readonly search: AdminSearch
  /** 1-based, clamped. */
  readonly page: number
  readonly invitePage: number
}

export type RawSearchParams = Record<string, string | string[] | undefined>

export function firstParam(params: RawSearchParams, name: string): string {
  const raw = params[name]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? ''
  return ''
}

/** A page number that is a positive integer, or 1. Never `NaN`, never 0. */
export function parsePageParam(raw: string): number {
  if (!/^[0-9]{1,4}$/.test(raw)) return 1
  const value = Number.parseInt(raw, 10)
  return value >= 1 ? value : 1
}

export function parseAdminListParams(raw: RawSearchParams): AdminListParams {
  const roleRaw = firstParam(raw, LIST_PARAMS.role)
  const statusRaw = firstParam(raw, LIST_PARAMS.status)
  const mfaRaw = firstParam(raw, LIST_PARAMS.mfa)

  return {
    role: isRole(roleRaw) ? roleRaw : null,
    status: isStatus(statusRaw) ? statusRaw : null,
    mfa: isMfaFilter(mfaRaw) ? mfaRaw : null,
    search: parseAdminSearch(firstParam(raw, LIST_PARAMS.q)),
    page: parsePageParam(firstParam(raw, LIST_PARAMS.page)),
    invitePage: parsePageParam(firstParam(raw, INVITE_PAGE_PARAM)),
  }
}

/** True when the roster is narrowed, so the empty state says the right thing. */
export function isFiltered(params: AdminListParams): boolean {
  return (
    params.role !== null ||
    params.status !== null ||
    params.mfa !== null ||
    params.search.kind !== 'none'
  )
}

/** The current values of this page's own parameters, for the filter bar. */
export function listParamValues(
  params: AdminListParams,
  rawQuery: string,
): Readonly<Record<string, string>> {
  return {
    [LIST_PARAMS.role]: params.role ?? '',
    [LIST_PARAMS.status]: params.status ?? '',
    [LIST_PARAMS.mfa]: params.mfa ?? '',
    [LIST_PARAMS.q]: rawQuery,
  }
}

// ===========================================================================
// Form fields
// ===========================================================================

export const ROLE_FIELDS = {
  adminUserId: 'adminUserId',
  role: 'role',
  /** The role the form was rendered from: two operators cannot both apply. */
  currentRole: 'currentRole',
  reason: 'reason',
} as const

export const DISABLE_FIELDS = {
  adminUserId: 'adminUserId',
  reason: 'reason',
} as const

export const ENABLE_FIELDS = {
  adminUserId: 'adminUserId',
  reason: 'reason',
} as const

export const SESSION_FIELDS = {
  adminUserId: 'adminUserId',
  reason: 'reason',
} as const

export const INVITE_FIELDS = {
  email: 'email',
  role: 'role',
  ttlDays: 'ttlDays',
  reason: 'reason',
} as const

export const INVITE_REVOKE_FIELDS = {
  inviteId: 'inviteId',
  reason: 'reason',
} as const

// ===========================================================================
// What an action reports back
// ===========================================================================

export const ADMIN_OUTCOMES = [
  'roleChanged',
  'disabled',
  'reenabled',
  'sessionsRevoked',
  'noSessions',
  'invited',
  'inviteRevoked',
  'noop',
  'lastSuperAdmin',
  'selfDisable',
  'selfRole',
  'duplicate',
  'notfound',
  'conflict',
  'forbidden',
  'invalid',
  'ratelimited',
  'auditMissing',
  'failed',
] as const

export type AdminOutcome = (typeof ADMIN_OUTCOMES)[number]

export function isAdminOutcome(value: string): value is AdminOutcome {
  return (ADMIN_OUTCOMES as readonly string[]).includes(value)
}

/** Adds an outcome to a path this module built. Never to a posted path. */
export function withOutcome(path: string, outcome: AdminOutcome, subject: string | null): string {
  const query = new URLSearchParams({ [RESULT_PARAMS.outcome]: outcome })
  if (subject !== null && subject !== '') {
    query.set(RESULT_PARAMS.subject, subject.slice(0, 64))
  }
  return `${path}?${query.toString()}`
}

/** The page's own address again, with any previous answer stripped. */
export function withoutResultParams(
  query: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const next: Record<string, string> = { ...query }
  for (const param of Object.values(RESULT_PARAMS)) delete next[param]
  return next
}

export function toQueryRecord(raw: RawSearchParams): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const single = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined
    if (single !== undefined && single !== '') query[key] = single
  }
  return query
}

export function hrefWithQuery(path: string, query: Readonly<Record<string, string>>): string {
  const search = new URLSearchParams(query).toString()
  return search === '' ? path : `${path}?${search}`
}

// ===========================================================================
// Form state
//
// The two multi-field forms (invite, role change) hand per-field errors back to
// the input that caused them rather than one sentence over five controls.
// ===========================================================================

export interface AdminFormState {
  readonly status: 'idle' | 'success' | 'error'
  readonly message: string | null
  readonly issues: Readonly<Record<string, string>>
  /**
   * The plaintext invite token, present exactly once: in the value the invite
   * action returns to the form that created it. It is never stored — only its
   * SHA-256 reaches `admin_invites` — never put in a URL, and never readable
   * again from any screen or query.
   */
  readonly issuedToken?: string
  /** The address the token belongs to, so the panel can be copied as one. */
  readonly issuedEmail?: string
  readonly issuedExpiresAt?: string
}

export const initialAdminFormState: AdminFormState = {
  status: 'idle',
  message: null,
  issues: {},
}
