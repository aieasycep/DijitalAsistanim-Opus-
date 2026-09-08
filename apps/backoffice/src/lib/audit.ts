import 'server-only'

import { insertAuditLog } from './db'
import type { StaffRole } from './db'

/**
 * The staff audit trail.
 *
 * Every destructive or outward-facing action a staff member takes writes one
 * row naming who did it, what they did, to whom, and why. The `reason` is a
 * required argument rather than an optional field: an action nobody can justify
 * in writing is an action that should not have a button.
 *
 * What goes into `metadata` is constrained by the same rule as the views. The
 * `AuditDetail` type below admits scalars only — no jsonb blob, no nested
 * object, nothing that could carry a message body if a future caller were
 * careless. `audit_logs` is documented in 0010 as identifiers and outcome codes
 * only, and this is what holds that true.
 */

/** Actions the backoffice can record. Extended as pages are added. */
export type StaffAction =
  'staff.signed_in' | 'staff.sign_in_denied' | 'staff.signed_out' | (string & {})

export type AuditDetail = Record<string, string | number | boolean | null>

export interface StaffActor {
  userId: string
  role: StaffRole
}

export interface RecordStaffActionInput {
  /** Who acted. */
  actor: StaffActor
  /** What they did, as a dotted lower-snake token: `account.disconnected`. */
  action: StaffAction
  /** The user the action was about, when there is one. */
  subjectUserId?: string | null
  /** The kind of thing acted on: `connected_account`, `export_request`. */
  entityType?: string | null
  /** The id of that thing. Never an address, never a subject line. */
  entityId?: string | null
  /** Why. Typed by the operator, shown back in the audit view. Required. */
  reason: string
  /** `success` or a failure token. Defaults to `success`. */
  outcome?: string
  /** Extra identifiers and codes. Scalars only, by type. */
  detail?: AuditDetail
}

/**
 * Reserved metadata keys. A caller's `detail` cannot overwrite them, so an
 * audit row can never disown its actor by passing `staff_user_id` itself.
 */
const RESERVED_KEYS = ['actor', 'staff_user_id', 'staff_role', 'reason', 'outcome'] as const

/** Reasons are typed by a person; keep them a sentence, not an essay. */
export const MAX_REASON_LENGTH = 280

export function isValidReason(reason: string): boolean {
  const trimmed = reason.trim()
  return trimmed.length >= 3 && trimmed.length <= MAX_REASON_LENGTH
}

/**
 * Append one row to `audit_logs`.
 *
 * Throws if the write fails: an action whose audit row did not land must not
 * report success, because the trail is the only evidence the action happened.
 * Callers should record the audit row before, or in the same failure path as,
 * the effect itself.
 */
export async function recordStaffAction(input: RecordStaffActionInput): Promise<void> {
  const reason = input.reason.trim().slice(0, MAX_REASON_LENGTH)

  const detail: AuditDetail = {}
  for (const [key, value] of Object.entries(input.detail ?? {})) {
    if ((RESERVED_KEYS as readonly string[]).includes(key)) continue
    detail[key] = value
  }

  await insertAuditLog({
    userId: input.subjectUserId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    metadata: {
      ...detail,
      actor: 'staff',
      staff_user_id: input.actor.userId,
      staff_role: input.actor.role,
      reason,
      outcome: input.outcome ?? 'success',
    },
  })
}

/**
 * A sign-in attempt that was refused. Written without a staff actor, because
 * the whole point is that the account is not one — the user id is the subject,
 * and `actor` is `system` so `bo_audit` will not surface a `staff_reason`.
 */
export async function recordSignInDenied(
  userId: string | null,
  outcome: 'not_staff' | 'disabled',
): Promise<void> {
  await insertAuditLog({
    userId,
    action: 'staff.sign_in_denied',
    entityType: 'staff_member',
    entityId: userId,
    metadata: { actor: 'system', outcome },
  })
}
