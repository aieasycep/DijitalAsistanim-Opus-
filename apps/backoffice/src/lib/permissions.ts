/**
 * The authorization vocabulary of the backoffice, and the pure decision
 * functions built on it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE HAS NO IMPORTS
 * ---------------------------------------------------------------------------
 *
 * Authorization is the one part of a console that must be provable. This module
 * is therefore pure: no database client, no cookies, no `server-only`, no
 * clock, no I/O of any kind. Every function is a total function of its
 * arguments, which is what lets `__tests__/permissions.test.ts` enumerate the
 * whole matrix role by role instead of asserting on a handful of examples.
 *
 * The impure half — reading the session cookie, validating it server-side,
 * loading the caller's effective permissions — lives in `auth.ts` and calls
 * `decideAccess()` here to reach its verdict. Splitting it that way means the
 * verdict is testable even though the session is not.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS AUTHORITATIVE, AND WHAT IS A MIRROR
 * ---------------------------------------------------------------------------
 *
 * `public.admin_role_permissions` in migration 0019 is the authority. It is
 * rewritten in full on every migration run, and `admin_permissions_for()` reads
 * it with `security definer`, so what an admin may actually do is decided in
 * Postgres, not here.
 *
 * `ROLE_PERMISSIONS` below is a *mirror* of that table, and it exists for three
 * reasons that are not "a second source of truth":
 *
 *   1. Rendering. A sidebar that offers a page the server will refuse is a dead
 *      control. The mirror answers "should this entry exist" without a query.
 *   2. Defence in depth. `decideAccess()` intersects the permissions loaded
 *      from the database with the mirror, so a row hand-inserted into
 *      `admin_role_permissions` outside a migration grants nothing until the
 *      matrix here is changed and reviewed too.
 *   3. Review. A reviewer can read the whole authorization model in one screen.
 *
 * Drift is impossible rather than unlikely: `__tests__/permission-matrix.test.ts`
 * parses `supabase/migrations/0019_admin_platform.sql` and fails the build if
 * the table and this file disagree by a single row.
 */

// ===========================================================================
// 1. Roles
// ===========================================================================

/**
 * The seven backoffice roles, in the order the `admin_role` Postgres enum
 * declares them.
 *
 * Deliberately NOT a hierarchy. `finance` is not a superset of `support`, and
 * `ai_ops` is not "more" than `operations`. Nothing in this file compares two
 * roles to decide anything; every decision goes through the permission set.
 */
export const ADMIN_ROLES = [
  'super_admin',
  'operations',
  'support',
  'finance',
  'ai_ops',
  'analyst',
  'readonly',
] as const

export type AdminRole = (typeof ADMIN_ROLES)[number]

export const ADMIN_STATUSES = ['invited', 'active', 'disabled'] as const
export type AdminStatus = (typeof ADMIN_STATUSES)[number]

/**
 * Display order for pickers and rosters, mirroring `admin_roles.rank`.
 *
 * This is the only ranking that exists, and it orders a `<select>`. It is never
 * an authorization comparison — see the comment on `ADMIN_ROLES`.
 */
export const ROLE_DISPLAY_RANK: Readonly<Record<AdminRole, number>> = Object.freeze({
  readonly: 10,
  analyst: 20,
  support: 30,
  finance: 40,
  ai_ops: 50,
  operations: 60,
  super_admin: 100,
})

/** Turkish labels, mirroring `admin_roles.label_tr`. */
export const ROLE_LABELS_TR: Readonly<Record<AdminRole, string>> = Object.freeze({
  super_admin: 'Süper Yönetici',
  operations: 'Operasyon',
  support: 'Destek',
  finance: 'Finans',
  ai_ops: 'Yapay Zekâ Operasyonları',
  analyst: 'Analist',
  readonly: 'Salt Okunur',
})

/** One sentence per role, for the roster and the role-change confirmation. */
export const ROLE_DESCRIPTIONS_TR: Readonly<Record<AdminRole, string>> = Object.freeze({
  super_admin: 'Tam yetki. Yönetici davet eder, rol değiştirir, hesap kapatır.',
  operations: 'Platform sağlığı, entegrasyon, bayrak ve duyuru yönetimi.',
  support: 'Talepleri yönetir, senkronizasyon tetikler, Destek Erişimi talep eder.',
  finance: 'Abonelik, iade ve mutabakat; geçici Pro tanımlar.',
  ai_ops: 'Prompt sürümleri, model ayarları ve kalite izleme.',
  analyst: 'Yalnızca toplulaştırılmış metrikler. Kişisel veri görmez.',
  readonly: 'Yalnızca görüntüleme. Hiçbir işlem yapamaz.',
})

// ===========================================================================
// 2. Permissions
// ===========================================================================

/**
 * The 36 members of the `admin_permission` Postgres enum, in declaration order.
 *
 * Every server-side route guard names one of these. A screen with no permission
 * behind it is a screen nobody may open — `requirePermission()` has no "public"
 * mode and no default.
 */
export const ADMIN_PERMISSIONS = [
  'users.read',
  'users.export',
  'users.disable',
  'users.delete',
  'support.ticket.read',
  'support.ticket.write',
  'support.ticket.assign',
  'support.access.request',
  'support.access.approve',
  'support.access.reveal',
  'integration.read',
  'integration.resync',
  'integration.disconnect',
  'billing.read',
  'billing.grant',
  'billing.revoke',
  'flags.read',
  'flags.write',
  'announcement.read',
  'announcement.write',
  'prompt.read',
  'prompt.write',
  'prompt.activate',
  'ai.read',
  'ai.configure',
  'analytics.read',
  'audit.read',
  'audit.export',
  'privacy.read',
  'privacy.process',
  'admin.read',
  'admin.invite',
  'admin.role.write',
  'admin.disable',
  'system.health.read',
  'system.config.read',
] as const

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]

/** Turkish label per permission, for the roster and the forbidden page. */
export const PERMISSION_LABELS_TR: Readonly<Record<AdminPermission, string>> = Object.freeze({
  'users.read': 'Kullanıcı kayıtlarını görüntüleme',
  'users.export': 'Kullanıcı verisi dışa aktarma',
  'users.disable': 'Kullanıcı hesabı askıya alma',
  'users.delete': 'Kullanıcı hesabı silme',
  'support.ticket.read': 'Destek taleplerini görüntüleme',
  'support.ticket.write': 'Destek talebi yazma ve güncelleme',
  'support.ticket.assign': 'Destek talebi atama',
  'support.access.request': 'Destek Erişimi talep etme',
  'support.access.approve': 'Destek Erişimi onaylama',
  'support.access.reveal': 'Destek Erişimi ile içerik görüntüleme',
  'integration.read': 'Entegrasyon durumunu görüntüleme',
  'integration.resync': 'Yeniden senkronizasyon tetikleme',
  'integration.disconnect': 'Entegrasyon bağlantısını kesme',
  'billing.read': 'Abonelik ve gelir kayıtlarını görüntüleme',
  'billing.grant': 'Geçici Pro tanımlama',
  'billing.revoke': 'Geçici Pro geri alma',
  'flags.read': 'Özellik bayraklarını görüntüleme',
  'flags.write': 'Özellik bayraklarını değiştirme',
  'announcement.read': 'Duyuruları görüntüleme',
  'announcement.write': 'Duyuru yazma ve yayınlama',
  'prompt.read': 'Prompt sürümlerini görüntüleme',
  'prompt.write': 'Prompt sürümü yazma',
  'prompt.activate': 'Prompt sürümü etkinleştirme',
  'ai.read': 'Yapay zekâ kullanımını görüntüleme',
  'ai.configure': 'Yapay zekâ model ayarlarını değiştirme',
  'analytics.read': 'Analitik raporları görüntüleme',
  'audit.read': 'Denetim kaydını görüntüleme',
  'audit.export': 'Denetim kaydını dışa aktarma',
  'privacy.read': 'Gizlilik taleplerini görüntüleme',
  'privacy.process': 'Gizlilik taleplerini işleme',
  'admin.read': 'Yönetici listesini görüntüleme',
  'admin.invite': 'Yönetici davet etme',
  'admin.role.write': 'Yönetici rolü değiştirme',
  'admin.disable': 'Yönetici hesabı kapatma',
  'system.health.read': 'Sistem sağlığını görüntüleme',
  'system.config.read': 'Sistem yapılandırmasını görüntüleme',
})

// ===========================================================================
// 3. The matrix
// ===========================================================================

const OPERATIONS_PERMISSIONS = [
  'users.read',
  'users.disable',
  'support.ticket.read',
  'support.ticket.write',
  'support.ticket.assign',
  'support.access.request',
  'support.access.approve',
  'integration.read',
  'integration.resync',
  'integration.disconnect',
  'billing.read',
  'flags.read',
  'flags.write',
  'announcement.read',
  'announcement.write',
  'prompt.read',
  'ai.read',
  'analytics.read',
  'audit.read',
  'privacy.read',
  'privacy.process',
  'admin.read',
  'system.health.read',
  'system.config.read',
] as const satisfies readonly AdminPermission[]

/**
 * Support may REQUEST a reveal and may PERFORM one, but holds no
 * `support.access.approve`: the four-eyes rule in 0019 is a database
 * constraint, and the missing permission here is its counterpart in the UI.
 */
const SUPPORT_PERMISSIONS = [
  'users.read',
  'support.ticket.read',
  'support.ticket.write',
  'support.ticket.assign',
  'support.access.request',
  'support.access.reveal',
  'integration.read',
  'integration.resync',
  'billing.read',
  'flags.read',
  'announcement.read',
  'privacy.read',
  'audit.read',
  'system.health.read',
] as const satisfies readonly AdminPermission[]

const FINANCE_PERMISSIONS = [
  'users.read',
  'billing.read',
  'billing.grant',
  'billing.revoke',
  'support.ticket.read',
  'analytics.read',
  'audit.read',
  'audit.export',
  'system.health.read',
] as const satisfies readonly AdminPermission[]

const AI_OPS_PERMISSIONS = [
  'users.read',
  'prompt.read',
  'prompt.write',
  'prompt.activate',
  'ai.read',
  'ai.configure',
  'analytics.read',
  'flags.read',
  'flags.write',
  'audit.read',
  'system.health.read',
] as const satisfies readonly AdminPermission[]

const ANALYST_PERMISSIONS = [
  'users.read',
  'analytics.read',
  'ai.read',
  'prompt.read',
  'billing.read',
  'support.ticket.read',
  'audit.read',
  'audit.export',
  'system.health.read',
] as const satisfies readonly AdminPermission[]

const READONLY_PERMISSIONS = [
  'users.read',
  'support.ticket.read',
  'flags.read',
  'announcement.read',
  'system.health.read',
] as const satisfies readonly AdminPermission[]

/**
 * The permission matrix, mirroring `public.admin_role_permissions`.
 *
 * `super_admin` is spread from `ADMIN_PERMISSIONS` rather than listed, exactly
 * as 0019 populates it from `enum_range(null::admin_permission)`: a permission
 * added later is held by super_admin in both places without an edit, so the two
 * cannot drift apart at the moment of widening.
 */
export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly AdminPermission[]>> =
  Object.freeze({
    super_admin: ADMIN_PERMISSIONS,
    operations: OPERATIONS_PERMISSIONS,
    support: SUPPORT_PERMISSIONS,
    finance: FINANCE_PERMISSIONS,
    ai_ops: AI_OPS_PERMISSIONS,
    analyst: ANALYST_PERMISSIONS,
    readonly: READONLY_PERMISSIONS,
  })

function freezeSet(permissions: readonly AdminPermission[]): ReadonlySet<AdminPermission> {
  return Object.freeze(new Set(permissions))
}

const ROLE_PERMISSION_SETS: Readonly<Record<AdminRole, ReadonlySet<AdminPermission>>> =
  Object.freeze({
    super_admin: freezeSet(ROLE_PERMISSIONS.super_admin),
    operations: freezeSet(ROLE_PERMISSIONS.operations),
    support: freezeSet(ROLE_PERMISSIONS.support),
    finance: freezeSet(ROLE_PERMISSIONS.finance),
    ai_ops: freezeSet(ROLE_PERMISSIONS.ai_ops),
    analyst: freezeSet(ROLE_PERMISSIONS.analyst),
    readonly: freezeSet(ROLE_PERMISSIONS.readonly),
  })

const ADMIN_PERMISSION_SET: ReadonlySet<string> = Object.freeze(new Set<string>(ADMIN_PERMISSIONS))
const ADMIN_ROLE_SET: ReadonlySet<string> = Object.freeze(new Set<string>(ADMIN_ROLES))
const ADMIN_STATUS_SET: ReadonlySet<string> = Object.freeze(new Set<string>(ADMIN_STATUSES))

// ===========================================================================
// 4. Narrowing
//
// Everything that arrives from the database, a query string or a form is
// `unknown` until one of these says otherwise. An unrecognised value is never
// coerced to a default — it is dropped, which is what deny-by-default means at
// the parsing layer.
// ===========================================================================

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && ADMIN_ROLE_SET.has(value)
}

export function isAdminStatus(value: unknown): value is AdminStatus {
  return typeof value === 'string' && ADMIN_STATUS_SET.has(value)
}

export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === 'string' && ADMIN_PERMISSION_SET.has(value)
}

/** The permissions a role carries, as a frozen set. */
export function permissionsForRole(role: AdminRole): ReadonlySet<AdminPermission> {
  return ROLE_PERMISSION_SETS[role]
}

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSION_SETS[role].has(permission)
}

/**
 * Turn whatever `admin_permissions_for()` returned into a permission set.
 *
 * Two filters, both deliberate:
 *   - a value that is not a member of `admin_permission` is discarded, so a
 *     malformed row cannot widen anything;
 *   - the result is intersected with the role's own matrix entry, so a row
 *     inserted into `admin_role_permissions` by hand — outside a reviewed
 *     migration — grants nothing until this file agrees.
 *
 * An unknown or disabled role yields the empty set. There is no branch in which
 * this function returns a default set of permissions.
 */
export function toPermissionSet(
  values: Iterable<unknown>,
  role?: AdminRole,
): ReadonlySet<AdminPermission> {
  const allowed = role === undefined ? null : ROLE_PERMISSION_SETS[role]
  const result = new Set<AdminPermission>()
  for (const value of values) {
    if (!isAdminPermission(value)) continue
    if (allowed !== null && !allowed.has(value)) continue
    result.add(value)
  }
  return Object.freeze(result)
}

/** The empty set, shared. Returned wherever the answer is "nothing at all". */
export const NO_PERMISSIONS: ReadonlySet<AdminPermission> = Object.freeze(
  new Set<AdminPermission>(),
)

// ===========================================================================
// 5. Requirements
//
// A guard states what it needs, not what a role is. `anyOf` covers a page two
// different roles reach for different reasons (the user detail page: support
// reads it to answer a ticket, finance reads it to check a subscription);
// `allOf` covers an action that genuinely needs two capabilities at once.
// ===========================================================================

export type PermissionRequirement =
  | AdminPermission
  | { readonly anyOf: readonly AdminPermission[] }
  | { readonly allOf: readonly AdminPermission[] }

/** Every permission named by a requirement, for messages and for logging. */
export function requirementPermissions(
  requirement: PermissionRequirement,
): readonly AdminPermission[] {
  if (typeof requirement === 'string') return [requirement]
  if ('anyOf' in requirement) return requirement.anyOf
  return requirement.allOf
}

/**
 * Does this permission set satisfy this requirement?
 *
 * An empty `anyOf` or `allOf` is unsatisfiable rather than trivially true: an
 * empty list is a caller bug, and the safe reading of a bug in an authorization
 * check is "no".
 */
export function satisfiesRequirement(
  granted: ReadonlySet<AdminPermission>,
  requirement: PermissionRequirement,
): boolean {
  if (typeof requirement === 'string') return granted.has(requirement)
  if ('anyOf' in requirement) {
    if (requirement.anyOf.length === 0) return false
    return requirement.anyOf.some((permission) => granted.has(permission))
  }
  if (requirement.allOf.length === 0) return false
  return requirement.allOf.every((permission) => granted.has(permission))
}

/** Turkish sentence naming what the caller was missing, for the 403 page. */
export function describeRequirement(requirement: PermissionRequirement): string {
  const labels = requirementPermissions(requirement).map(
    (permission) => PERMISSION_LABELS_TR[permission],
  )
  if (labels.length === 0) return 'Tanımsız yetki'
  if (labels.length === 1) return labels[0] ?? 'Tanımsız yetki'
  const joiner = typeof requirement === 'string' || 'anyOf' in requirement ? ' veya ' : ' ve '
  return labels.join(joiner)
}

// ===========================================================================
// 6. The verdict
//
// `auth.ts` loads a session and calls this. Keeping the decision here — pure,
// exhaustive, with a named reason for every refusal — is what makes it
// possible to test the guard rather than the pages that happen to use it.
// ===========================================================================

/** What a caller looks like once the session has been resolved, or has not. */
export interface AccessSubject {
  readonly status: AdminStatus
  readonly role: AdminRole
  readonly permissions: ReadonlySet<AdminPermission>
  /**
   * Whether the session survived server-side validation: unexpired, unrevoked,
   * and belonging to an admin who is still active. `auth.ts` gets this from
   * `admin_touch_session()`, which returns no rows when any of those fail.
   */
  readonly sessionLive: boolean
  /**
   * Whether the authentication behind this session meets the MFA policy. False
   * when an enrolled admin presented only a first factor.
   */
  readonly assuranceMet: boolean
}

export type AccessDenialReason =
  | 'no_session'
  | 'session_expired'
  | 'not_admin'
  | 'admin_disabled'
  | 'mfa_required'
  | 'permission_denied'

export type AccessDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: AccessDenialReason }

/**
 * The single place a "may they?" question is answered.
 *
 * Order matters and is checked in this sequence deliberately: a disabled admin
 * is told they are disabled rather than that they lack a permission, and an
 * expired session is told to sign in rather than shown a 403 it cannot fix.
 *
 * `subject === null` means no session was presented at all. There is no code
 * path through this function that returns `allowed: true` without a live
 * session, an active status, a satisfied assurance level, and a permission that
 * the subject actually holds.
 */
export function decideAccess(
  subject: AccessSubject | null,
  requirement: PermissionRequirement,
): AccessDecision {
  if (subject === null) return { allowed: false, reason: 'no_session' }
  if (!subject.sessionLive) return { allowed: false, reason: 'session_expired' }
  if (subject.status === 'disabled') return { allowed: false, reason: 'admin_disabled' }
  if (subject.status !== 'active') return { allowed: false, reason: 'not_admin' }
  if (!subject.assuranceMet) return { allowed: false, reason: 'mfa_required' }
  if (!satisfiesRequirement(subject.permissions, requirement)) {
    return { allowed: false, reason: 'permission_denied' }
  }
  return { allowed: true }
}

/** Turkish explanation per denial reason, rendered by the 403 page. */
export const DENIAL_MESSAGES_TR: Readonly<Record<AccessDenialReason, string>> = Object.freeze({
  no_session: 'Oturum bulunamadı. Lütfen tekrar giriş yapın.',
  session_expired: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.',
  not_admin: 'Bu hesabın yönetim konsolunda yetkisi yok.',
  admin_disabled: 'Yönetici hesabınız kapatılmış.',
  mfa_required: 'İki adımlı doğrulama tamamlanmadan bu konsola erişilemez.',
  permission_denied: 'Bu sayfa için gereken yetkiye sahip değilsiniz.',
})

/**
 * Whether a string is a denial reason this console knows.
 *
 * The reason travels to the 403 page as a query parameter, which means it
 * arrives as an arbitrary string that anybody can type. Validated against the
 * message table rather than a second hand-written list, so a reason added to
 * the union without a sentence cannot reach the page unlabelled.
 */
export function isAccessDenialReason(value: string): value is AccessDenialReason {
  return Object.prototype.hasOwnProperty.call(DENIAL_MESSAGES_TR, value)
}

/**
 * Denials the operator can fix by signing in again, as opposed to ones that
 * need somebody else to change something. `auth.ts` routes the first group to
 * the sign-in page and the second to the 403 page.
 */
export function isRecoverableBySigningIn(reason: AccessDenialReason): boolean {
  return reason === 'no_session' || reason === 'session_expired' || reason === 'mfa_required'
}

// ===========================================================================
// 7. Accountability
//
// The other half of the model: not what an operator may do, but what the trail
// must say once they have done it. It lives here rather than in `audit.ts` for
// the same reason the matrix does — it is a closed vocabulary mirroring the
// database, and it has to be testable without a request context. `audit.ts`
// re-exports every name below, so callers import it from the module that
// writes the rows.
// ===========================================================================

/**
 * The 26 actions seeded into `admin_sensitive_actions` by 0019.
 *
 * Using a name from this list is what makes an action auditable; using one
 * outside it in the `admin.` or `support_access.` namespace is *also* audited,
 * because the trigger treats the namespace as sensitive whether or not anybody
 * remembered to seed the row. A console page added next month is therefore
 * accountable from its first insert.
 */
export const ADMIN_AUDIT_ACTIONS = [
  'admin.signed_in',
  'admin.signed_out',
  'admin.invited',
  'admin.invite_revoked',
  'admin.role_changed',
  'admin.disabled',
  'admin.sessions_revoked',
  'user.disabled',
  'user.deleted',
  'integration.disconnected',
  'integration.force_resync',
  'entitlement.granted',
  'entitlement.revoked',
  'feature_flag.changed',
  'feature_flag.override_set',
  'feature_flag.override_removed',
  'announcement.published',
  'prompt.activated',
  'ai.model_changed',
  'deletion.retried',
  'privacy.export_reissued',
  'support_access.requested',
  'support_access.approved',
  'support_access.denied',
  'support_access.revoked',
  'support_access.revealed',
] as const

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]

/**
 * The two actions that are a fact rather than a decision. Signing in has no
 * justification to type; everything else on the list does.
 */
export const AUDIT_ACTIONS_WITHOUT_REASON: ReadonlySet<string> = Object.freeze(
  new Set<string>(['admin.signed_in', 'admin.signed_out']),
)

const SENSITIVE_ACTIONS: ReadonlySet<string> = Object.freeze(new Set<string>(ADMIN_AUDIT_ACTIONS))

/**
 * Mirrors `audit_logs_enforce_accountability()`: an action is sensitive if it
 * is on the list, or if it lives in the `admin.` / `support_access.` namespace.
 *
 * Product events written by edge functions — `sync.*`, `approval.*`,
 * `privacy.*` — are outside both namespaces and are not sensitive, which is why
 * they keep working without an admin actor.
 */
export function isSensitiveAction(action: string): boolean {
  return (
    SENSITIVE_ACTIONS.has(action) ||
    action.startsWith('admin.') ||
    action.startsWith('support_access.')
  )
}

/** Does this action need a written reason before it may be recorded? */
export function auditActionRequiresReason(action: string): boolean {
  if (AUDIT_ACTIONS_WITHOUT_REASON.has(action)) return false
  return isSensitiveAction(action)
}

/** Reasons are typed by a person; keep them a sentence, not an essay. */
export const MAX_REASON_LENGTH = 280
/** Matches the `length(btrim(...)) >= 3` floor the database applies. */
export const MIN_REASON_LENGTH = 3

export function isValidReason(reason: string): boolean {
  const trimmed = reason.trim()
  return trimmed.length >= MIN_REASON_LENGTH && trimmed.length <= MAX_REASON_LENGTH
}

/** Dotted lower-snake, matching `admin_sensitive_actions_shape`. */
const ACTION_SHAPE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/

export function isAuditActionShape(action: string): boolean {
  return ACTION_SHAPE.test(action)
}
