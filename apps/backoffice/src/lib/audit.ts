import 'server-only'

import { AppError } from '@da/domain'
import { adminRpc, type JsonScalar } from './auth.ts'
import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  auditActionRequiresReason,
  isAuditActionShape,
  isValidReason,
  type AdminAuditAction,
} from './permissions.ts'
import { safeIdentifier } from './redact.ts'

/**
 * The admin audit trail.
 *
 * ---------------------------------------------------------------------------
 * WHY THE REASON IS AN ARGUMENT AND NOT AN OPTION
 * ---------------------------------------------------------------------------
 *
 * Every destructive or outward-facing action an operator takes writes one row
 * naming who did it, what they did, to whom, and why. `reason` is a required
 * argument for a destructive action rather than an optional field: an action
 * nobody can justify in writing is an action that should not have a button.
 *
 * The rule is not enforced here. It is enforced by
 * `audit_logs_enforce_accountability()` in migration 0019, a `before insert`
 * trigger that refuses any action listed in `admin_sensitive_actions` — or any
 * action in the `admin.` / `support_access.` namespaces at all — unless the row
 * names an acting admin and, where the action is destructive, carries a written
 * reason. This module fails fast with a Turkish-facing error so an operator
 * sees a form validation rather than a 500, but removing the check here would
 * not make the write succeed.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ACTOR AND THE REASON ARE COLUMNS
 * ---------------------------------------------------------------------------
 *
 * `cleanup_expired_retention()` blanks `audit_logs.metadata` after 400 days.
 * The first pass of the console kept the acting staff member and their
 * justification *inside* that document, so accountability erased itself on a
 * schedule. 0019 promoted both to real columns — `actor_admin_user_id`,
 * `actor_role`, `reason` — which are out of the sweep's reach because they are
 * facts about staff, not about a data subject. `admin_write_audit()` is the one
 * call site that fills them, and it is the only writer this module uses.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAY GO IN `detail`
 * ---------------------------------------------------------------------------
 *
 * Scalars only, by type. There is no jsonb blob and no nested object, so a
 * careless caller cannot smuggle a subject line or a message body into the
 * trail. String values additionally pass through `safeIdentifier()`, the same
 * shape guard `bo_identifier()` applies in the database: anything containing
 * whitespace or `@` collapses to `unstructured`. The one exception is `reason`,
 * which is staff-authored prose about a staff action and is stored in its own
 * column precisely so it is never confused with user content.
 */

// ===========================================================================
// 1. The vocabulary
//
// Defined in `permissions.ts` — pure data and pure predicates, mirroring
// `admin_sensitive_actions` and the accountability trigger — and re-exported
// here so a caller imports it from the module that writes the rows.
// `__tests__/permission-matrix.test.ts` compares both lists against the
// migration on every run, so they cannot drift apart.
// ===========================================================================

export {
  ADMIN_AUDIT_ACTIONS,
  AUDIT_ACTIONS_WITHOUT_REASON,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  auditActionRequiresReason,
  isSensitiveAction,
  isValidReason,
  type AdminAuditAction,
} from './permissions.ts'

/** The Turkish message a form shows when the reason field is not acceptable. */
export const REASON_HELP_TR = `Gerekçe en az ${MIN_REASON_LENGTH}, en fazla ${MAX_REASON_LENGTH} karakter olmalıdır.`

// ===========================================================================
// 2. Writing a row
// ===========================================================================

export type AuditDetail = Record<string, JsonScalar>

export interface AdminActor {
  /** `admin_users.id` — the authorization identity, not the GoTrue user id. */
  readonly adminUserId: string
}

export interface WriteAuditInput {
  readonly actor: AdminActor
  /** A dotted lower-snake token from `ADMIN_AUDIT_ACTIONS`, or a product event. */
  readonly action: AdminAuditAction | (string & {})
  /** The user the action was about, when there is one. */
  readonly subjectUserId?: string | null
  /** The kind of thing acted on: `connected_account`, `feature_flag`. */
  readonly entityType?: string | null
  /** Its id. Never an address, never a subject line — the shape guard refuses. */
  readonly entityId?: string | null
  /** Why. Required for every sensitive action except signing in and out. */
  readonly reason?: string | null
  /** `success` or a failure token. Defaults to `success`. */
  readonly outcome?: string
  /** Set on a `support_access.*` row so the reveal joins to its grant. */
  readonly supportAccessGrantId?: string | null
  /** Extra identifiers and codes. Scalars only, by type. */
  readonly detail?: AuditDetail
}

/**
 * Reserved keys `admin_write_audit()` writes itself. A caller's `detail` cannot
 * overwrite them, so an audit row can never disown its actor.
 */
const RESERVED_DETAIL_KEYS: ReadonlySet<string> = Object.freeze(
  new Set(['actor', 'admin_user_id', 'admin_role', 'outcome', 'reason']),
)

function sanitiseDetail(detail: AuditDetail | undefined): AuditDetail {
  const out: AuditDetail = {}
  for (const [key, value] of Object.entries(detail ?? {})) {
    if (RESERVED_DETAIL_KEYS.has(key)) continue
    // The same guard `bo_identifier()` applies on the way out of the database,
    // applied here on the way in: a value that is not token-shaped is recorded
    // as `unstructured` rather than stored verbatim.
    out[key] = typeof value === 'string' ? safeIdentifier(value) : value
  }
  return out
}

/**
 * Append one row to `audit_logs` through `admin_write_audit()`.
 *
 * Throws if the write fails: an action whose audit row did not land must not
 * report success, because the trail is the only evidence the action happened.
 * Call this in the same failure path as the effect itself.
 *
 * Returns the new row's id, so a caller that also updates a record can point at
 * the audit entry that explains it.
 */
export async function writeAudit(input: WriteAuditInput): Promise<string> {
  const action = input.action.trim()
  if (!isAuditActionShape(action)) {
    throw new AppError('validation_failed', {
      status: 422,
      detail: `audit action "${action}" is not a dotted lower-snake token`,
    })
  }

  const reason = input.reason?.trim() ?? ''
  if (auditActionRequiresReason(action) && !isValidReason(reason)) {
    throw new AppError('validation_failed', {
      status: 422,
      detail: `audit action "${action}" requires a written reason`,
    })
  }

  return adminRpc('admin_write_audit', {
    p_actor_admin_user_id: input.actor.adminUserId,
    p_action: action,
    p_reason: reason === '' ? null : reason.slice(0, MAX_REASON_LENGTH),
    p_subject_user_id: input.subjectUserId ?? null,
    p_entity_type: input.entityType ?? null,
    p_entity_id: input.entityId ?? null,
    p_outcome: input.outcome ?? 'success',
    p_support_access_grant_id: input.supportAccessGrantId ?? null,
    p_detail: sanitiseDetail(input.detail),
  })
}

/**
 * A refused sign-in.
 *
 * Written with no admin actor, because the whole point is that the account is
 * not one. The action name is deliberately outside the `admin.` namespace: the
 * accountability trigger would — correctly — refuse an `admin.*` row that
 * cannot name an admin, and inventing a fake actor to satisfy it would be
 * worse than not recording the attempt at all.
 */
export async function recordSignInDenied(
  authUserId: string | null,
  /** `not_staff` is the first pass's spelling of `not_admin`; both are recorded. */
  outcome: 'not_admin' | 'not_staff' | 'disabled' | 'mfa_failed' | 'rate_limited',
): Promise<void> {
  await adminRpc('admin_write_audit', {
    p_actor_admin_user_id: null,
    p_action: 'auth.admin_sign_in_denied',
    p_reason: null,
    p_subject_user_id: authUserId,
    p_entity_type: 'admin_user',
    p_entity_id: authUserId,
    p_outcome: outcome,
    p_support_access_grant_id: null,
    p_detail: {},
  })
}

// ===========================================================================
// 3. The migration bridge
//
// The first-pass pages call `recordStaffAction()` with a GoTrue user id and one
// of three legacy tiers. It is implemented here on `admin_write_audit()`: the
// actor is resolved to an `admin_users.id`, so the row lands with a real actor
// column rather than a metadata key the retention sweep would erase. Deleted
// when the last caller has moved to `writeAudit()`.
// ===========================================================================

/** @deprecated Use `AdminAuditAction`. */
export type StaffAction = 'staff.signed_in' | 'staff.signed_out' | (string & {})

/** @deprecated Use `AdminActor`, which carries `admin_users.id`. */
export interface StaffActor {
  userId: string
  role: string
}

/** @deprecated Use `WriteAuditInput`. */
export interface RecordStaffActionInput {
  actor: StaffActor & { adminUserId?: string }
  action: StaffAction
  subjectUserId?: string | null
  entityType?: string | null
  entityId?: string | null
  reason: string
  outcome?: string
  detail?: AuditDetail
}

/**
 * @deprecated Use `writeAudit()`.
 *
 * The legacy call sites pass the GoTrue user id. `admin_write_audit()` needs
 * `admin_users.id`, so when the caller has not supplied one this resolves it —
 * and refuses rather than writing an unattributed row if the account turns out
 * not to be an admin after all.
 */
export async function recordStaffAction(input: RecordStaffActionInput): Promise<void> {
  const adminUserId = input.actor.adminUserId ?? (await resolveAdminUserId(input.actor.userId))
  await writeAudit({
    actor: { adminUserId },
    action: input.action,
    subjectUserId: input.subjectUserId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    reason: input.reason,
    outcome: input.outcome ?? 'success',
    detail: input.detail ?? {},
  })
}

async function resolveAdminUserId(authUserId: string): Promise<string> {
  const rows = await adminRpc('admin_resolve_by_auth_user', { p_user_id: authUserId })
  const row = rows[0]
  if (row === undefined) {
    throw new AppError('forbidden', {
      status: 403,
      detail: 'cannot audit an action for an account that is not an active admin',
    })
  }
  return row.admin_user_id
}
