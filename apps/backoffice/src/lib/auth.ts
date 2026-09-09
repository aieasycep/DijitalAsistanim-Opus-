import 'server-only'

import { AppError, isAppError, systemClock, type Clock } from '@da/domain'
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { readEnv } from './env.ts'
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  DENIAL_MESSAGES_TR,
  decideAccess,
  isAdminRole,
  isAdminStatus,
  isRecoverableBySigningIn,
  toPermissionSet,
  type AccessDecision,
  type AccessDenialReason,
  type AccessSubject,
  type AdminPermission,
  type AdminRole,
  type AdminStatus,
  type PermissionRequirement,
} from './permissions.ts'
import { baseRedactionLevel, type RedactionLevel } from './redact.ts'
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  ADMIN_SESSION_ABSOLUTE_SECONDS,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_IDLE_INTERVAL,
  ADMIN_SESSION_IDLE_SECONDS,
  CSRF_FIELD_NAME,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE,
  SIGN_IN_PATH,
  UNAUTHORIZED_PATH,
  DENIAL_NEEDED_PARAM,
  DENIAL_REASON_PARAM,
  clientIpFromHeaders,
  constantTimeEqual,
  deriveCsrfToken,
  isCsrfTokenShape,
  isSameOrigin,
  jwtClaims,
  newSessionToken,
  sessionCookieMaxAge,
  sessionCookieOptions,
  sessionTokenHashBytea,
  sha256Hex,
} from './session-cookies.ts'

/**
 * The authorization layer. Everything else in the console depends on this file
 * being right.
 *
 * ---------------------------------------------------------------------------
 * AUTHENTICATION AND AUTHORIZATION ARE TWO DIFFERENT THINGS HERE
 * ---------------------------------------------------------------------------
 *
 * Signing into Dijital Asistan with a correct password proves who somebody is.
 * It grants them nothing in this console. Authorization is a row in
 * `public.admin_users` with `status = 'active'` whose `user_id` matches the
 * verified GoTrue subject, and `admin_resolve_by_auth_user()` returns no rows
 * for everybody else — including a paying customer with a perfectly valid
 * product session. That separation is the whole reason the backoffice can share
 * an identity provider with the app.
 *
 * ---------------------------------------------------------------------------
 * THE SESSION IS SERVER-SIDE
 * ---------------------------------------------------------------------------
 *
 * The console cookie carries an opaque 256-bit token and nothing else. Only its
 * SHA-256 is stored, in `admin_sessions.token_hash`, so a database dump cannot
 * be replayed and a stolen cookie can be killed from the server. Every
 * protected render calls `admin_touch_session()`, which validates the token,
 * checks both deadlines, checks that the admin is still active, and slides the
 * idle deadline — in one atomic statement. Expiry is therefore a fact about the
 * database, never a claim made by a cookie, and "log out all sessions" is a
 * single UPDATE rather than a hope about a browser.
 *
 * ---------------------------------------------------------------------------
 * DENY BY DEFAULT
 * ---------------------------------------------------------------------------
 *
 * There is no `requireAnyAdmin()` that returns a session with unspecified
 * rights, and no default permission. A Server Component calls
 * `requirePermission(<permission>)` and a Server Action calls
 * `requirePermissionAction(<permission>, formData)`. Both go through
 * `decideAccess()` in `permissions.ts`, which has no branch that allows without
 * a live session, an active admin, a satisfied MFA policy and a permission the
 * caller actually holds. Hiding a menu item is not security; this is.
 */

// ===========================================================================
// 1. The client
//
// Module-private, lazily constructed, never exported. Everything leaves this
// file as a plain typed value, so no other module can compose a query of its
// own against the admin platform.
// ===========================================================================

let adminClient: SupabaseClient | null = null

function service(): SupabaseClient {
  if (adminClient) return adminClient
  const env = readEnv()
  adminClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'da-backoffice-admin' } },
  })
  return adminClient
}

function mapPostgrestError(error: PostgrestError): AppError {
  const detail = `${error.code ?? 'unknown'}: ${error.message}`
  // Every guard in 0019 raises P0001 with a machine-readable hint. Those are
  // refusals, not outages, and must never be retried or reported as one.
  if (error.code === 'P0001') {
    return new AppError('forbidden', { detail, status: 403 })
  }
  switch (error.code) {
    case 'PGRST116':
      return new AppError('not_found', { detail })
    case 'PGRST301':
    case '42501':
      return new AppError('forbidden', { detail, status: 403 })
    case '42P01':
    case '42883':
      // The table or function is missing: 0019 has not been applied here.
      return new AppError('server_unavailable', { detail, retryable: false })
    case '23514':
      // A check constraint refused the write — a four-eyes violation, a window
      // longer than 24 hours, a reason under 20 characters.
      return new AppError('validation_failed', { detail, status: 422 })
    case '23505':
      // A unique index refused the write. The one the console meets in practice
      // is `support_access_grants_one_active`: an admin may hold at most one
      // live grant per user, so a second is a conflict with a clear remedy —
      // wait for the first to lapse, or revoke it — not an outage to retry.
      return new AppError('validation_failed', { detail, status: 409 })
    case '23503':
      // A foreign key refused the write: the row it points at is gone.
      return new AppError('not_found', { detail, status: 404 })
    case '57014':
      return new AppError('network_timeout', { detail })
    default:
      return new AppError('server_unavailable', { detail, retryable: true })
  }
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error
  return new AppError('server_unavailable', {
    detail: error instanceof Error ? error.message : 'backoffice admin query failed',
    cause: error,
    retryable: true,
  })
}

/**
 * The hint a `P0001` raise carried, e.g. `support_access_grant_not_live`.
 * Callers map it to a Turkish message; nothing else is ever shown to a person.
 */
export function postgresHint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const hint = (error as { hint?: unknown }).hint
  return typeof hint === 'string' && hint !== '' ? hint : null
}

// ===========================================================================
// 2. The RPC surface
//
// A closed map. There is no `rpc(name: string)` overload and no escape hatch:
// adding a call means adding an entry here, which is a reviewable diff.
// ===========================================================================

export type JsonScalar = string | number | boolean | null

export interface AdminResolveRow {
  admin_user_id: string
  role: string
  status: string
  email: string
  display_name: string | null
  mfa_enrolled_at: string | null
  last_login_at: string | null
}

export interface AdminTouchSessionRow {
  session_id: string
  admin_user_id: string
  role: string
  expires_at: string
  absolute_expires_at: string
}

interface AdminRpcMap {
  admin_resolve_by_auth_user: {
    args: { p_user_id: string }
    result: AdminResolveRow[]
  }
  admin_has_permission: {
    args: { p_admin_user_id: string; p_permission: AdminPermission }
    result: boolean
  }
  admin_touch_session: {
    args: { p_token_hash: string; p_idle_window: string }
    result: AdminTouchSessionRow[]
  }
  admin_revoke_sessions: {
    args: { p_admin_user_id: string; p_reason: string; p_except_session_id: string | null }
    result: number
  }
  admin_enforce_rate_limit: {
    args: { p_scope: string; p_subject_key: string; p_limit: number; p_window: string }
    result: boolean
  }
  admin_write_audit: {
    args: {
      /**
       * Null only for an event that has no admin actor by definition — a
       * refused sign-in. The accountability trigger refuses a null actor on
       * anything in the `admin.` / `support_access.` namespaces.
       */
      p_actor_admin_user_id: string | null
      p_action: string
      p_reason: string | null
      p_subject_user_id: string | null
      p_entity_type: string | null
      p_entity_id: string | null
      p_outcome: string
      p_support_access_grant_id: string | null
      p_detail: Record<string, JsonScalar>
    }
    result: string
  }
}

export type AdminRpcName = keyof AdminRpcMap

/**
 * Call one of the admin-platform functions from 0019.
 *
 * These are the only privileged operations the console performs that are not a
 * view read, and every one of them enforces its own rules with `security
 * definer` — so calling them is not a way around the schema, it is the schema.
 */
export async function adminRpc<K extends AdminRpcName>(
  fn: K,
  args: AdminRpcMap[K]['args'],
): Promise<AdminRpcMap[K]['result']> {
  try {
    const { data, error } = await service().rpc(fn, args)
    if (error) throw mapPostgrestError(error)
    return data as AdminRpcMap[K]['result']
  } catch (error) {
    throw toAppError(error)
  }
}

// ===========================================================================
// 3. The table surface
//
// Two frozen allow-lists, one for reads and one for writes. `admin_users`,
// `admin_sessions` and `support_access_grants` are the only tables the console
// writes; everything a page displays comes from a `bo_*` view.
//
// None of these names is a content table. `bo_*` views are content-blind by
// construction (0017) and the three writable tables hold staff facts, session
// hashes and grant metadata — no message, no event, no conversation.
// ===========================================================================

const ADMIN_READABLE = [
  'bo_admin_users',
  'bo_admin_permissions',
  'bo_admin_sessions',
  'bo_support_access_grants',
  'bo_support_access_reveals',
  'admin_roles',
  'admin_sensitive_actions',
  'admin_users',
] as const

const ADMIN_WRITABLE = ['admin_users', 'admin_sessions', 'support_access_grants'] as const

export type AdminReadable = (typeof ADMIN_READABLE)[number]
export type AdminWritable = (typeof ADMIN_WRITABLE)[number]

const READABLE_SET: ReadonlySet<string> = Object.freeze(new Set<string>(ADMIN_READABLE))
const WRITABLE_SET: ReadonlySet<string> = Object.freeze(new Set<string>(ADMIN_WRITABLE))

function assertReadable(source: string): asserts source is AdminReadable {
  if (!READABLE_SET.has(source)) {
    throw new AppError('forbidden', {
      status: 403,
      detail: `admin layer may not read "${source}"`,
    })
  }
}

function assertWritable(table: string): asserts table is AdminWritable {
  if (!WRITABLE_SET.has(table)) {
    throw new AppError('forbidden', {
      status: 403,
      detail: `admin layer may not write "${table}"`,
    })
  }
}

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'contains'

export interface AdminFilter {
  readonly column: string
  readonly op: FilterOperator
  readonly value: JsonScalar | readonly JsonScalar[]
}

export interface AdminOrder {
  readonly column: string
  readonly ascending?: boolean
  readonly nullsFirst?: boolean
}

export interface AdminQuery {
  /**
   * A literal PostgREST column list. Never build this from a query string: it
   * is interpolated into the request, and a projection is not a filter.
   */
  readonly columns?: string
  readonly filters?: readonly AdminFilter[]
  readonly order?: AdminOrder | readonly AdminOrder[]
  readonly limit?: number
  readonly offset?: number
}

export interface AdminPage<Row> {
  readonly rows: readonly Row[]
  /** Exact count matching the filters, computed by Postgres. */
  readonly total: number
}

/**
 * The shape of a PostgREST builder, declared structurally.
 *
 * `supabase-js` types its builder against a generated database type this app
 * deliberately does not have — generating one would pull the shape of every
 * content column into the console's type space. Declaring the four methods we
 * use is how that is avoided without a single `any`.
 */
interface PostgrestLike<Row> extends PromiseLike<{
  data: Row[] | null
  error: PostgrestError | null
  count: number | null
}> {
  eq(column: string, value: unknown): PostgrestLike<Row>
  neq(column: string, value: unknown): PostgrestLike<Row>
  gt(column: string, value: unknown): PostgrestLike<Row>
  gte(column: string, value: unknown): PostgrestLike<Row>
  lt(column: string, value: unknown): PostgrestLike<Row>
  lte(column: string, value: unknown): PostgrestLike<Row>
  in(column: string, values: readonly unknown[]): PostgrestLike<Row>
  is(column: string, value: boolean | null): PostgrestLike<Row>
  contains(column: string, value: readonly unknown[]): PostgrestLike<Row>
  order(column: string, options: { ascending: boolean; nullsFirst: boolean }): PostgrestLike<Row>
  range(from: number, to: number): PostgrestLike<Row>
}

function applyFilters<Row>(
  builder: PostgrestLike<Row>,
  filters: readonly AdminFilter[],
): PostgrestLike<Row> {
  let next = builder
  for (const filter of filters) {
    switch (filter.op) {
      case 'eq':
        next = next.eq(filter.column, filter.value)
        break
      case 'neq':
        next = next.neq(filter.column, filter.value)
        break
      case 'gt':
        next = next.gt(filter.column, filter.value)
        break
      case 'gte':
        next = next.gte(filter.column, filter.value)
        break
      case 'lt':
        next = next.lt(filter.column, filter.value)
        break
      case 'lte':
        next = next.lte(filter.column, filter.value)
        break
      case 'in':
        next = next.in(filter.column, Array.isArray(filter.value) ? filter.value : [filter.value])
        break
      case 'is':
        next = next.is(filter.column, filter.value === null ? null : Boolean(filter.value))
        break
      case 'contains':
        next = next.contains(
          filter.column,
          Array.isArray(filter.value) ? filter.value : [filter.value],
        )
        break
      default:
        break
    }
  }
  return next
}

function orderList(order: AdminQuery['order']): readonly AdminOrder[] {
  if (order === undefined) return []
  return Array.isArray(order) ? order : [order as AdminOrder]
}

/** Read from an admin-platform view or table, with an exact total. */
export async function adminSelect<Row>(
  source: AdminReadable,
  query: AdminQuery = {},
): Promise<AdminPage<Row>> {
  assertReadable(source)
  try {
    let builder = service()
      .from(source)
      .select(query.columns ?? '*', { count: 'exact' }) as unknown as PostgrestLike<Row>
    builder = applyFilters(builder, query.filters ?? [])
    for (const order of orderList(query.order)) {
      builder = builder.order(order.column, {
        ascending: order.ascending ?? false,
        nullsFirst: order.nullsFirst ?? false,
      })
    }
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    builder = builder.range(offset, offset + limit - 1)

    const { data, error, count } = await builder
    if (error) throw mapPostgrestError(error)
    return { rows: data ?? [], total: count ?? 0 }
  } catch (error) {
    throw toAppError(error)
  }
}

/** The first matching row, or null. */
export async function adminSelectOne<Row>(
  source: AdminReadable,
  query: AdminQuery = {},
): Promise<Row | null> {
  const page = await adminSelect<Row>(source, { ...query, limit: 1 })
  return page.rows[0] ?? null
}

export type AdminWriteValue = JsonScalar | readonly string[]

/** Insert one row and return it. */
export async function adminInsert<Row>(
  table: AdminWritable,
  values: Readonly<Record<string, AdminWriteValue>>,
  returning = '*',
): Promise<Row> {
  assertWritable(table)
  try {
    const { data, error } = await service().from(table).insert(values).select(returning)
    if (error) throw mapPostgrestError(error)
    const row = (data ?? [])[0] as Row | undefined
    if (row === undefined) {
      throw new AppError('server_unavailable', {
        detail: `insert into ${table} returned no row`,
        retryable: false,
      })
    }
    return row
  } catch (error) {
    throw toAppError(error)
  }
}

/** Update matching rows and return them. */
export async function adminUpdate<Row>(
  table: AdminWritable,
  values: Readonly<Record<string, AdminWriteValue>>,
  filters: readonly AdminFilter[],
  returning = '*',
): Promise<readonly Row[]> {
  assertWritable(table)
  if (filters.length === 0) {
    // An unfiltered UPDATE on admin_users would demote every admin at once.
    throw new AppError('validation_failed', {
      status: 422,
      detail: `update on ${table} requires at least one filter`,
    })
  }
  try {
    const builder = service().from(table).update(values).select(returning)
    const { data, error } = await applyFilters(builder as unknown as PostgrestLike<Row>, filters)
    if (error) throw mapPostgrestError(error)
    return data ?? []
  } catch (error) {
    throw toAppError(error)
  }
}

// ===========================================================================
// 4. MFA policy
// ===========================================================================

/**
 * How hard the console insists on a second factor.
 *
 *   `enrolled` (default) — an admin who has enrolled MFA in GoTrue must present
 *       it: the console session is only issued for an `aal2` token. An admin
 *       who has not enrolled signs in with a password, and the roster shows
 *       "MFA yok" as a real warning rather than a green tick.
 *   `required` — nobody signs in without an enrolled, verified second factor.
 *       This is the setting to run in production once every admin has enrolled.
 *
 * There is deliberately no `off`: the weaker setting still enforces MFA for
 * everyone who has it, so there is no value to turn a check into a no-op.
 */
export type MfaPolicy = 'enrolled' | 'required'

export function mfaPolicy(): MfaPolicy {
  return process.env['BACKOFFICE_MFA_POLICY'] === 'required' ? 'required' : 'enrolled'
}

/** GoTrue reports `aal2` once a second factor has been verified this session. */
const AAL2 = 'aal2'

// ===========================================================================
// 5. The session
// ===========================================================================

export interface AdminIdentity {
  readonly adminUserId: string
  readonly authUserId: string | null
  /**
   * The operator's own address, in full. This is the one unredacted address the
   * console renders, and it belongs to the person reading the screen — it is
   * how they confirm which account they are signed in as. Every other address,
   * including another admin's, is redacted.
   */
  readonly email: string
  readonly displayName: string | null
  readonly role: AdminRole
  readonly status: AdminStatus
  readonly mfaEnrolledAt: string | null
  readonly lastLoginAt: string | null
}

export interface AdminSession {
  readonly identity: AdminIdentity
  readonly adminUserId: string
  readonly role: AdminRole
  /** Effective permissions, from `bo_admin_permissions`. */
  readonly permissions: ReadonlySet<AdminPermission>
  /** The same set as an array, for props crossing into a Client Component. */
  readonly permissionList: readonly AdminPermission[]
  readonly sessionId: string
  readonly expiresAt: Date
  readonly absoluteExpiresAt: Date
  /** The value every mutating form must post back in `_csrf`. */
  readonly csrfToken: string
  /** `aggregate` for an analyst, `metadata` for everybody else. */
  readonly redactionLevel: RedactionLevel
}

export type AdminSessionResult =
  | { readonly kind: 'admin'; readonly session: AdminSession }
  | { readonly kind: 'no_session' }
  | { readonly kind: 'session_invalid' }
  | { readonly kind: 'unavailable'; readonly code: string }

/** True when this session holds the permission. Server-side; never trust a prop. */
export function sessionCan(session: AdminSession, permission: AdminPermission): boolean {
  return session.permissions.has(permission)
}

async function loadIdentity(adminUserId: string): Promise<AdminIdentity | null> {
  const row = await adminSelectOne<{
    id: string
    user_id: string | null
    email: string
    display_name: string | null
    role: string
    status: string
    mfa_enrolled_at: string | null
    last_login_at: string | null
  }>('admin_users', {
    columns: 'id,user_id,email,display_name,role,status,mfa_enrolled_at,last_login_at',
    filters: [{ column: 'id', op: 'eq', value: adminUserId }],
  })
  if (row === null) return null
  if (!isAdminRole(row.role) || !isAdminStatus(row.status)) return null
  return {
    adminUserId: row.id,
    authUserId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    mfaEnrolledAt: row.mfa_enrolled_at,
    lastLoginAt: row.last_login_at,
  }
}

/**
 * The caller's effective permissions.
 *
 * Read from `bo_admin_permissions` rather than `admin_permissions_for()`: the
 * view's `where a.status = 'active' and a.disabled_at is null` is the same
 * filter the function applies, and a row shape is unambiguous where a
 * `setof enum` is not. Deny by default falls out of the view — a disabled admin
 * has no rows there at all — and `toPermissionSet()` then intersects the result
 * with the role's own matrix entry, so a grant inserted outside a reviewed
 * migration is inert.
 */
async function loadPermissions(
  adminUserId: string,
  role: AdminRole,
): Promise<ReadonlySet<AdminPermission>> {
  const page = await adminSelect<{ permission: string }>('bo_admin_permissions', {
    columns: 'permission',
    filters: [{ column: 'admin_user_id', op: 'eq', value: adminUserId }],
    limit: ADMIN_PERMISSIONS.length,
  })
  return toPermissionSet(
    page.rows.map((row) => row.permission),
    role,
  )
}

async function readAdminSessionUncached(): Promise<AdminSessionResult> {
  const store = await cookies()
  const token = store.get(ADMIN_SESSION_COOKIE)?.value
  if (token === undefined || token === '') return { kind: 'no_session' }

  try {
    const tokenHash = await sessionTokenHashBytea(token)
    // One atomic statement: validate the hash, check both deadlines, check the
    // admin is still active, slide the idle deadline. No rows means no session,
    // and the reason is deliberately not disclosed.
    const rows = await adminRpc('admin_touch_session', {
      p_token_hash: tokenHash,
      p_idle_window: ADMIN_SESSION_IDLE_INTERVAL,
    })
    const touched = rows[0]
    if (touched === undefined) return { kind: 'session_invalid' }

    const identity = await loadIdentity(touched.admin_user_id)
    if (identity === null || identity.status !== 'active') return { kind: 'session_invalid' }

    const permissions = await loadPermissions(touched.admin_user_id, identity.role)

    return {
      kind: 'admin',
      session: {
        identity,
        adminUserId: identity.adminUserId,
        role: identity.role,
        permissions,
        permissionList: [...permissions],
        sessionId: touched.session_id,
        expiresAt: new Date(touched.expires_at),
        absoluteExpiresAt: new Date(touched.absolute_expires_at),
        csrfToken: await deriveCsrfToken(token),
        redactionLevel: baseRedactionLevel(identity.role),
      },
    }
  } catch (error) {
    // A configuration or infrastructure failure must not read as "signed out":
    // that would send an operator into a sign-in loop during an outage. A dead
    // session is `no rows`, never an error, so every error reaching here is
    // infrastructure — including a `forbidden`, which at this point means the
    // service role has lost a grant rather than that the operator has.
    return { kind: 'unavailable', code: isAppError(error) ? error.code : 'unknown' }
  }
}

/**
 * The current console session, without redirecting.
 *
 * Memoised per request with React's `cache`, so a layout, a page and three
 * Server Actions in the same render share one `admin_touch_session()` call
 * instead of five.
 */
export const readAdminSession: () => Promise<AdminSessionResult> = cache(readAdminSessionUncached)

// ===========================================================================
// 6. The guards
// ===========================================================================

/**
 * The session, reduced to the five facts `decideAccess()` needs.
 *
 * `sessionLive` is unconditionally true here because a session object only
 * exists when `admin_touch_session()` returned a row, and that statement
 * refuses an expired, revoked or disabled-admin session. The field is on
 * `AccessSubject` so the decision function can be tested against a dead session
 * without one having to be constructible in production.
 */
function subjectFor(session: AdminSession): AccessSubject {
  return {
    status: session.identity.status,
    role: session.role,
    permissions: session.permissions,
    sessionLive: true,
    assuranceMet: mfaPolicy() === 'required' ? session.identity.mfaEnrolledAt !== null : true,
  }
}

function denialReasonFor(result: AdminSessionResult): AccessDenialReason {
  return result.kind === 'no_session' ? 'no_session' : 'session_expired'
}

/** Where a refusal sends the operator, and with what explanation. */
function refuse(reason: AccessDenialReason, requirement: PermissionRequirement): never {
  if (isRecoverableBySigningIn(reason)) {
    redirect(`${SIGN_IN_PATH}?reason=${reason}`)
  }
  const needed = requirementNames(requirement)
  redirect(
    `${UNAUTHORIZED_PATH}?${DENIAL_REASON_PARAM}=${reason}` +
      `&${DENIAL_NEEDED_PARAM}=${encodeURIComponent(needed)}`,
  )
}

/** The same refusal for a Server Action, which cannot redirect mid-POST. */
function refuseAction(reason: AccessDenialReason, requirement: PermissionRequirement): never {
  const recoverable = isRecoverableBySigningIn(reason)
  throw new AppError(recoverable ? 'unauthorized' : 'forbidden', {
    status: recoverable ? 401 : 403,
    detail: `${reason}: ${requirementNames(requirement)}`,
  })
}

function requirementNames(requirement: PermissionRequirement): string {
  if (typeof requirement === 'string') return requirement
  if ('anyOf' in requirement) return requirement.anyOf.join(',')
  return requirement.allOf.join(',')
}

/**
 * The gate every protected Server Component calls first.
 *
 * Redirects rather than throwing, so a page body never runs without an
 * authorised operator. There is no default requirement: a page must name the
 * permission it needs, and a page that names none does not compile.
 *
 * A configuration or database outage is re-thrown as a retryable error for the
 * nearest error boundary, never turned into a sign-in redirect — an outage is
 * not a signed-out user, and treating it as one loops an operator through a
 * form that cannot work.
 */
export async function requirePermission(requirement: PermissionRequirement): Promise<AdminSession> {
  const result = await readAdminSession()
  if (result.kind === 'unavailable') {
    throw new AppError('server_unavailable', {
      detail: `admin session unavailable: ${result.code}`,
      retryable: true,
    })
  }
  if (result.kind === 'admin') {
    const decision = decideAccess(subjectFor(result.session), requirement)
    if (decision.allowed) return result.session
    refuse(decision.reason, requirement)
  }
  refuse(denialReasonFor(result), requirement)
}

/**
 * The Server Action variant.
 *
 * Actions cannot redirect a client mid-POST as cleanly as a page can and need
 * to return a message their form renders, so this throws a typed error instead.
 *
 * It also performs the two CSRF checks, because an action that forgets to call
 * a separate `assertCsrf()` is exactly the mistake this signature is shaped to
 * prevent: pass the `FormData` and both checks happen, or pass nothing and the
 * same-origin check still happens.
 */
export async function requirePermissionAction(
  requirement: PermissionRequirement,
  formData?: FormData,
): Promise<AdminSession> {
  await assertSameOriginRequest()

  const result = await readAdminSession()
  if (result.kind === 'unavailable') {
    throw new AppError('server_unavailable', { detail: result.code, retryable: true })
  }

  if (result.kind !== 'admin') refuseAction(denialReasonFor(result), requirement)

  const decision = decideAccess(subjectFor(result.session), requirement)
  if (!decision.allowed) refuseAction(decision.reason, requirement)

  if (formData !== undefined) assertCsrfToken(result.session, formData)
  return result.session
}

/** The verdict without acting on it, for a page that renders two variants. */
export async function checkPermission(requirement: PermissionRequirement): Promise<AccessDecision> {
  const result = await readAdminSession()
  if (result.kind !== 'admin') {
    return {
      allowed: false,
      reason: result.kind === 'no_session' ? 'no_session' : 'session_expired',
    }
  }
  return decideAccess(subjectFor(result.session), requirement)
}

/** True when the current session holds the permission. For conditional UI. */
export async function hasPermission(permission: AdminPermission): Promise<boolean> {
  const decision = await checkPermission(permission)
  return decision.allowed
}

/**
 * Re-check a permission against the database at the moment of acting.
 *
 * `session.permissions` was loaded when the render began. For an ordinary page
 * that is fine — a stale answer is at most one navigation old. For the two
 * decisions with no undo, approving somebody's access to a stranger's mailbox
 * and revoking it, the question is asked again at the source, so a role changed
 * or an account disabled in the meantime takes effect immediately rather than
 * at the operator's next page load.
 *
 * `admin_has_permission()` is `security definer` and re-reads
 * `admin_users.status` itself, so a disabled admin fails here even holding a
 * session that was live a second ago.
 */
export async function assertPermissionAtSource(
  session: AdminSession,
  permission: AdminPermission,
): Promise<void> {
  const held = await adminRpc('admin_has_permission', {
    p_admin_user_id: session.adminUserId,
    p_permission: permission,
  })
  if (!held) {
    throw new AppError('forbidden', {
      status: 403,
      detail: `${permission} is no longer held by admin ${session.adminUserId}`,
    })
  }
}

/** The Turkish sentence a 403 page renders for a denial reason. */
export function denialMessage(reason: AccessDenialReason): string {
  return DENIAL_MESSAGES_TR[reason]
}

// ===========================================================================
// 7. CSRF
// ===========================================================================

/**
 * Refuse a Server Action whose `Origin` does not match the host it reached.
 *
 * Next performs an equivalent check of its own. This one is the application's,
 * and the two fail independently: a framework upgrade that changed the default
 * would not silently remove the protection.
 */
export async function assertSameOriginRequest(): Promise<void> {
  const requestHeaders = await headers()
  const origin = requestHeaders.get('origin')
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  if (!isSameOrigin(origin, host)) {
    throw new AppError('forbidden', {
      status: 403,
      detail: 'cross-origin server action refused',
    })
  }
}

/**
 * Compare the form's `_csrf` field with the token derived from this session.
 *
 * The token is `sha256(sessionToken + ':csrf')`. An attacker who cannot read
 * the httpOnly session cookie cannot produce it, and an operator's rendered
 * form leaking it does not leak the session token, because SHA-256 does not run
 * backwards.
 */
export function assertCsrfToken(session: AdminSession, formData: FormData): void {
  const presented = formData.get(CSRF_FIELD_NAME)
  if (!isCsrfTokenShape(presented) || !constantTimeEqual(presented, session.csrfToken)) {
    throw new AppError('forbidden', { status: 403, detail: 'csrf token mismatch' })
  }
}

/** The field name and value a form must render. */
export function csrfField(session: AdminSession): { name: string; value: string } {
  return { name: CSRF_FIELD_NAME, value: session.csrfToken }
}

export { CSRF_FIELD_NAME, SIGN_IN_PATH, UNAUTHORIZED_PATH }

// ===========================================================================
// 8. Signing in
//
// Rate limiting, credential check, authorization check, MFA policy and session
// issue all happen here rather than in the form's action, so a page cannot
// assemble a sign-in that skips one of them.
// ===========================================================================

export interface AdminSignInInput {
  readonly email: string
  readonly password: string
}

export interface MfaFactorSummary {
  readonly id: string
  readonly friendlyName: string | null
  readonly factorType: string
}

export type AdminSignInOutcome =
  | { readonly status: 'signed_in'; readonly adminUserId: string; readonly role: AdminRole }
  /** Credentials accepted, second factor still owed. */
  | { readonly status: 'mfa_required'; readonly factors: readonly MfaFactorSummary[] }
  /** Credentials accepted, but the policy demands a factor that is not enrolled. */
  | { readonly status: 'mfa_enrolment_required' }
  | { readonly status: 'invalid_credentials' }
  | { readonly status: 'not_admin'; readonly authUserId: string }
  | { readonly status: 'rate_limited'; readonly retryAfterSeconds: number }

interface GoTrueTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

async function goTrue(
  path: string,
  init: { method: string; body?: unknown; accessToken?: string },
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const env = readEnv()
  const requestHeaders: Record<string, string> = {
    apikey: env.anonKey,
    'Content-Type': 'application/json',
  }
  if (init.accessToken !== undefined) {
    requestHeaders['Authorization'] = `Bearer ${init.accessToken}`
  }
  const response = await fetch(`${env.supabaseUrl}/auth/v1${path}`, {
    method: init.method,
    headers: requestHeaders,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  })
  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = await response.json()
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>
  } catch {
    body = {}
  }
  return { ok: response.ok, status: response.status, body }
}

function readTokens(body: Record<string, unknown>): GoTrueTokens | null {
  const accessToken = body['access_token']
  const refreshToken = body['refresh_token']
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null
  const expiresAt = body['expires_at']
  return {
    accessToken,
    refreshToken,
    expiresAt: typeof expiresAt === 'number' ? expiresAt : 0,
  }
}

async function writeGoTrueCookies(tokens: GoTrueTokens, clock: Clock): Promise<void> {
  const store = await cookies()
  const nowSeconds = Math.floor(clock.now().getTime() / 1000)
  const accessLifetime =
    tokens.expiresAt > nowSeconds
      ? Math.min(tokens.expiresAt - nowSeconds, ACCESS_COOKIE_MAX_AGE)
      : ACCESS_COOKIE_MAX_AGE
  store.set(ACCESS_COOKIE, tokens.accessToken, sessionCookieOptions(accessLifetime))
  store.set(REFRESH_COOKIE, tokens.refreshToken, sessionCookieOptions(REFRESH_COOKIE_MAX_AGE))
}

/**
 * Every enrolled, verified factor on the account behind this access token.
 *
 * GoTrue exposes factors on the user record rather than a list endpoint, which
 * is also what `supabase.auth.mfa.listFactors()` reads. An unverified factor —
 * an enrolment somebody started and abandoned — is excluded: it cannot satisfy
 * a challenge, so offering it would be a control that does nothing.
 */
export async function listMfaFactors(accessToken: string): Promise<readonly MfaFactorSummary[]> {
  const response = await goTrue('/user', { method: 'GET', accessToken })
  if (!response.ok) return []
  const factors = response.body['factors']
  const source: readonly unknown[] = Array.isArray(factors) ? factors : []
  const out: MfaFactorSummary[] = []
  for (const entry of source) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (record['status'] !== 'verified') continue
    const id = record['id']
    if (typeof id !== 'string') continue
    const friendly = record['friendly_name']
    const factorType = record['factor_type']
    out.push({
      id,
      friendlyName: typeof friendly === 'string' ? friendly : null,
      factorType: typeof factorType === 'string' ? factorType : 'totp',
    })
  }
  return out
}

export interface MfaChallenge {
  readonly challengeId: string
  readonly factorId: string
  readonly expiresAtSeconds: number | null
}

/** Ask GoTrue for a challenge on an enrolled factor. */
export async function startMfaChallenge(
  accessToken: string,
  factorId: string,
): Promise<MfaChallenge> {
  const response = await goTrue(`/factors/${encodeURIComponent(factorId)}/challenge`, {
    method: 'POST',
    accessToken,
  })
  const id = response.body['id']
  if (!response.ok || typeof id !== 'string') {
    throw new AppError('server_unavailable', {
      detail: `mfa challenge failed with ${response.status}`,
      retryable: true,
    })
  }
  const expires = response.body['expires_at']
  return {
    challengeId: id,
    factorId,
    expiresAtSeconds: typeof expires === 'number' ? expires : null,
  }
}

/**
 * A challenge on the half-finished sign-in sitting in the cookie jar.
 *
 * The challenge is created immediately before the code is answered rather than
 * carried around in the form's state: GoTrue expires a challenge on its own
 * schedule, and a form holding a stale one would refuse a correct code and read
 * as "wrong code" to the person typing it. Null when the password step's access
 * cookie is gone, which is a sign-in that has to start again rather than an
 * error.
 */
export async function challengeMfaFactor(factorId: string): Promise<MfaChallenge | null> {
  const store = await cookies()
  const accessToken = store.get(ACCESS_COOKIE)?.value
  if (accessToken === undefined || accessToken === '') return null
  return startMfaChallenge(accessToken, factorId)
}

export interface MfaEnrolment {
  readonly factorId: string
  /** The `otpauth://` URI an authenticator app scans. Shown once, never stored. */
  readonly uri: string | null
  /** The shared secret, for manual entry. Shown once, never stored. */
  readonly secret: string | null
}

/**
 * Begin TOTP enrolment for the signed-in admin.
 *
 * Fails with a real message when the Supabase project has MFA disabled — the
 * console says so rather than showing a QR code that will never verify.
 */
export async function enrollMfaFactor(
  accessToken: string,
  friendlyName: string,
): Promise<MfaEnrolment> {
  const response = await goTrue('/factors', {
    method: 'POST',
    accessToken,
    body: { factor_type: 'totp', friendly_name: friendlyName },
  })
  const id = response.body['id']
  if (!response.ok || typeof id !== 'string') {
    throw new AppError('server_unavailable', {
      detail: `mfa enrolment unavailable (${response.status})`,
      retryable: false,
    })
  }
  const totp = response.body['totp']
  const detail = typeof totp === 'object' && totp !== null ? (totp as Record<string, unknown>) : {}
  const uri = detail['uri']
  const secret = detail['secret']
  return {
    factorId: id,
    uri: typeof uri === 'string' ? uri : null,
    secret: typeof secret === 'string' ? secret : null,
  }
}

/**
 * Sign-in attempts per bucket per window.
 *
 * Declared here rather than in `rate-limit.ts` because `signInAdmin()` enforces
 * it itself — a sign-in that could be assembled without the limiter would be a
 * sign-in that skips it. `rate-limit.ts` re-exports this in its rule table so
 * there is still one number, in one place, for the console to render.
 *
 * Eight attempts in fifteen minutes is generous for a person and useless for a
 * script: at that rate a four-word passphrase outlives the company.
 */
export const SIGN_IN_RATE_LIMIT: {
  readonly scope: string
  readonly limit: number
  readonly windowSeconds: number
} = Object.freeze({ scope: 'admin.sign_in', limit: 8, windowSeconds: 15 * 60 })

async function signInAllowed(subject: string): Promise<boolean> {
  return adminRpc('admin_enforce_rate_limit', {
    p_scope: SIGN_IN_RATE_LIMIT.scope,
    // Hashed: `admin_rate_limits.subject_key` is constrained to 64 hex
    // characters, so an address or an IP cannot be stored in the clear.
    p_subject_key: await sha256Hex(subject),
    p_limit: SIGN_IN_RATE_LIMIT.limit,
    p_window: `${SIGN_IN_RATE_LIMIT.windowSeconds} seconds`,
  })
}

async function resolveAdmin(authUserId: string): Promise<AdminResolveRow | null> {
  const rows = await adminRpc('admin_resolve_by_auth_user', { p_user_id: authUserId })
  return rows[0] ?? null
}

/**
 * Step one of signing in: password, then authorization, then MFA policy.
 *
 * The GoTrue cookies are written before the MFA step because the second factor
 * has to be verified against that very session — but they authorise nothing on
 * their own. The console session, which is what `requirePermission()` reads, is
 * issued only at the end, and only when every check has passed.
 *
 * Writes cookies, so it may only be called from a Server Action or a Route
 * Handler; a Server Component cannot set one.
 */
export async function signInAdmin(
  input: AdminSignInInput,
  clock: Clock = systemClock,
): Promise<AdminSignInOutcome> {
  const normalisedEmail = input.email.trim().toLowerCase()

  // Two buckets: the address (stops a single account being ground down) and the
  // client address (stops one host spraying many accounts). Both are hashed.
  const requestHeaders = await headers()
  const ip = clientIpFromHeaders(requestHeaders)
  const byEmail = await signInAllowed(`email:${normalisedEmail}`)
  const byIp = ip === null ? true : await signInAllowed(`ip:${ip}`)
  if (!byEmail || !byIp) {
    return { status: 'rate_limited', retryAfterSeconds: SIGN_IN_RATE_LIMIT.windowSeconds }
  }

  const response = await goTrue('/token?grant_type=password', {
    method: 'POST',
    body: { email: normalisedEmail, password: input.password },
  })
  if (response.status === 429) {
    return { status: 'rate_limited', retryAfterSeconds: SIGN_IN_RATE_LIMIT.windowSeconds }
  }
  if (!response.ok) return { status: 'invalid_credentials' }
  const tokens = readTokens(response.body)
  if (tokens === null) return { status: 'invalid_credentials' }

  const claims = jwtClaims(tokens.accessToken)
  if (claims.subject === null) return { status: 'invalid_credentials' }

  const admin = await resolveAdmin(claims.subject)
  if (admin === null) return { status: 'not_admin', authUserId: claims.subject }

  await writeGoTrueCookies(tokens, clock)

  const enrolled = admin.mfa_enrolled_at !== null
  const factors =
    enrolled || mfaPolicy() === 'required' ? await listMfaFactors(tokens.accessToken) : []

  if (claims.assuranceLevel !== AAL2) {
    if (factors.length > 0) return { status: 'mfa_required', factors }
    if (mfaPolicy() === 'required') return { status: 'mfa_enrolment_required' }
    if (enrolled) {
      // Enrolment is recorded but GoTrue reports no verified factor: the factor
      // was removed upstream. Treat it as owed rather than waving it through.
      return { status: 'mfa_enrolment_required' }
    }
  }

  return finishSignIn(admin, claims.assuranceLevel === AAL2, clock)
}

/**
 * Step two: verify the TOTP code against the challenge, then issue the console
 * session on the upgraded `aal2` token.
 *
 * Writes cookies: Server Action or Route Handler only.
 */
export async function completeMfaSignIn(
  input: { factorId: string; challengeId: string; code: string },
  clock: Clock = systemClock,
): Promise<AdminSignInOutcome> {
  const store = await cookies()
  const accessToken = store.get(ACCESS_COOKIE)?.value
  if (accessToken === undefined || accessToken === '') return { status: 'invalid_credentials' }

  const claims = jwtClaims(accessToken)
  if (claims.subject === null) return { status: 'invalid_credentials' }

  const allowed = await signInAllowed(`mfa:${claims.subject}`)
  if (!allowed)
    return { status: 'rate_limited', retryAfterSeconds: SIGN_IN_RATE_LIMIT.windowSeconds }

  const response = await goTrue(`/factors/${encodeURIComponent(input.factorId)}/verify`, {
    method: 'POST',
    accessToken,
    body: { challenge_id: input.challengeId, code: input.code },
  })
  if (!response.ok) return { status: 'invalid_credentials' }
  const tokens = readTokens(response.body)
  if (tokens === null) return { status: 'invalid_credentials' }

  const verified = jwtClaims(tokens.accessToken)
  if (verified.assuranceLevel !== AAL2) return { status: 'invalid_credentials' }

  const admin = await resolveAdmin(claims.subject)
  if (admin === null) return { status: 'not_admin', authUserId: claims.subject }

  await writeGoTrueCookies(tokens, clock)
  return finishSignIn(admin, true, clock)
}

async function finishSignIn(
  admin: AdminResolveRow,
  mfaVerified: boolean,
  clock: Clock,
): Promise<AdminSignInOutcome> {
  if (!isAdminRole(admin.role)) {
    throw new AppError('server_unavailable', {
      detail: `unknown admin role "${admin.role}"`,
      retryable: false,
    })
  }
  await issueAdminSession(admin.admin_user_id, clock)
  await stampLogin(admin, mfaVerified, clock)
  return { status: 'signed_in', adminUserId: admin.admin_user_id, role: admin.role }
}

async function stampLogin(
  admin: AdminResolveRow,
  mfaVerified: boolean,
  clock: Clock,
): Promise<void> {
  const now = clock.now().toISOString()
  const values: Record<string, AdminWriteValue> = { last_login_at: now, updated_at: now }
  // Enrolment is a fact GoTrue owns; mirror it the first time we see `aal2` so
  // the roster's MFA column reflects reality rather than an intention.
  if (mfaVerified && admin.mfa_enrolled_at === null) values['mfa_enrolled_at'] = now
  await adminUpdate('admin_users', values, [{ column: 'id', op: 'eq', value: admin.admin_user_id }])
}

/**
 * Create the console session row and write its cookie.
 *
 * The token is generated here, handed to the browser once and never stored:
 * `admin_sessions.token_hash` holds only its SHA-256, and the `\x` literal is
 * what crosses PostgREST as a `bytea`.
 */
async function issueAdminSession(adminUserId: string, clock: Clock): Promise<void> {
  const token = newSessionToken()
  const now = clock.now()
  const issuedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_IDLE_SECONDS * 1000)
  const absoluteExpiresAt = new Date(now.getTime() + ADMIN_SESSION_ABSOLUTE_SECONDS * 1000)

  const requestHeaders = await headers()
  const ip = clientIpFromHeaders(requestHeaders)
  const userAgent = requestHeaders.get('user-agent')

  await adminInsert('admin_sessions', {
    admin_user_id: adminUserId,
    token_hash: await sessionTokenHashBytea(token),
    issued_at: issuedAt,
    last_seen_at: issuedAt,
    expires_at: expiresAt.toISOString(),
    absolute_expires_at: absoluteExpiresAt.toISOString(),
    // Hashed, because `admin_sessions.ip_hash` is constrained to 64 hex
    // characters precisely so an address cannot be stored here by accident.
    ip_hash: ip === null ? null : await sha256Hex(ip),
    user_agent: userAgent === null ? null : userAgent.slice(0, 400),
  })

  const store = await cookies()
  store.set(
    ADMIN_SESSION_COOKIE,
    token,
    sessionCookieOptions(sessionCookieMaxAge(now, absoluteExpiresAt)),
  )
}

// ===========================================================================
// 9. Signing out, and ending other people's sessions
// ===========================================================================

interface ClearedTokens {
  readonly accessToken: string | null
  readonly refreshToken: string | null
}

/** Clears all three cookies, handing back the GoTrue tokens they carried. */
async function clearAllCookies(): Promise<ClearedTokens> {
  const store = await cookies()
  const accessToken = store.get(ACCESS_COOKIE)?.value ?? null
  const refreshToken = store.get(REFRESH_COOKIE)?.value ?? null
  store.set(ADMIN_SESSION_COOKIE, '', sessionCookieOptions(0))
  store.set(ACCESS_COOKIE, '', sessionCookieOptions(0))
  store.set(REFRESH_COOKIE, '', sessionCookieOptions(0))
  return { accessToken, refreshToken }
}

/** Ends the GoTrue session upstream, so the refresh token stops working too. */
async function revokeGoTrueSession(accessToken: string): Promise<void> {
  try {
    await goTrue('/logout?scope=local', { method: 'POST', accessToken })
  } catch {
    // The cookies are already gone, so the operator is signed out of this
    // browser either way, and the token expires on its own.
  }
}

/** Marks the console session row revoked. Idempotent; never throws. */
async function revokeSessionRow(token: string, reason: string, clock: Clock): Promise<void> {
  try {
    await adminUpdate(
      'admin_sessions',
      { revoked_at: clock.now().toISOString(), revoked_reason: reason },
      [
        { column: 'token_hash', op: 'eq', value: await sessionTokenHashBytea(token) },
        { column: 'revoked_at', op: 'is', value: null },
      ],
      'id',
    )
  } catch {
    // A session that cannot be revoked server-side must still lose its cookie;
    // it expires on its own within the idle window at worst.
  }
}

/**
 * End this session: revoke the row, clear the cookies, revoke upstream.
 *
 * The row is revoked first. If the process died between the two steps the
 * cookie would still be presented — and refused — rather than the reverse.
 *
 * Clears cookies: Server Action or Route Handler only.
 */
export async function signOutAdmin(
  reason = 'Yönetici oturumu kapattı',
  clock: Clock = systemClock,
): Promise<void> {
  const store = await cookies()
  const token = store.get(ADMIN_SESSION_COOKIE)?.value
  if (token !== undefined && token !== '') await revokeSessionRow(token, reason, clock)
  const cleared = await clearAllCookies()
  if (cleared.accessToken !== null) await revokeGoTrueSession(cleared.accessToken)
}

/**
 * "Log out all sessions", as a server-side fact rather than a cookie the
 * browser may ignore.
 *
 * `keepCurrent` lets an admin evict a session they do not recognise without
 * locking themselves out of the page they are standing on.
 */
export async function revokeAllSessions(input: {
  adminUserId: string
  reason: string
  keepCurrentSessionId?: string | null
}): Promise<number> {
  return adminRpc('admin_revoke_sessions', {
    p_admin_user_id: input.adminUserId,
    p_reason: input.reason,
    p_except_session_id: input.keepCurrentSessionId ?? null,
  })
}

// ===========================================================================
// 10. Roster reads used by the guards' own screens
// ===========================================================================

export interface AdminRoleRow {
  role: AdminRole
  rank: number
  label_tr: string
  description_tr: string
  is_assignable: boolean
}

/** The assignable roles, in display order, for an invite or role-change form. */
export async function loadAssignableRoles(): Promise<readonly AdminRoleRow[]> {
  const page = await adminSelect<AdminRoleRow>('admin_roles', {
    columns: 'role,rank,label_tr,description_tr,is_assignable',
    filters: [{ column: 'is_assignable', op: 'is', value: true }],
    order: { column: 'rank', ascending: true },
    limit: ADMIN_ROLES.length,
  })
  return page.rows.filter((row) => isAdminRole(row.role))
}

// ===========================================================================
// 11. The migration bridge
//
// The console's first pass gated on `staff_members` and three tiers. The pages
// from that pass are being moved to `requirePermission()` one area at a time,
// and until they are they still import these names. Every one of them is
// implemented on the admin platform above — none of them reads `staff_members`,
// and none of them is a stub. They exist so the migration can happen a page at
// a time instead of in one unreviewable commit, and they are deleted when the
// last caller is gone.
// ===========================================================================

/** @deprecated The three legacy tiers. Use `AdminRole` and permissions. */
export type StaffRole = 'support' | 'ops' | 'admin'

/** @deprecated Use `AdminIdentity`. */
export interface AuthenticatedUser {
  id: string
  email: string | null
}

/** @deprecated Use `AdminSession`. */
export interface StaffSession {
  userId: string
  email: string | null
  role: StaffRole
  adminUserId: string
  adminRole: AdminRole
}

/** @deprecated Use `AdminSessionResult`. */
export type SessionDenial =
  | { kind: 'no_session' }
  | { kind: 'not_staff'; user: AuthenticatedUser }
  | { kind: 'disabled'; user: AuthenticatedUser }
  | { kind: 'unavailable'; code: string }

/** @deprecated Use `AdminSessionResult`. */
export type SessionResult = { kind: 'staff'; session: StaffSession } | SessionDenial

const LEGACY_ROLE_RANK: Readonly<Record<StaffRole, number>> = Object.freeze({
  support: 1,
  ops: 2,
  admin: 3,
})

/** @deprecated Display ordering for the legacy tiers. */
export function roleRank(role: StaffRole): number {
  return LEGACY_ROLE_RANK[role]
}

/** @deprecated Use a permission check. */
export function roleSatisfies(actual: StaffRole, minimum: StaffRole): boolean {
  return LEGACY_ROLE_RANK[actual] >= LEGACY_ROLE_RANK[minimum]
}

/** @deprecated Use `ADMIN_ROLES`. */
export function roleOrderedList(): readonly StaffRole[] {
  return ['support', 'ops', 'admin']
}

/**
 * The permission each legacy tier stood for.
 *
 * Chosen so the bridge is a real authorization decision rather than a name
 * mapping: `ops` meant "may act on the platform", which is `integration.resync`;
 * `admin` meant "may change who else is an admin", which is `admin.role.write`.
 */
const LEGACY_TIER_PERMISSION: Readonly<Record<StaffRole, AdminPermission>> = Object.freeze({
  support: 'users.read',
  ops: 'integration.resync',
  admin: 'admin.role.write',
})

/** The legacy tier this permission set actually behaves as. */
function legacyTierFor(permissions: ReadonlySet<AdminPermission>): StaffRole {
  if (permissions.has('admin.role.write')) return 'admin'
  if (permissions.has('integration.resync')) return 'ops'
  return 'support'
}

function toStaffSession(session: AdminSession): StaffSession {
  return {
    userId: session.identity.authUserId ?? session.adminUserId,
    email: session.identity.email,
    role: legacyTierFor(session.permissions),
    adminUserId: session.adminUserId,
    adminRole: session.role,
  }
}

/** @deprecated Use `readAdminSession()`. */
export async function readStaffSession(): Promise<SessionResult> {
  const result = await readAdminSession()
  if (result.kind === 'admin') return { kind: 'staff', session: toStaffSession(result.session) }
  if (result.kind === 'unavailable') return { kind: 'unavailable', code: result.code }
  if (result.kind === 'session_invalid') {
    // The console session did not validate. When a GoTrue cookie is still
    // present the visitor is authenticated but unauthorised, which is a
    // different page from "signed out" — name the account so they can tell.
    const user = await readGoTrueUser()
    if (user !== null) return { kind: 'not_staff', user }
  }
  return { kind: 'no_session' }
}

/** The account behind the GoTrue cookie, for the unauthorised page's heading. */
async function readGoTrueUser(): Promise<AuthenticatedUser | null> {
  const store = await cookies()
  const accessToken = store.get(ACCESS_COOKIE)?.value
  if (accessToken === undefined || accessToken === '') return null
  const response = await goTrue('/user', { method: 'GET', accessToken })
  if (!response.ok) return null
  const id = response.body['id']
  if (typeof id !== 'string') return null
  const email = response.body['email']
  return { id, email: typeof email === 'string' ? email : null }
}

/** @deprecated Use `requirePermission()`. */
export async function requireStaff(minimumRole: StaffRole = 'support'): Promise<StaffSession> {
  const session = await requirePermission(LEGACY_TIER_PERMISSION[minimumRole])
  return toStaffSession(session)
}

/** @deprecated Use `requirePermissionAction()`. */
export async function requireStaffAction(
  minimumRole: StaffRole = 'support',
): Promise<StaffSession> {
  const session = await requirePermissionAction(LEGACY_TIER_PERMISSION[minimumRole])
  return toStaffSession(session)
}

/** @deprecated Use `signInAdmin()`, which also rate-limits and enforces MFA. */
export interface StaffSessionTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

/**
 * @deprecated Use `signInAdmin()`.
 *
 * No caller remains: the sign-in form moved onto `signInAdmin()`, which rate
 * limits, resolves the admin and applies the MFA policy before it issues
 * anything. This turns tokens somebody else obtained into a console session,
 * which is exactly the step that must not be reachable on its own — delete it
 * with `StaffSessionTokens` once nothing imports either name.
 */
export async function establishSession(
  tokens: StaffSessionTokens,
  clock: Clock = systemClock,
): Promise<void> {
  const claims = jwtClaims(tokens.accessToken)
  if (claims.subject === null) {
    throw new AppError('unauthorized', { status: 401, detail: 'access token has no subject' })
  }
  const admin = await resolveAdmin(claims.subject)
  if (admin === null) {
    throw new AppError('forbidden', { status: 403, detail: 'account is not an active admin' })
  }
  await writeGoTrueCookies(tokens, clock)
  await issueAdminSession(admin.admin_user_id, clock)
  await stampLogin(admin, claims.assuranceLevel === AAL2, clock)
}

/** @deprecated Use `signOutAdmin()`, which also revokes the session row. */
export async function clearSession(clock: Clock = systemClock): Promise<string | null> {
  const store = await cookies()
  const token = store.get(ADMIN_SESSION_COOKIE)?.value
  if (token !== undefined && token !== '') {
    await revokeSessionRow(token, 'Yönetici oturumu kapattı', clock)
  }
  const cleared = await clearAllCookies()
  if (cleared.accessToken !== null) await revokeGoTrueSession(cleared.accessToken)
  return cleared.refreshToken
}
