import { Button, ConfirmDialog } from '@/components/ui'
import {
  approveGrantAction,
  denyGrantAction,
  revokeGrantAction,
} from '@/lib/actions/support-access'
import { MIN_REASON_LENGTH } from '@/lib/admin-action'
import type { BoSupportAccessGrantRow } from '@/lib/db'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { SCOPE_SENSITIVITY_ORDER, formatMinutesRemainingTr } from '@/lib/redact'
import { DECISION_FIELDS, orderedScopes } from './contract'
import { ScopeChips } from './ScopeList'

/**
 * Approve, deny, revoke — each behind a dialog and a written reason.
 *
 * ---------------------------------------------------------------------------
 * FOUR EYES, ON BOTH SIDES OF THE BOUNDARY
 * ---------------------------------------------------------------------------
 *
 * `support_access_grants_four_eyes` is a check constraint: a grant whose
 * `approved_by` equals its `admin_user_id` cannot exist, and no form handler can
 * relax that. This component is the other half of the same rule — the requester
 * is not offered an Approve button at all, because a control that would be
 * refused is a control that should not be drawn.
 *
 * The rule is not re-implemented here. If a request for approval reaches the
 * server anyway, the database refuses it and the action turns that refusal into
 * a Turkish sentence naming the rule.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE REQUESTER *CAN* DO
 * ---------------------------------------------------------------------------
 *
 * Hand it back. An operator who no longer needs an access they hold should be
 * able to end it without asking anybody, and a reviewer who does not like what
 * they see should be able to take it away — so revocation is offered to the
 * holder and to any approver, and refused to everybody else by the second
 * permission check the handler makes at the source.
 */
export function DecisionPanel({
  grant,
  csrf,
  viewerAdminUserId,
  canApprove,
  environmentNote,
}: {
  grant: BoSupportAccessGrantRow
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  viewerAdminUserId: string
  /** Whether this operator holds `support.access.approve`, per the database. */
  canApprove: boolean
  /** `dangerousActionNote(environment)`; null in production. */
  environmentNote: string | null
}) {
  const isRequester = grant.admin_user_id === viewerAdminUserId
  const isPending = grant.status === 'pending_approval'
  const isRevocable = grant.status === 'pending_approval' || grant.status === 'active'

  // Four eyes: the requester is never offered a decision on their own request.
  const mayDecide = isPending && canApprove && !isRequester
  const mayRevoke = isRevocable && (isRequester || canApprove)

  const hiddenFields = {
    [csrf.name]: csrf.value,
    [DECISION_FIELDS.grantId]: grant.grant_id,
  }

  const reasonConfig = {
    // The console's own floor, which is what `runAdminAction` enforces before
    // the database's three-character one ever gets a chance to.
    minLength: MIN_REASON_LENGTH,
  }

  const summary = <GrantSummaryBlock grant={grant} />

  if (!mayDecide && !mayRevoke) {
    return (
      <p className="text-[13px] text-muted">
        {isPending
          ? isRequester
            ? supportAccessMessages.detail.fourEyesNotice
            : supportAccessMessages.detail.decisionNoPermission
          : supportAccessMessages.detail.decisionSettled}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted">
        {isPending
          ? supportAccessMessages.detail.decisionPending
          : supportAccessMessages.detail.decisionSettled}
      </p>

      {isPending && isRequester ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
          {supportAccessMessages.detail.fourEyesNotice}
        </p>
      ) : null}

      {isRequester && grant.status === 'active' ? (
        <p className="text-[12px] text-faint">{supportAccessMessages.decision.revokeHolderNote}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {mayDecide ? (
          <ConfirmDialog
            trigger={<Button variant="primary">{supportAccessMessages.decision.approve}</Button>}
            title={supportAccessMessages.decision.approveTitle}
            description={supportAccessMessages.decision.approveDescription}
            confirmLabel={supportAccessMessages.decision.approveConfirm}
            action={approveGrantAction}
            hiddenFields={hiddenFields}
            reason={{
              ...reasonConfig,
              label: supportAccessMessages.decision.approveReasonLabel,
              placeholder: supportAccessMessages.decision.approveReasonPlaceholder,
            }}
            note={environmentNote}
            // Not "irreversible" in the sense the red banner means — it can be
            // revoked a minute later — but every reveal it enables is permanent
            // and is recorded against the requester's name.
            destructive={false}
          >
            {summary}
          </ConfirmDialog>
        ) : null}

        {mayDecide ? (
          <ConfirmDialog
            trigger={<Button variant="secondary">{supportAccessMessages.decision.deny}</Button>}
            title={supportAccessMessages.decision.denyTitle}
            description={supportAccessMessages.decision.denyDescription}
            confirmLabel={supportAccessMessages.decision.denyConfirm}
            action={denyGrantAction}
            hiddenFields={hiddenFields}
            reason={{
              ...reasonConfig,
              label: supportAccessMessages.decision.denyReasonLabel,
              placeholder: supportAccessMessages.decision.denyReasonPlaceholder,
            }}
            note={environmentNote}
            destructive={false}
          >
            {summary}
          </ConfirmDialog>
        ) : null}

        {mayRevoke ? (
          <ConfirmDialog
            trigger={<Button variant="danger">{supportAccessMessages.decision.revoke}</Button>}
            title={supportAccessMessages.decision.revokeTitle}
            description={supportAccessMessages.decision.revokeDescription}
            confirmLabel={supportAccessMessages.decision.revokeConfirm}
            action={revokeGrantAction}
            hiddenFields={hiddenFields}
            reason={{
              ...reasonConfig,
              label: supportAccessMessages.decision.revokeReasonLabel,
              placeholder: supportAccessMessages.decision.revokeReasonPlaceholder,
            }}
            note={environmentNote}
            destructive
          >
            {summary}
          </ConfirmDialog>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Exactly what is about to change, inside the dialog.
 *
 * A reviewer is deciding whether one named person may read another named
 * person's mail, so the dialog restates the scopes and the window rather than
 * asking them to remember the page behind it.
 */
function GrantSummaryBlock({ grant }: { grant: BoSupportAccessGrantRow }) {
  const scopes = orderedScopes(grant.scopes, SCOPE_SENSITIVITY_ORDER)
  return (
    <div className="flex flex-col gap-2 rounded-md border border-hairline bg-surface2/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span>{grant.admin_email_redacted}</span>
        <span aria-hidden="true">→</span>
        <span>{grant.subject_email_redacted}</span>
      </div>
      <ScopeChips scopes={scopes} />
      <p className="text-[11px] text-faint">
        {supportAccessMessages.decision.scopeSummary(scopes.length)} ·{' '}
        {supportAccessMessages.decision.windowSummary(
          formatMinutesRemainingTr(grant.window_minutes),
        )}
      </p>
      <p className="text-[12px] text-ink">
        <span className="bo-kicker mr-1">{supportAccessMessages.detail.reasonTitle}</span>
        {grant.reason}
      </p>
    </div>
  )
}
