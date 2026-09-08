import 'server-only'

import { isAppError } from '@da/domain'
import {
  countTable,
  countView,
  queryTable,
  queryView,
  queryViewOne,
  queryViewPage,
  type AdminInviteTableRow,
  type AdminRoleTableRow,
  type BoAdminPermissionRow,
  type BoAdminSessionRow,
  type BoAdminUserRow,
  type BoAuditRow,
  type ViewFilter,
  type ViewOrder,
  type ViewPage,
} from '@/lib/db'
import { messages } from '@/lib/messages'
import { adminMessages } from '@/lib/messages/admins'
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  ROLE_PERMISSIONS,
  isAdminPermission,
  isAdminRole,
  type AdminPermission,
  type AdminRole,
} from '@/lib/permissions'
import {
  ADMINS_PAGE_SIZE,
  INVITES_PAGE_SIZE,
  SESSIONS_LIMIT,
  TRAIL_LIMIT,
  type AdminListParams,
  type AdminSort,
} from '@/components/admins/contract'

/**
 * Every read behind the admin-management area.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE MAY ASK FOR
 * ---------------------------------------------------------------------------
 *
 * `queryView` / `countView` accept only `BoViewName`, and `queryTable` only the
 * operator-owned tables 0019 added. Two of those tables carry credential
 * columns — `admin_invites.token_hash` and `admin_sessions.token_hash` /
 * `ip_hash` — and `@/lib/db` refuses a `select *` on either: the caller has to
 * name its columns, which is what makes the omission deliberate rather than
 * lucky. Nothing below names one, and nothing below could: `assertSelectable`
 * throws on the name itself.
 *
 * The session list is read from `bo_admin_sessions`, which does not reference
 * those columns at all. A session list that leaks a token hash is a session
 * list that can be attacked offline.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Every count on screen is a `count=exact` HEAD request — a real `count(*)`
 * over an index with no row bodies crossing the wire — and every list is a
 * bounded page with the exact total beside it. There is no place in this file
 * where a table is fetched in order to measure it.
 *
 * ---------------------------------------------------------------------------
 * THE ROLE MATRIX IS READ, NOT DECLARED
 * ---------------------------------------------------------------------------
 *
 * `loadRoleMatrix()` asks the database what each role carries. It cannot reach
 * `admin_role_permissions` directly — the console's query surface does not
 * include it — so it reads `bo_admin_permissions`, the view built on top of
 * that table, through one representative active admin per role. That view has
 * no rows for a role nobody active holds, and this module says so rather than
 * substituting the TypeScript mirror: an unobservable role is reported as
 * unobservable. The mirror is loaded alongside and compared, because the
 * console's effective grant is the intersection of the two (see
 * `toPermissionSet` in `@/lib/permissions`), and a permission on only one side
 * is a real finding.
 */

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result that carries its own failure instead of throwing upward, so a
 * panel that cannot load renders an error where it stands and never falls
 * through to the empty state — "no admins" and "the query failed" are very
 * different sentences on the screen that says who may open this console.
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

/** Every audit row about an admin account names this entity type. */
export const ADMIN_ENTITY_TYPE = 'admin_user'

/** Every audit row about an invite names this one. */
export const INVITE_ENTITY_TYPE = 'admin_invite'

/**
 * The detail key that marks a re-enable.
 *
 * `AdminAuditAction` is a closed union of the 26 names 0019 seeded, and it has
 * no member for re-enabling an account — the enable/disable axis has exactly
 * one, `admin.disabled`. Rather than invent a name the database's seed does not
 * know, the re-enable writes that action with this key in its detail, and
 * `bo_audit.metadata_keys` carries the key through so a trail can label the row
 * for what it actually was. See the note in `@/lib/actions/admins`.
 */
export const REENABLED_DETAIL_KEY = 'admin_reenabled'

// ===========================================================================
// The vocabulary is the database's
//
// `bo_admin_users.role` and `bo_admin_permissions.permission` are typed by
// `@/lib/db` against the same unions `@/lib/permissions` declares. These
// aliases fail to compile the moment one side gains a member the other lacks,
// which `tsc --noEmit` checks on every CI run. They carry no runtime weight.
// ===========================================================================

/**
 * Escape the three characters PostgREST's `ilike` treats as wildcards.
 *
 * A `%` inside an address or a typed name would otherwise turn an anchored
 * prefix match into a full scan — and, for the duplicate-address confirmation
 * below, would make `a%@x.com` match rows nobody asked about. Escaped with a
 * backslash, which is Postgres's default `LIKE` escape character.
 */
function ilikeLiteral(value: string): string {
  return value.replace(/[\\%_*]/g, (character) => `\\${character}`)
}

type Covers<Narrow extends Wide, Wide> = Narrow

export type ConsoleRolesExist = Covers<AdminRole, BoAdminUserRow['role']>
export type DatabaseRolesAreLabelled = Covers<BoAdminUserRow['role'], AdminRole>
export type ConsolePermissionsExist = Covers<AdminPermission, BoAdminPermissionRow['permission']>
export type DatabasePermissionsAreLabelled = Covers<
  BoAdminPermissionRow['permission'],
  AdminPermission
>

// ===========================================================================
// The roster
// ===========================================================================

const SORT_ORDERS: Readonly<Record<AdminSort['key'], readonly ViewOrder<BoAdminUserRow>[]>> = {
  // The secondary key is always `created_at`, so the order is total: two rows
  // with the same rank cannot swap places between page one and page two.
  role_rank: [{ column: 'role_rank' }, { column: 'created_at' }],
  last_login_at: [{ column: 'last_login_at', nullsFirst: false }, { column: 'created_at' }],
  created_at: [{ column: 'created_at' }],
  action_count_30d: [{ column: 'action_count_30d' }, { column: 'created_at' }],
}

function orderFor(sort: AdminSort): readonly ViewOrder<BoAdminUserRow>[] {
  const ascending = sort.direction === 'asc'
  return SORT_ORDERS[sort.key].map((order) => ({ ...order, ascending }))
}

function listFilters(params: AdminListParams): readonly ViewFilter<BoAdminUserRow>[] {
  const filters: ViewFilter<BoAdminUserRow>[] = []

  if (params.role !== null) filters.push({ column: 'role', op: 'eq', value: params.role })
  if (params.status !== null) filters.push({ column: 'status', op: 'eq', value: params.status })
  if (params.mfa === 'var') filters.push({ column: 'is_mfa_enrolled', op: 'is', value: true })
  if (params.mfa === 'yok') filters.push({ column: 'is_mfa_enrolled', op: 'is', value: false })

  switch (params.search.kind) {
    case 'admin_id':
      filters.push({ column: 'admin_user_id', op: 'eq', value: params.search.adminUserId })
      break
    case 'domain':
      filters.push({ column: 'email_domain', op: 'eq', value: params.search.domain })
      break
    case 'name':
      // Anchored: a pattern that opens with `%` cannot use an index, and the
      // roster is read by people looking somebody up by the start of a name.
      filters.push({
        column: 'admin_name',
        op: 'ilike',
        value: `${ilikeLiteral(params.search.name)}%`,
      })
      break
    default:
      break
  }

  return filters
}

/**
 * One page of the roster, with the exact total behind it.
 *
 * A search the console refuses to run — a full address — returns an empty page
 * rather than a query: the caller renders the reason, and no address reaches
 * PostgREST or the URL the operator ends up sharing.
 */
export async function listAdmins(
  params: AdminListParams,
  sort: AdminSort,
): Promise<ViewPage<BoAdminUserRow>> {
  if (params.search.kind === 'rejected') return { rows: [], total: 0 }

  return queryViewPage('bo_admin_users', {
    filters: listFilters(params),
    order: orderFor(sort),
    limit: ADMINS_PAGE_SIZE,
    offset: (params.page - 1) * ADMINS_PAGE_SIZE,
  })
}

export interface AdminSummary {
  readonly total: number
  readonly active: number
  readonly disabled: number
  readonly invited: number
  readonly mfaMissing: number
  readonly superAdmins: number
  readonly pendingInvites: number
}

/**
 * The roster's tiles: seven counts, each computed by Postgres.
 *
 * `mfaMissing` counts only *active* accounts, because an invited account has
 * nobody to enrol yet and a disabled one cannot sign in — counting either would
 * turn a completed offboarding into a security warning.
 *
 * `pendingInvites` is the one count that comes from a table rather than a view:
 * `admin_invites` is operator-owned and holds no user content, and `countTable`
 * issues the same `count=exact` HEAD request.
 */
export async function loadAdminSummary(nowIso: string): Promise<AdminSummary> {
  const [total, active, disabled, invited, mfaMissing, superAdmins, pendingInvites] =
    await Promise.all([
      countView('bo_admin_users'),
      countView('bo_admin_users', [{ column: 'is_active', op: 'is', value: true }]),
      countView('bo_admin_users', [{ column: 'status', op: 'eq', value: 'disabled' }]),
      countView('bo_admin_users', [{ column: 'status', op: 'eq', value: 'invited' }]),
      countView('bo_admin_users', [
        { column: 'is_active', op: 'is', value: true },
        { column: 'is_mfa_enrolled', op: 'is', value: false },
      ]),
      countView('bo_admin_users', [
        { column: 'role', op: 'eq', value: 'super_admin' },
        { column: 'is_active', op: 'is', value: true },
      ]),
      countTable('admin_invites', [
        { column: 'consumed_at', op: 'is', value: null },
        { column: 'revoked_at', op: 'is', value: null },
        { column: 'expires_at', op: 'gt', value: nowIso },
      ]),
    ])

  return { total, active, disabled, invited, mfaMissing, superAdmins, pendingInvites }
}

// ===========================================================================
// One admin
// ===========================================================================

export async function loadAdmin(adminUserId: string): Promise<BoAdminUserRow | null> {
  return queryViewOne('bo_admin_users', {
    filters: [{ column: 'admin_user_id', op: 'eq', value: adminUserId }],
  })
}

/**
 * The two facts the roster view does not carry.
 *
 * `disabled_reason` is the written justification for closing the account, which
 * belongs on the page that offers to reopen it. `user_id` decides what a
 * re-enable may set the status to: `admin_users_active_needs_auth_user` refuses
 * `active` without a bound identity, so an account whose auth user was erased
 * returns to `invited` instead.
 *
 * `email` is deliberately not selected. The roster renders the masked address
 * from `bo_redact_email()`, and the one unredacted address this console shows
 * is the reader's own.
 */
export interface AdminAccountFacts {
  readonly disabledReason: string | null
  readonly hasAuthUser: boolean
}

export async function loadAdminAccountFacts(
  adminUserId: string,
): Promise<AdminAccountFacts | null> {
  const rows = await queryTable('admin_users', {
    columns: ['id', 'user_id', 'disabled_reason'],
    filters: [{ column: 'id', op: 'eq', value: adminUserId }],
    limit: 1,
  })
  const row = rows[0]
  if (row === undefined) return null
  return { disabledReason: row.disabled_reason, hasAuthUser: row.user_id !== null }
}

export interface NamedAdmin {
  readonly adminUserId: string
  readonly name: string | null
  readonly emailRedacted: string | null
  readonly roleLabel: string
  readonly isActive: boolean
}

const NO_ADMINS: ReadonlyMap<string, NamedAdmin> = new Map()

/**
 * Display names for a set of admin ids — the "davet eden" column, the inviter
 * on the detail page, the actor on a trail row.
 *
 * One `in` query for the whole page rather than one per row. A failure here is
 * caught by the caller and the column reads "Bilinmiyor", which is true, rather
 * than taking the table down with it.
 */
export async function loadNamedAdmins(
  adminUserIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, NamedAdmin>> {
  const unique = [...new Set(adminUserIds.filter((id): id is string => id !== null))]
  if (unique.length === 0) return NO_ADMINS

  const rows = await queryView('bo_admin_users', {
    columns: ['admin_user_id', 'admin_name', 'email_redacted', 'role_label', 'is_active'],
    filters: [{ column: 'admin_user_id', op: 'in', value: unique }],
    limit: unique.length,
  })

  return new Map(
    rows.map((row) => [
      row.admin_user_id,
      {
        adminUserId: row.admin_user_id,
        name: row.admin_name,
        emailRedacted: row.email_redacted,
        roleLabel: row.role_label,
        isActive: row.is_active,
      },
    ]),
  )
}

/**
 * The permissions the database actually returns for one admin.
 *
 * `bo_admin_permissions` has no rows at all for a disabled account, so an empty
 * result on this page means "no access", never "not loaded" — deny by default
 * falls out of the view rather than out of a filter someone might forget. The
 * caller distinguishes the two by the account's own status.
 */
export async function loadAdminPermissions(
  adminUserId: string,
): Promise<readonly AdminPermission[]> {
  const rows = await queryView('bo_admin_permissions', {
    columns: ['permission'],
    filters: [{ column: 'admin_user_id', op: 'eq', value: adminUserId }],
    order: { column: 'permission', ascending: true },
    limit: ADMIN_PERMISSIONS.length,
  })
  return rows.map((row) => row.permission)
}

export interface AdminSessionPage {
  readonly rows: readonly BoAdminSessionRow[]
  readonly total: number
  readonly activeCount: number
}

/**
 * This admin's sessions, newest activity first, with both totals from Postgres.
 *
 * `activeCount` is the number the "sign out everywhere" button is about, and it
 * is counted with the view's own `is_active` expression rather than by
 * filtering the fetched page — the page is capped at `SESSIONS_LIMIT`, and a
 * count taken from it would quietly under-report past that cap.
 */
export async function loadAdminSessions(adminUserId: string): Promise<AdminSessionPage> {
  const subject: ViewFilter<BoAdminSessionRow> = {
    column: 'admin_user_id',
    op: 'eq',
    value: adminUserId,
  }

  const [rows, total, activeCount] = await Promise.all([
    queryView('bo_admin_sessions', {
      filters: [subject],
      order: { column: 'last_seen_at', ascending: false },
      limit: SESSIONS_LIMIT,
    }),
    countView('bo_admin_sessions', [subject]),
    countView('bo_admin_sessions', [subject, { column: 'is_active', op: 'is', value: true }]),
  ])

  return { rows, total, activeCount }
}

/**
 * Everything the audit log holds about one admin account, newest first.
 *
 * All five operations in `@/lib/actions/admins` write their row against
 * `entity_type = 'admin_user'` and the account's own id, so "everything ever
 * done to this admin" is one indexed query rather than a union. Refused
 * attempts are here too: `runAdminAction` writes a `failure` row when a
 * permission check or a database rule refuses the operation, which is exactly
 * what the trail is for.
 */
export async function loadAdminTrail(
  adminUserId: string,
  limit: number = TRAIL_LIMIT,
): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [
      { column: 'entity_type', op: 'eq', value: ADMIN_ENTITY_TYPE },
      { column: 'entity_id', op: 'eq', value: adminUserId },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  })
}

// ===========================================================================
// Invites
// ===========================================================================

/**
 * A pending invite, without the one column that must never be read.
 *
 * `token_hash` is absent from this type and from the query. `@/lib/db` refuses
 * a `select *` on `admin_invites` precisely so that omission has to be written
 * down, and naming the column would throw rather than return it.
 */
export type PendingInvite = Omit<AdminInviteTableRow, 'token_hash'>

const INVITE_COLUMNS = [
  'id',
  'email',
  'role',
  'invited_by',
  'expires_at',
  'consumed_at',
  'consumed_by',
  'revoked_at',
  'revoked_reason',
  'revoked_by',
  'created_at',
] as const satisfies readonly (keyof AdminInviteTableRow & string)[]

export interface InvitePage {
  readonly rows: readonly PendingInvite[]
  readonly total: number
}

/**
 * Invites that are still open: never consumed, never revoked.
 *
 * An expired-but-open invite is included on purpose — it is still a row an
 * operator may want to revoke or replace, and the table says which ones have
 * lapsed rather than hiding them.
 */
export async function listPendingInvites(page: number): Promise<InvitePage> {
  const filters: readonly ViewFilter<AdminInviteTableRow>[] = [
    { column: 'consumed_at', op: 'is', value: null },
    { column: 'revoked_at', op: 'is', value: null },
  ]

  const [rows, total] = await Promise.all([
    queryTable('admin_invites', {
      columns: INVITE_COLUMNS,
      filters,
      order: { column: 'created_at', ascending: false },
      limit: INVITES_PAGE_SIZE,
      offset: (page - 1) * INVITES_PAGE_SIZE,
    }),
    countTable('admin_invites', filters),
  ])

  return { rows, total }
}

/** One open invite by id, for the action that revokes it. */
export async function loadPendingInvite(inviteId: string): Promise<PendingInvite | null> {
  const rows = await queryTable('admin_invites', {
    columns: INVITE_COLUMNS,
    filters: [{ column: 'id', op: 'eq', value: inviteId }],
    limit: 1,
  })
  return rows[0] ?? null
}

/**
 * Whether an address already has an open invite.
 *
 * Read *after* a refusal, never before one. `admin_invites_live_email_key` is a
 * partial unique index on `lower(email)`, so a second invite to the same
 * address is refused by the database; this only decides which Turkish sentence
 * the operator reads about a refusal that has already happened. Case-insensitive,
 * as the index is.
 */
export async function liveInviteFor(email: string): Promise<PendingInvite | null> {
  const rows = await queryTable('admin_invites', {
    columns: INVITE_COLUMNS,
    filters: [
      { column: 'email', op: 'ilike', value: ilikeLiteral(email) },
      { column: 'consumed_at', op: 'is', value: null },
      { column: 'revoked_at', op: 'is', value: null },
    ],
    limit: 1,
  })
  return rows[0] ?? null
}

/**
 * Whether an address already belongs to an admin, at any status.
 *
 * This one *is* a pre-check, and deliberately so: nothing in the schema stops
 * an invite being written for an address that already has an `admin_users` row,
 * because the two tables have no constraint between them. The failure would
 * surface days later, when the invite is consumed and
 * `admin_users_email_lower_key` refuses the second account — by which time the
 * operator who sent it has moved on. Racing it costs nothing: the worst case is
 * an invite that cannot be consumed, which is the situation without the check.
 */
export async function adminExistsFor(email: string): Promise<boolean> {
  const count = await countTable('admin_users', [
    { column: 'email', op: 'ilike', value: ilikeLiteral(email) },
  ])
  return count > 0
}

// ===========================================================================
// Roles and the permission matrix
// ===========================================================================

export interface RoleRow {
  readonly role: AdminRole
  readonly rank: number
  readonly labelTr: string
  readonly descriptionTr: string
  readonly isAssignable: boolean
}

/** Every role the database declares, in display order. */
export async function loadRoles(): Promise<readonly RoleRow[]> {
  const rows = await queryTable('admin_roles', {
    columns: ['role', 'rank', 'label_tr', 'description_tr', 'is_assignable'],
    order: { column: 'rank', ascending: true },
    limit: ADMIN_ROLES.length,
  })
  return rows
    .filter((row: AdminRoleTableRow) => isAdminRole(row.role))
    .map((row) => ({
      role: row.role,
      rank: row.rank,
      labelTr: row.label_tr,
      descriptionTr: row.description_tr,
      isAssignable: row.is_assignable,
    }))
}

/** The roles a picker may offer. `is_assignable` retires a role without touching its holders. */
export async function loadAssignableRoles(): Promise<readonly RoleRow[]> {
  const rows = await loadRoles()
  return rows.filter((row) => row.isAssignable)
}

export interface RoleMatrixEntry {
  readonly role: RoleRow
  /** How many admin rows carry this role, at any status. */
  readonly holders: number
  /** How many of those may currently sign in. */
  readonly activeHolders: number
  /**
   * `admin_role_permissions` rows for this role, counted by the view's own
   * lateral join. Available whenever any admin holds the role, even a disabled
   * one — which is how a role's size is known even when its permissions cannot
   * be listed.
   */
  readonly declaredCount: number | null
  /**
   * True when the permission names could actually be read. False means no
   * active admin holds the role, so `bo_admin_permissions` returns nothing for
   * it — reported, never guessed.
   */
  readonly observable: boolean
  /** What the database returned. Empty when `observable` is false. */
  readonly database: ReadonlySet<AdminPermission>
  /** What the console's reviewed mirror accepts, for the intersection check. */
  readonly console: ReadonlySet<AdminPermission>
}

export interface RoleMatrix {
  readonly entries: readonly RoleMatrixEntry[]
  /** (role, permission) pairs the two sides disagree about, among observable roles. */
  readonly driftCount: number
  readonly observableCount: number
  readonly assignableCount: number
}

/**
 * The role → permission matrix, read from the database.
 *
 * The console's query surface does not include `admin_role_permissions`
 * itself — `@/lib/db` exposes the `bo_*` views and the operator-owned tables,
 * and that table is neither. What it does expose is `bo_admin_permissions`,
 * which is `admin_users ⋈ admin_role_permissions` restricted to active
 * accounts. So the matrix is read the only way the surface allows: pick one
 * active admin per role, ask the view what that admin holds, and report the
 * roles where no such admin exists as unobservable rather than filling the gap
 * from a TypeScript constant.
 *
 * Cost is bounded and small: one page of roles, one representative lookup per
 * role, and at most 36 permission rows per representative — seven roles, so at
 * most 21 index seeks, none of which returns a row body larger than a token.
 *
 * The mirror in `@/lib/permissions` is loaded beside it and compared, because
 * the console grants the *intersection* of the two (`toPermissionSet` drops a
 * database row the mirror does not carry). A cell present on one side only is
 * therefore not an effective permission, and it is surfaced as a finding.
 */
export async function loadRoleMatrix(): Promise<RoleMatrix> {
  const roles = await loadRoles()

  const entries = await Promise.all(
    roles.map(async (role): Promise<RoleMatrixEntry> => {
      const roleFilter: ViewFilter<BoAdminUserRow> = {
        column: 'role',
        op: 'eq',
        value: role.role,
      }

      const [holders, activeHolders, representative] = await Promise.all([
        countView('bo_admin_users', [roleFilter]),
        countView('bo_admin_users', [roleFilter, { column: 'is_active', op: 'is', value: true }]),
        queryViewOne('bo_admin_users', {
          columns: ['admin_user_id', 'permission_count'],
          filters: [roleFilter, { column: 'is_active', op: 'is', value: true }],
          order: { column: 'created_at', ascending: true },
        }),
      ])

      // A role with no active holder still has a size, as long as some admin
      // row carries it: `permission_count` is joined from the role, not from
      // the account, so a disabled holder answers the question too.
      const sizeRow =
        representative ??
        (holders > 0
          ? await queryViewOne('bo_admin_users', {
              columns: ['admin_user_id', 'permission_count'],
              filters: [roleFilter],
              order: { column: 'created_at', ascending: true },
            })
          : null)

      const database =
        representative === null
          ? new Set<AdminPermission>()
          : new Set(await loadAdminPermissions(representative.admin_user_id))

      return {
        role,
        holders,
        activeHolders,
        declaredCount: sizeRow === null ? null : sizeRow.permission_count,
        observable: representative !== null,
        database,
        console: new Set(ROLE_PERMISSIONS[role.role]),
      }
    }),
  )

  let driftCount = 0
  for (const entry of entries) {
    if (!entry.observable) continue
    for (const permission of ADMIN_PERMISSIONS) {
      const inDatabase = entry.database.has(permission)
      const inConsole = entry.console.has(permission)
      if (inDatabase !== inConsole) driftCount += 1
    }
  }

  return {
    entries,
    driftCount,
    observableCount: entries.filter((entry) => entry.observable).length,
    assignableCount: entries.filter((entry) => entry.role.isAssignable).length,
  }
}

/**
 * The permission rows the matrix renders, grouped by namespace.
 *
 * The order and the grouping come from `ADMIN_PERMISSIONS`, which mirrors the
 * `admin_permission` enum's declaration order — the labels have to come from
 * somewhere, and this is the reviewed list `PERMISSION_LABELS_TR` is keyed by.
 * Every ✓ in the table is still a row the database returned; this decides only
 * which lines exist and in what order.
 *
 * A permission a role holds that is somehow absent from the list would be
 * invisible, so it is appended rather than dropped — `isAdminPermission` is the
 * same narrowing `toPermissionSet` applies.
 */
export function matrixPermissionRows(
  matrix: RoleMatrix,
): readonly { namespace: string; permissions: readonly AdminPermission[] }[] {
  const seen = new Set<AdminPermission>(ADMIN_PERMISSIONS)
  const extra: AdminPermission[] = []
  for (const entry of matrix.entries) {
    for (const permission of entry.database) {
      if (!seen.has(permission) && isAdminPermission(permission)) {
        seen.add(permission)
        extra.push(permission)
      }
    }
  }

  const groups = new Map<string, AdminPermission[]>()
  for (const permission of [...ADMIN_PERMISSIONS, ...extra]) {
    const dot = permission.indexOf('.')
    const namespace = dot === -1 ? permission : permission.slice(0, dot)
    const bucket = groups.get(namespace)
    if (bucket === undefined) groups.set(namespace, [permission])
    else bucket.push(permission)
  }

  return [...groups.entries()].map(([namespace, permissions]) => ({ namespace, permissions }))
}

/** The Turkish sentence describing why a role could not be read. */
export function unobservableReason(entry: RoleMatrixEntry): string {
  if (entry.declaredCount === null) return adminMessages.roles.unobservableNoAdmin
  return adminMessages.roles.unobservableCount(entry.declaredCount)
}
