import { formatNumber } from '@/lib/format'
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH, REVOKE_FIELDS, type RevokeOutcome } from './contract'
import { billingMessages } from './messages'
import { BillingSubmitButton } from './SubmitButton'

/**
 * The one outward staff action in the billing area: order a referral code's
 * outstanding bonus credits revoked.
 *
 * ---------------------------------------------------------------------------
 * WHAT PRESSING THIS ACTUALLY DOES, AND WHY THAT IS THE WHOLE OF IT
 * ---------------------------------------------------------------------------
 *
 * `@/lib/db` exposes exactly one write to the whole application —
 * `insertAuditLog` — and that is not an oversight to route around. The service
 * role bypasses row level security, so any second writer the backoffice was
 * given would be a general-purpose mutation path over every table in the
 * database, held by a web app whose entire premise is that it cannot reach user
 * data. There is no `referral-revoke` edge function either, and
 * `subscription-refresh` authenticates as the *user* — minting a user session
 * from here would hand whoever holds the backoffice credentials a way into any
 * mailbox, which is precisely the thing the product promises is impossible.
 *
 * So the button does the one durable, attributable, content-free thing it can:
 * it records a revocation order in `audit_logs` naming the operator, the code,
 * the referrer, the number of active credits at the time, and a reason they had
 * to type. The order shows up on this page immediately and in `/denetim`, and
 * the code's own `credit_revoked_count` is on screen beside it — so whether the
 * order was carried out is a fact an operator can read, not a promise this form
 * makes.
 *
 * The disclosure is a `<details>`: it opens and closes with no JavaScript, and
 * there is no path through it that submits without a reason.
 */

export interface RevokeCreditFormProps {
  /** The Server Action. Passed in so this file imports no server module. */
  action: (formData: FormData) => void | Promise<void>
  referralId: string
  referrerUserId: string
  code: string
  activeCredits: number
  /** Path (with query) the action returns to. */
  returnTo: string
  /** Set on the row whose result is currently shown, so it opens pre-expanded. */
  outcome?: RevokeOutcome | null
}

export function RevokeCreditForm({
  action,
  referralId,
  referrerUserId,
  code,
  activeCredits,
  returnTo,
  outcome = null,
}: RevokeCreditFormProps) {
  // Nothing to revoke is not a state to put a button in front of: a control
  // whose only possible outcome is "no effect" is a dead control with a
  // spinner. The count is the answer, so the count is what is rendered.
  if (activeCredits <= 0) {
    return <span className="text-[11px] text-faint">{billingMessages.outcomes.noop}</span>
  }

  const reasonId = `revoke-reason-${referralId}`
  const openByDefault = outcome !== null && outcome !== 'success'

  return (
    <details className="group text-left" open={openByDefault}>
      <summary className="inline-flex h-7 cursor-pointer list-none items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted transition-colors select-none hover:border-critical/40 hover:text-critical-text group-open:border-critical/40 group-open:text-critical-text">
        <span className="group-open:hidden">{billingMessages.revoke.open}</span>
        <span className="hidden group-open:inline">{billingMessages.revoke.close}</span>
      </summary>

      <form
        action={action}
        className="mt-2 flex w-72 flex-col gap-2 rounded-md border border-hairline bg-surface2/50 p-2"
      >
        <input type="hidden" name={REVOKE_FIELDS.referralId} value={referralId} />
        <input type="hidden" name={REVOKE_FIELDS.referrerUserId} value={referrerUserId} />
        <input type="hidden" name={REVOKE_FIELDS.code} value={code} />
        <input type="hidden" name={REVOKE_FIELDS.returnTo} value={returnTo} />

        <p className="text-[11px] leading-snug text-faint">{billingMessages.revoke.explain}</p>

        <p className="text-[11px] text-muted">
          <span className="bo-kicker mr-1">{billingMessages.revoke.codeLabel}</span>
          <span className="font-mono">{code}</span>
          <span className="bo-kicker mx-1">{billingMessages.revoke.activeLabel}</span>
          <span className="tabular-nums">{formatNumber(activeCredits)}</span>
        </p>

        <label className="flex flex-col gap-1" htmlFor={reasonId}>
          <span className="bo-kicker">{billingMessages.revoke.reasonLabel}</span>
          <input
            id={reasonId}
            name={REVOKE_FIELDS.reason}
            required
            minLength={MIN_REASON_LENGTH}
            maxLength={MAX_REASON_LENGTH}
            placeholder={billingMessages.revoke.reasonPlaceholder}
            className="h-7 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink placeholder:text-faint"
          />
        </label>

        <div className="flex justify-end">
          <BillingSubmitButton
            label={billingMessages.revoke.submit}
            pendingLabel={billingMessages.revoke.submitting}
            variant="danger"
          />
        </div>
      </form>
    </details>
  )
}
