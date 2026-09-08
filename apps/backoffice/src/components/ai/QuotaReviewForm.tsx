'use client'

import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  QUOTA_DECISIONS,
  QUOTA_REVIEW_FIELDS,
  type SpendWindowKey,
} from './contract'
import { aiMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * The quota review control on a row.
 *
 * It is a disclosure rather than a bare button because a review is a written
 * judgement about someone's account that goes into the permanent audit trail,
 * and there is no path through this component that submits without a reason.
 *
 * `<details>` does the opening and closing natively, so a table of twenty rows
 * costs no client state and works while JavaScript is still loading; the only
 * client behaviour is the submit button's pending state.
 */

export interface QuotaReviewFormProps {
  /** The Server Action, passed as a prop so this file imports no server code. */
  action: (formData: FormData) => void | Promise<void>
  userId: string
  /** Which spend window the operator is looking at, recorded with the review. */
  windowKey: SpendWindowKey
  /** Path (with query) the action returns to. */
  returnTo: string
  /** Opens pre-expanded when this row's last attempt did not succeed. */
  reopen?: boolean
}

export function QuotaReviewForm({
  action,
  userId,
  windowKey,
  returnTo,
  reopen = false,
}: QuotaReviewFormProps) {
  const decisionId = `quota-decision-${userId}`
  const reasonId = `quota-reason-${userId}`

  return (
    <details className="group text-left" open={reopen}>
      <summary className="inline-flex h-7 cursor-pointer list-none items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted transition-colors select-none hover:border-primary/40 hover:text-ink group-open:border-primary/40 group-open:text-ink">
        <span className="group-open:hidden">{aiMessages.ceiling.reviewOpen}</span>
        <span className="hidden group-open:inline">{aiMessages.ceiling.reviewClose}</span>
      </summary>

      <form
        action={action}
        className="mt-2 flex w-64 flex-col gap-2 rounded-md border border-hairline bg-surface2/50 p-2"
      >
        <input type="hidden" name={QUOTA_REVIEW_FIELDS.userId} value={userId} />
        <input type="hidden" name={QUOTA_REVIEW_FIELDS.window} value={windowKey} />
        <input type="hidden" name={QUOTA_REVIEW_FIELDS.returnTo} value={returnTo} />

        <p className="text-[11px] leading-snug text-faint">{aiMessages.ceiling.reviewExplain}</p>

        <label className="flex flex-col gap-1" htmlFor={decisionId}>
          <span className="bo-kicker">{aiMessages.ceiling.reviewDecisionLabel}</span>
          <select
            id={decisionId}
            name={QUOTA_REVIEW_FIELDS.decision}
            required
            defaultValue={QUOTA_DECISIONS[0]}
            className="h-7 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink"
          >
            {QUOTA_DECISIONS.map((decision) => (
              <option key={decision} value={decision}>
                {aiMessages.ceiling.decisions[decision] ?? decision}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1" htmlFor={reasonId}>
          <span className="bo-kicker">{aiMessages.ceiling.reviewReasonLabel}</span>
          <input
            id={reasonId}
            name={QUOTA_REVIEW_FIELDS.reason}
            required
            minLength={MIN_REASON_LENGTH}
            maxLength={MAX_REASON_LENGTH}
            placeholder={aiMessages.ceiling.reviewReasonPlaceholder}
            className="h-7 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink placeholder:text-faint"
          />
        </label>

        <div className="flex justify-end">
          <SubmitButton
            label={aiMessages.ceiling.reviewSubmit}
            pendingLabel={aiMessages.ceiling.reviewSubmitting}
          />
        </div>
      </form>
    </details>
  )
}
