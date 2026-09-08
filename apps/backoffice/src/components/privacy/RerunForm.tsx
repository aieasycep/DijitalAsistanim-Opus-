'use client'

import { MAX_REASON_LENGTH, MIN_REASON_LENGTH, RERUN_FIELDS, type RerunOutcome } from './contract'
import { privacyMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * The re-run control on a stuck or failed export request.
 *
 * It is a disclosure rather than a bare button because the order carries a
 * written reason into the audit trail, and there is no path through this
 * component that submits without one.
 *
 * What the order is *not* is worth being explicit about, on screen as well as
 * here: pressing this does not rebuild the archive. Rebuilding it means reading
 * a user's entire mailbox into a file, and the backoffice deliberately holds no
 * credential that can do that — `data-export-request` runs under the user's own
 * authorisation and nothing else. The order is the audited instruction that the
 * request needs running again, addressed to the job that legitimately can.
 *
 * `<details>` does the opening and closing natively, so a row costs no state and
 * works before JavaScript has loaded. The only client behaviour is the submit
 * button's pending state.
 */

export interface RerunFormProps {
  /** The Server Action. Passed as a prop so this file imports no server code. */
  action: (formData: FormData) => void | Promise<void>
  requestId: string
  statusLabel: string
  /** Path (with query) the action returns to. */
  returnTo: string
  /** Set on the row whose result is showing, so a failed attempt reopens. */
  outcome?: RerunOutcome | null
}

export function RerunForm({
  action,
  requestId,
  statusLabel,
  returnTo,
  outcome = null,
}: RerunFormProps) {
  const reasonId = `rerun-reason-${requestId}`
  const openByDefault = outcome !== null && outcome !== 'ordered'

  return (
    <details className="group text-left" open={openByDefault}>
      <summary className="inline-flex h-7 cursor-pointer list-none items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted transition-colors select-none hover:border-primary/40 hover:text-ink group-open:border-primary/40 group-open:text-ink">
        <span className="group-open:hidden">{privacyMessages.rerun.open}</span>
        <span className="hidden group-open:inline">{privacyMessages.rerun.close}</span>
      </summary>

      <form
        action={action}
        className="mt-2 flex w-72 flex-col gap-2 rounded-md border border-hairline bg-surface2/50 p-2"
      >
        <input type="hidden" name={RERUN_FIELDS.requestId} value={requestId} />
        <input type="hidden" name={RERUN_FIELDS.returnTo} value={returnTo} />

        <p className="text-[11px] leading-snug text-faint">{privacyMessages.rerun.explain}</p>

        <p className="text-[11px] text-muted">
          <span className="bo-kicker mr-1">{privacyMessages.rerun.statusLabel}</span>
          {statusLabel}
        </p>

        <label className="flex flex-col gap-1" htmlFor={reasonId}>
          <span className="bo-kicker">{privacyMessages.rerun.reasonLabel}</span>
          <input
            id={reasonId}
            name={RERUN_FIELDS.reason}
            required
            minLength={MIN_REASON_LENGTH}
            maxLength={MAX_REASON_LENGTH}
            placeholder={privacyMessages.rerun.reasonPlaceholder}
            className="h-7 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink placeholder:text-faint"
          />
        </label>

        <div className="flex justify-end">
          <SubmitButton
            label={privacyMessages.rerun.submit}
            pendingLabel={privacyMessages.rerun.submitting}
          />
        </div>
      </form>
    </details>
  )
}
