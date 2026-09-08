'use client'

import { MAX_REASON_LENGTH, MIN_REASON_LENGTH, RESYNC_FIELDS, type ResyncOutcome } from './contract'
import { opsMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * The resync control on a failing row.
 *
 * It is a disclosure rather than a bare button because the action is
 * outward-facing: pressing it makes the platform talk to Google or Microsoft on
 * a user's behalf, and every such action has to carry a written reason into the
 * audit trail. Opening the disclosure asks for that reason; there is no path
 * through this component that submits without one.
 *
 * `<details>` does the opening and closing natively, so the row costs no state
 * and works with JavaScript still loading. The only client-side behaviour is the
 * submit button's pending state.
 */

export interface ResyncFormProps {
  /** The Server Action. Passed as a prop so this file imports no server code. */
  action: (formData: FormData) => void | Promise<void>
  accountId: string
  userId: string
  provider: string
  providerLabel: string
  resource: string
  resourceLabel: string
  /** Path (with query) the action returns to, e.g. `/ops/sync?kod=…`. */
  returnTo: string
  /** Set on the row whose result is currently shown, so it opens pre-expanded. */
  outcome?: ResyncOutcome | null
}

export function ResyncForm({
  action,
  accountId,
  userId,
  provider,
  providerLabel,
  resource,
  resourceLabel,
  returnTo,
  outcome = null,
}: ResyncFormProps) {
  const reasonId = `resync-reason-${accountId}-${resource}`
  // A row that just failed reopens, so the operator can read the reason they
  // typed, adjust it and try again without hunting for the row.
  const openByDefault = outcome !== null && outcome !== 'success'

  return (
    <details className="group text-left" open={openByDefault}>
      <summary className="inline-flex h-7 cursor-pointer list-none items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted transition-colors select-none hover:border-primary/40 hover:text-ink group-open:border-primary/40 group-open:text-ink">
        <span className="group-open:hidden">{opsMessages.resync.open}</span>
        <span className="hidden group-open:inline">{opsMessages.resync.close}</span>
      </summary>

      <form
        action={action}
        className="mt-2 flex w-64 flex-col gap-2 rounded-md border border-hairline bg-surface2/50 p-2"
      >
        <input type="hidden" name={RESYNC_FIELDS.accountId} value={accountId} />
        <input type="hidden" name={RESYNC_FIELDS.userId} value={userId} />
        <input type="hidden" name={RESYNC_FIELDS.provider} value={provider} />
        <input type="hidden" name={RESYNC_FIELDS.resource} value={resource} />
        <input type="hidden" name={RESYNC_FIELDS.returnTo} value={returnTo} />

        <p className="text-[11px] leading-snug text-faint">{opsMessages.resync.explain}</p>

        <p className="text-[11px] text-muted">
          <span className="bo-kicker mr-1">{opsMessages.resync.resourceLabel}</span>
          {providerLabel} · {resourceLabel}
        </p>

        <label className="flex flex-col gap-1" htmlFor={reasonId}>
          <span className="bo-kicker">{opsMessages.resync.reasonLabel}</span>
          <input
            id={reasonId}
            name={RESYNC_FIELDS.reason}
            required
            minLength={MIN_REASON_LENGTH}
            maxLength={MAX_REASON_LENGTH}
            placeholder={opsMessages.resync.reasonPlaceholder}
            className="h-7 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink placeholder:text-faint"
          />
        </label>

        <div className="flex justify-end">
          <SubmitButton
            label={opsMessages.resync.submit}
            pendingLabel={opsMessages.resync.submitting}
          />
        </div>
      </form>
    </details>
  )
}
