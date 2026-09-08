'use client'

import { BRIEFING_KINDS, type BriefingKind } from '@da/domain'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { regenerateBriefingAction } from './actions'
import { initialRegenerateBriefingState } from './action-state'
import { userEnumLabels, userMessages } from './messages'

/**
 * The staff action form.
 *
 * A client component only because it renders what the Server Action returns —
 * the request itself is built, authorised, validated against the user's real
 * state and written to `audit_logs` entirely on the server, so nothing about
 * the subject exists on this side of the boundary beyond the id already in the
 * URL.
 *
 * The reason field is required and enforced twice: `required`/`minLength` here
 * so an operator is told before submitting, and `isValidReason()` in the action
 * so a request that skipped the form is refused anyway. An action nobody can
 * justify in writing should not have a button.
 *
 * Only the briefing kinds the user's plan actually includes are offered; the
 * rest are refused by the action with the reason, which is itself the answer to
 * "why did their evening close never arrive".
 */
export function RegenerateBriefingForm({
  userId,
  allowedKinds,
  maxReasonLength,
}: {
  userId: string
  allowedKinds: readonly BriefingKind[]
  /**
   * `MAX_REASON_LENGTH` from `@/lib/audit`, handed down by the page. The audit
   * module is `server-only`, so the browser learns the limit from the render
   * rather than by importing the module that enforces it.
   */
  maxReasonLength: number
}) {
  const [state, formAction] = useActionState(
    regenerateBriefingAction,
    initialRegenerateBriefingState,
  )

  const kinds = BRIEFING_KINDS.filter((kind) => allowedKinds.includes(kind))
  const defaultKind = kinds[0] ?? 'morning'

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="kullaniciId" value={userId} />

      <label className="flex max-w-sm flex-col gap-1">
        <span className="bo-kicker">{userMessages.regenerate.kindLabel}</span>
        <select
          name="tur"
          defaultValue={defaultKind}
          className="h-8 rounded-md border border-hairline bg-surface px-2 text-[13px] text-ink"
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {userEnumLabels.briefingKind[kind] ?? kind}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="bo-kicker">{userMessages.regenerate.reasonLabel}</span>
        <textarea
          name="gerekce"
          rows={2}
          required
          minLength={3}
          maxLength={maxReasonLength}
          placeholder={userMessages.regenerate.reasonPlaceholder}
          className="resize-y rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint"
        />
        <span className="text-[11px] text-faint">{userMessages.regenerate.reasonHint}</span>
      </label>

      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === 'success' && state.message ? (
        <div role="status" className="rounded-md bg-success-soft px-3 py-2 text-[12px]">
          <p className="font-semibold text-success-text">{userMessages.regenerate.successTitle}</p>
          <p className="text-success-text/90">{state.message}</p>
        </div>
      ) : null}

      <SubmitButton />

      <p className="text-[11px] text-faint">{userMessages.regenerate.contentNotice}</p>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-8 self-start rounded-md bg-primary px-3 text-[13px] font-semibold text-on-primary transition-colors hover:bg-primary-pressed disabled:opacity-60"
    >
      {pending ? userMessages.regenerate.submitting : userMessages.regenerate.submit}
    </button>
  )
}
