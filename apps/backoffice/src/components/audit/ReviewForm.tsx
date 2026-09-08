'use client'

import { MAX_REASON_LENGTH, MIN_REASON_LENGTH, REVIEW_FIELDS } from './contract'
import { auditMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * The one form in this area that writes anything.
 *
 * It posts an entry id, a return path and a reason. The reason is required and
 * bounded here as a courtesy — the Server Action re-checks it with the real
 * `isValidReason` — because a review note nobody can read is not a review.
 *
 * What it produces is another audit row. It changes nothing about the entry it
 * refers to: `audit_logs` is append-only, and a tool that could edit the trail
 * it displays would be worth less than no tool at all.
 */

export interface ReviewFormProps {
  action: (formData: FormData) => void | Promise<void>
  entryId: string
  returnTo: string
}

export function ReviewForm({ action, entryId, returnTo }: ReviewFormProps) {
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name={REVIEW_FIELDS.entryId} value={entryId} />
      <input type="hidden" name={REVIEW_FIELDS.returnTo} value={returnTo} />

      <label className="flex flex-col gap-1">
        <span className="bo-kicker">{auditMessages.review.reasonLabel}</span>
        <textarea
          name={REVIEW_FIELDS.reason}
          required
          minLength={MIN_REASON_LENGTH}
          maxLength={MAX_REASON_LENGTH}
          rows={3}
          placeholder={auditMessages.review.reasonPlaceholder}
          className="w-full resize-y rounded-md border border-hairline bg-surface px-2 py-1.5 text-[12px] text-ink placeholder:text-faint"
        />
        <span className="text-[11px] text-faint">
          {auditMessages.review.reasonHint(MIN_REASON_LENGTH, MAX_REASON_LENGTH)}
        </span>
      </label>

      <div className="flex items-center gap-2">
        <SubmitButton
          label={auditMessages.review.submit}
          pendingLabel={auditMessages.review.submitting}
        />
        <span className="text-[11px] text-faint">{auditMessages.review.effectNote}</span>
      </div>
    </form>
  )
}
