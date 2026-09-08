/**
 * Tone and shape decisions for the admin-management area.
 *
 * Pure, and importable from both sides of the client boundary: a badge tone is
 * a claim about health, and two screens disagreeing about whether "MFA yok" is
 * a warning is exactly the inconsistency an operations tool cannot afford.
 *
 * Nothing here decides anything. Whether a role holds a permission is answered
 * by `admin_role_permissions`; whether an account may act is answered by
 * `admin_has_permission()`. These functions only choose a colour and a word.
 */

import type { BadgeTone } from '@/components/ui/Badge'
import type { AdminRole, AdminStatus } from '@/lib/permissions'
import type { AdminOutcome } from './contract'

/**
 * The status pill.
 *
 * `invited` is informational, not healthy: the row exists and cannot sign in,
 * which is a fact rather than a problem. `disabled` is neutral for the same
 * reason — a closed account is the intended end state of an offboarding, and
 * painting it red would make every completed offboarding look like an incident.
 */
export function adminStatusTone(status: AdminStatus): BadgeTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'invited':
      return 'info'
    case 'disabled':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/**
 * The role pill.
 *
 * `super_admin` is the only role given the brand tone, because it is the only
 * role that can change who else may act. The rest are neutral: they are
 * different capabilities, not different amounts of power, and a colour ramp
 * would imply a hierarchy the schema explicitly refuses.
 */
export function adminRoleTone(role: AdminRole): BadgeTone {
  return role === 'super_admin' ? 'primary' : 'neutral'
}

/** MFA is the one place a missing value is a real warning rather than a dash. */
export function mfaTone(enrolled: boolean): BadgeTone {
  return enrolled ? 'success' : 'warning'
}

export function sessionTone(isActive: boolean, revoked: boolean): BadgeTone {
  if (revoked) return 'neutral'
  return isActive ? 'success' : 'neutral'
}

/** Green only for a success that is also good news. */
export function outcomeTone(outcome: AdminOutcome): BadgeTone {
  switch (outcome) {
    case 'roleChanged':
    case 'reenabled':
    case 'invited':
      return 'success'
    case 'disabled':
    case 'sessionsRevoked':
    case 'inviteRevoked':
      return 'warning'
    case 'noop':
    case 'noSessions':
      return 'neutral'
    case 'lastSuperAdmin':
    case 'selfDisable':
    case 'selfRole':
    case 'duplicate':
    case 'conflict':
      return 'warning'
    case 'auditMissing':
    case 'forbidden':
    case 'failed':
    case 'notfound':
      return 'critical'
    case 'invalid':
    case 'ratelimited':
      return 'info'
    default:
      return 'neutral'
  }
}

// ===========================================================================
// The permission matrix cell
// ===========================================================================

/**
 * What one (role, permission) cell of the matrix says.
 *
 * `database_only` and `console_only` are the two halves of a drift. They are
 * kept apart rather than merged into "mismatch" because they mean opposite
 * things operationally: a row present only in the database is somebody having
 * written to `admin_role_permissions` outside a reviewed migration, and a row
 * present only in the console's mirror is a migration that has not landed here
 * yet. Neither grants anything — `toPermissionSet()` intersects the two — but
 * they are investigated differently.
 */
export type MatrixCell = 'granted' | 'database_only' | 'console_only' | 'none' | 'unknown'

export function matrixCell(
  observable: boolean,
  inDatabase: boolean,
  inConsole: boolean,
): MatrixCell {
  if (!observable) return 'unknown'
  if (inDatabase && inConsole) return 'granted'
  if (inDatabase) return 'database_only'
  if (inConsole) return 'console_only'
  return 'none'
}

export function isDrift(cell: MatrixCell): boolean {
  return cell === 'database_only' || cell === 'console_only'
}

/** The glyph a cell renders. Text, so it survives a copy-paste into a ticket. */
export const MATRIX_GLYPH: Readonly<Record<MatrixCell, string>> = Object.freeze({
  granted: '✓',
  database_only: '!',
  console_only: '!',
  none: '·',
  unknown: '?',
})

export const MATRIX_CELL_CLASS: Readonly<Record<MatrixCell, string>> = Object.freeze({
  granted: 'text-success-text',
  database_only: 'text-warning-text font-bold',
  console_only: 'text-warning-text font-bold',
  none: 'text-disabled',
  unknown: 'text-faint',
})

/**
 * The namespace a permission belongs to — the token before the first dot.
 *
 * Used only to group the matrix's rows so 36 lines are readable. The grouping
 * is derived from the permission name itself rather than from a hand-written
 * map, so a permission added to the enum lands in a group without an edit.
 */
export function permissionNamespace(permission: string): string {
  const dot = permission.indexOf('.')
  return dot === -1 ? permission : permission.slice(0, dot)
}
