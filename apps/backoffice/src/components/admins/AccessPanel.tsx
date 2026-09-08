import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import { Button, ConfirmDialog } from '@/components/ui'
import {
  disableAdminAction,
  enableAdminAction,
  revokeAdminSessionsAction,
} from '@/lib/actions/admins'
import type { BoAdminUserRow } from '@/lib/db'
import { formatNumber } from '@/lib/format'
import { adminMessages } from '@/lib/messages/admins'
import { DISABLE_FIELDS, ENABLE_FIELDS, SESSION_FIELDS } from './contract'

/**
 * The three controls that change what an account can do, each behind a
 * confirmation that states what it does.
 *
 * ---------------------------------------------------------------------------
 * THEY ARE DIFFERENT CONTROLS AND THE COPY SAYS SO
 * ---------------------------------------------------------------------------
 *
 * Closing an account removes the access. Evicting sessions removes the *open*
 * access and nothing else — the person can sign in again a second later, which
 * is exactly what you want when a laptop went missing but the colleague is
 * still on the team. Confusing the two is how an incident gets "handled" by a
 * button that did not handle it, so the dialogs spell out the difference.
 *
 * Closing an account also revokes its sessions, inside the same audited action.
 * That is belt and braces rather than the mechanism: `admin_touch_session()`
 * already returns no rows for a session belonging to a disabled admin, so the
 * door is shut by the schema. Revoking makes the session list say so, and puts
 * the count in the audit detail.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * There is no delete. `admin_users` carries `on delete restrict` on the audit
 * table's foreign keys precisely so a DELETE fails loudly rather than orphaning
 * a year of accountability, and `@/lib/db` will not delete from this table at
 * all. An account is closed and kept, so every audit row can still name who
 * acted.
 *
 * There is no "sign in as". Nothing in this console can act as somebody else,
 * and the absence is the feature.
 */
export function AccessPanel({
  admin,
  activeSessionCount,
  canDisable,
  isSelf,
  csrf,
  environmentNote,
}: {
  admin: BoAdminUserRow
  /** From `count=exact` over `bo_admin_sessions.is_active`, not from a page. */
  activeSessionCount: number
  /** Decides what is drawn. It is not the check. */
  canDisable: boolean
  isSelf: boolean
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  /** `dangerousActionNote(environment)`; null in production. */
  environmentNote: string | null
}) {
  if (!canDisable) {
    return <p className="text-[12px] text-faint">{adminMessages.actions.noDisablePermission}</p>
  }

  const reason = {
    label: adminMessages.actions.reasonLabel,
    placeholder: adminMessages.actions.reasonPlaceholder,
    minLength: MIN_REASON_LENGTH,
    maxLength: MAX_REASON_LENGTH,
  }

  const summary = (
    <div className="rounded-md border border-hairline px-3 py-2">
      <p className="text-[12px] text-ink">{admin.admin_name ?? admin.email_redacted ?? '—'}</p>
      <p className="mt-0.5 text-[11px] text-faint">
        {admin.role_label} · {formatNumber(activeSessionCount)} {adminMessages.columns.sessions}
      </p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {admin.status === 'disabled' ? (
          <ConfirmDialog
            trigger={<Button variant="primary">{adminMessages.actions.enable}</Button>}
            title={adminMessages.actions.enableTitle}
            description={adminMessages.actions.enableBody}
            confirmLabel={adminMessages.actions.enableConfirm}
            action={enableAdminAction}
            hiddenFields={{
              [csrf.name]: csrf.value,
              [ENABLE_FIELDS.adminUserId]: admin.admin_user_id,
            }}
            reason={reason}
            note={environmentNote}
            destructive={false}
          >
            {summary}
          </ConfirmDialog>
        ) : isSelf ? (
          <p className="text-[12px] text-warning-text">{adminMessages.detail.ownAccountNote}</p>
        ) : (
          <ConfirmDialog
            trigger={<Button variant="danger">{adminMessages.actions.disable}</Button>}
            title={adminMessages.actions.disableTitle}
            description={adminMessages.actions.disableBody}
            confirmLabel={adminMessages.actions.disableConfirm}
            action={disableAdminAction}
            hiddenFields={{
              [csrf.name]: csrf.value,
              [DISABLE_FIELDS.adminUserId]: admin.admin_user_id,
            }}
            reason={reason}
            note={environmentNote}
            // The masked address, typed out. Muscle memory carries people
            // through a dialog they have seen before; a value they have to read
            // off this row does not.
            confirmPhrase={admin.email_redacted ?? admin.admin_user_id}
            destructive
          >
            {summary}
          </ConfirmDialog>
        )}

        {activeSessionCount === 0 ? (
          <p className="text-[12px] text-faint">{adminMessages.actions.noSessionsToRevoke}</p>
        ) : (
          <ConfirmDialog
            trigger={<Button variant="secondary">{adminMessages.actions.revokeSessions}</Button>}
            title={adminMessages.actions.revokeSessionsTitle}
            description={adminMessages.actions.revokeSessionsBody}
            confirmLabel={adminMessages.actions.revokeSessionsConfirm}
            action={revokeAdminSessionsAction}
            hiddenFields={{
              [csrf.name]: csrf.value,
              [SESSION_FIELDS.adminUserId]: admin.admin_user_id,
            }}
            reason={reason}
            note={isSelf ? adminMessages.actions.revokeOwnSessionsNote : environmentNote}
            destructive={false}
          >
            {summary}
          </ConfirmDialog>
        )}
      </div>

      {isSelf ? (
        <p className="text-[11px] text-faint">{adminMessages.actions.revokeOwnSessionsNote}</p>
      ) : null}
    </div>
  )
}
