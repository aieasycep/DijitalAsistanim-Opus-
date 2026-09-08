'use client'

import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  REVIEW_FIELDS,
  type ApprovalWindowKey,
  type ReviewScope,
} from './contract'
import { approvalMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * The one control in this area that writes anything.
 *
 * It records that an operator looked at a number and what they concluded, as an
 * `audit_logs` row: who, which action type or failure code, over which window,
 * the measured value, and a written reason. It touches no approval — there is
 * no code path in this application that can — so what it produces is evidence
 * of oversight rather than an effect on a user's queue.
 *
 * It is a disclosure rather than a bare button because the reason is mandatory:
 * a finding nobody can state in a sentence is not a finding. There is no path
 * through this component that submits without one, and the server re-checks with
 * `isValidReason` regardless.
 *
 * `<details>` does the opening and closing natively, so a table of twelve rows
 * costs no state and works while JavaScript is still loading.
 */

export interface ReviewFormProps {
  /** The Server Action. Passed as a prop so this file imports no server code. */
  action: (formData: FormData) => void | Promise<void>
  scope: ReviewScope
  /** The action type or the failure code being reviewed. */
  subject: string
  subjectLabel: string
  window: ApprovalWindowKey
  /** The number under review: a rate in basis points, or an occurrence count. */
  measure: number
  /** What that number was measured against. */
  sample: number
  /** How the measure reads on screen, e.g. `%34 · 210 karar`. */
  measureLabel: string
  returnTo: string
  /** Set on the row whose result is showing, so it reopens with its context. */
  reopen?: boolean
}

export function ReviewForm({
  action,
  scope,
  subject,
  subjectLabel,
  window,
  measure,
  sample,
  measureLabel,
  returnTo,
  reopen = false,
}: ReviewFormProps) {
  const reasonId = `review-reason-${scope}-${subject}`
  const isType = scope === 'type'

  return (
    <details className="group text-left" open={reopen}>
      <summary className="inline-flex h-7 cursor-pointer list-none items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted transition-colors select-none hover:border-primary/40 hover:text-ink group-open:border-primary/40 group-open:text-ink">
        <span className="group-open:hidden">
          {isType ? approvalMessages.review.openType : approvalMessages.review.openCode}
        </span>
        <span className="hidden group-open:inline">{approvalMessages.review.close}</span>
      </summary>

      <form
        action={action}
        className="mt-2 flex w-64 flex-col gap-2 rounded-md border border-hairline bg-surface2/50 p-2"
      >
        <input type="hidden" name={REVIEW_FIELDS.scope} value={scope} />
        <input type="hidden" name={REVIEW_FIELDS.subject} value={subject} />
        <input type="hidden" name={REVIEW_FIELDS.window} value={window} />
        <input type="hidden" name={REVIEW_FIELDS.measure} value={String(measure)} />
        <input type="hidden" name={REVIEW_FIELDS.sample} value={String(sample)} />
        <input type="hidden" name={REVIEW_FIELDS.returnTo} value={returnTo} />

        <p className="text-[11px] leading-snug text-faint">
          {isType ? approvalMessages.review.explainType : approvalMessages.review.explainCode}
        </p>

        <p className="text-[11px] text-muted">
          <span className="bo-kicker mr-1">{approvalMessages.review.measureLabel}</span>
          {subjectLabel} · {measureLabel}
        </p>

        <label className="flex flex-col gap-1" htmlFor={reasonId}>
          <span className="bo-kicker">{approvalMessages.review.reasonLabel}</span>
          <input
            id={reasonId}
            name={REVIEW_FIELDS.reason}
            required
            minLength={MIN_REASON_LENGTH}
            maxLength={MAX_REASON_LENGTH}
            placeholder={
              isType
                ? approvalMessages.review.reasonPlaceholderType
                : approvalMessages.review.reasonPlaceholderCode
            }
            className="h-7 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink placeholder:text-faint"
          />
        </label>

        <div className="flex justify-end">
          <SubmitButton
            label={approvalMessages.review.submit}
            pendingLabel={approvalMessages.review.submitting}
          />
        </div>
      </form>
    </details>
  )
}
