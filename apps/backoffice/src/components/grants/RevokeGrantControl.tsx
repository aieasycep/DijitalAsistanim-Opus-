import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import { Button, ConfirmDialog } from '@/components/ui'
import type { BoEntitlementGrantRow } from '@/lib/db'
import { formatDateTime } from '@/lib/format'
import { revokeGrantAction } from '@/lib/actions/grants'
import { grantKindLabels, grantMessages } from '@/lib/messages/grants'
import { REVOKE_FIELDS } from './contract'

/**
 * The one destructive control in this area.
 *
 * Behind `ConfirmDialog`, which is the same dialog every irreversible action in
 * this console goes through: it collects a written reason, states that the
 * reason is kept and attributable, and disables its own button until one has
 * been typed. None of that is the check —
 * `admin_entitlement_grants_revoked_needs_reason` refuses the row without a
 * reason and `runAdminAction` refuses the operation before it gets that far —
 * but it is where the sentence gets written.
 *
 * The control is rendered only for a grant that is actually in force. A revoked
 * or lapsed grant has nothing to stop, and a button that reports "already
 * revoked" every time it is pressed is the dead affordance this console does
 * not ship: the panel says why there is no control instead.
 */
export function RevokeGrantControl({
  row,
  csrf,
  canRevoke,
}: {
  row: BoEntitlementGrantRow
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  canRevoke: boolean
}) {
  if (!canRevoke) {
    return <p className="text-[12px] text-faint">{grantMessages.list.noRevokePermission}</p>
  }

  if (!row.is_live) {
    return <p className="text-[12px] text-faint">{grantMessages.revoke.onlyLive}</p>
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" size="md">
          {grantMessages.revoke.action}
        </Button>
      }
      title={grantMessages.revoke.title}
      description={grantMessages.revoke.body}
      confirmLabel={grantMessages.revoke.confirm}
      action={revokeGrantAction}
      hiddenFields={{
        [csrf.name]: csrf.value,
        [REVOKE_FIELDS.grantId]: row.grant_id,
      }}
      reason={{
        name: REVOKE_FIELDS.reason,
        label: grantMessages.revoke.reasonLabel,
        placeholder: grantMessages.revoke.reasonPlaceholder,
        minLength: MIN_REASON_LENGTH,
        maxLength: MAX_REASON_LENGTH,
      }}
      destructive
    >
      <div className="rounded-md border border-hairline px-3 py-2">
        <p className="text-[12px] text-ink">
          {row.user_email_redacted ?? '—'} · {grantKindLabels[row.kind]}
        </p>
        <p className="mt-0.5 text-[11px] text-faint">
          {grantMessages.revoke.summaryDays(row.days)} ·{' '}
          {grantMessages.revoke.summaryRemaining(row.days_remaining)} ·{' '}
          {formatDateTime(row.expires_at)}
        </p>
      </div>
    </ConfirmDialog>
  )
}
