'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, fieldControlProps } from '@/components/ui/field'
import { revealAction } from '@/lib/actions/support-access'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { SCOPE_LABELS_TR, type SupportAccessScope } from '@/lib/redact'
import { formatDateTime } from '@/lib/format'
import { RevealedRecord } from './RevealedRecord'
import {
  REVEAL_FIELDS,
  initialRevealFormState,
  type RevealFormState,
  type RevealInputKind,
} from './reveal'

/**
 * One reveal, and what it returned.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A CLIENT COMPONENT
 * ---------------------------------------------------------------------------
 *
 * Because the rows have to come back to the operator without travelling through
 * the URL. A Server Action's response reaches the page it was posted from and
 * goes nowhere else; a redirect carrying a mail body would write it into the
 * browser's history, the access log and the next request's referrer header.
 *
 * Nothing is decided here. The permission is re-asked against
 * `admin_role_permissions`, the grant is re-proved by `sa_assert_grant()`, and
 * the reveal is written to `support_access_reveals` by the same statement that
 * reads the record. The form's own `required` and `pattern` attributes are a
 * courtesy so an operator is told before they submit.
 *
 * ---------------------------------------------------------------------------
 * ONE FORM, FOUR SHAPES
 * ---------------------------------------------------------------------------
 *
 * The eight `sa_reveal_*` functions take four kinds of argument between them —
 * nothing, one record id, a listing size, a date range — so the controls are a
 * function of the chosen scope rather than eight hand-written forms that could
 * each drift from its function's signature.
 */
export function RevealForm({
  csrf,
  grantId,
  scope,
  kind,
  limitOptions,
  defaultLimit,
  defaultFrom,
  defaultTo,
  maxRangeDays,
}: {
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  grantId: string
  /** Already proved to be one this grant covers; the picker offers no other. */
  scope: SupportAccessScope
  kind: RevealInputKind
  limitOptions: readonly number[]
  defaultLimit: number
  /** Today in Istanbul, from the page's injected clock. */
  defaultFrom: string
  defaultTo: string
  maxRangeDays: number
}) {
  const [state, formAction] = useActionState<RevealFormState, FormData>(
    revealAction,
    initialRevealFormState,
  )
  // Which result the operator has put away. Keyed by request id so the next
  // reveal is shown rather than inheriting the last one's dismissal.
  const [hidden, setHidden] = useState<string | null>(null)
  const baseId = useId()

  const recordId = `${baseId}-record`
  const limitId = `${baseId}-limit`
  const fromId = `${baseId}-from`
  const toId = `${baseId}-to`

  const issue = (field: string): string | null => state.issues[field] ?? null
  const showPayload =
    state.status === 'revealed' && state.payload !== null && hidden !== state.requestId

  return (
    <div className="flex flex-col gap-4">
      {/*
        `key` on the form is the scope: moving to another scope replaces the
        controls rather than carrying a message id across into a form that would
        send it to a different function.
      */}
      <form key={scope} action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name={csrf.name} value={csrf.value} />
        <input type="hidden" name={REVEAL_FIELDS.grantId} value={grantId} />
        <input type="hidden" name={REVEAL_FIELDS.scope} value={scope} />

        {kind === 'none' ? (
          <p className="text-[12px] text-muted">
            {supportAccessMessages.reveal.identityDescription}
          </p>
        ) : null}

        {kind === 'record' ? (
          <Field
            htmlFor={recordId}
            label={
              supportAccessMessages.reveal.recordLabels[scope] ??
              supportAccessMessages.reveal.recordLabel
            }
            description={supportAccessMessages.reveal.recordDescription}
            error={issue(REVEAL_FIELDS.recordId)}
            required
          >
            <Input
              id={recordId}
              name={REVEAL_FIELDS.recordId}
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="max-w-md font-mono"
              {...fieldControlProps(recordId, {
                description: true,
                error: issue(REVEAL_FIELDS.recordId),
              })}
            />
          </Field>
        ) : null}

        {kind === 'listing' ? (
          <Field
            htmlFor={limitId}
            label={supportAccessMessages.reveal.limitLabel}
            description={supportAccessMessages.reveal.limitDescription}
            error={issue(REVEAL_FIELDS.limit)}
            required
          >
            <Select
              id={limitId}
              name={REVEAL_FIELDS.limit}
              defaultValue={String(defaultLimit)}
              className="max-w-40"
              {...fieldControlProps(limitId, {
                description: true,
                error: issue(REVEAL_FIELDS.limit),
              })}
            >
              {limitOptions.map((limit) => (
                <option key={limit} value={limit}>
                  {supportAccessMessages.reveal.limitOption(limit)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {kind === 'range' ? (
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Field
              htmlFor={fromId}
              label={supportAccessMessages.reveal.fromLabel}
              description={supportAccessMessages.reveal.rangeDescription(maxRangeDays)}
              error={issue(REVEAL_FIELDS.from)}
              required
            >
              <Input
                id={fromId}
                type="date"
                name={REVEAL_FIELDS.from}
                defaultValue={defaultFrom}
                required
                {...fieldControlProps(fromId, {
                  description: true,
                  error: issue(REVEAL_FIELDS.from),
                })}
              />
            </Field>
            <Field htmlFor={toId} label={supportAccessMessages.reveal.toLabel} required>
              <Input
                id={toId}
                type="date"
                name={REVEAL_FIELDS.to}
                defaultValue={defaultTo}
                required
                {...fieldControlProps(toId, {})}
              />
            </Field>
          </div>
        ) : null}

        {state.status === 'error' && state.message !== null ? (
          <p
            role="alert"
            className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
          >
            {state.message}
          </p>
        ) : null}

        <SubmitButton />
      </form>

      {state.status === 'revealed' && state.payload !== null ? (
        <section
          aria-label={`${SCOPE_LABELS_TR[scope]} — ${supportAccessMessages.reveal.resultTitle}`}
          className="flex flex-col gap-2 rounded-md border border-critical/40 p-3"
        >
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p role="status" className="text-[12px] font-semibold text-critical-text">
                {supportAccessMessages.reveal.resultLogged(state.payload.rows.length)}
              </p>
              <p className="mt-0.5 text-[11px] text-faint">
                {supportAccessMessages.reveal.resultAt}: {formatDateTime(state.revealedAt)}
                {state.requestId === null ? null : (
                  <>
                    {' · '}
                    {supportAccessMessages.reveal.resultRequestId}:{' '}
                    <span className="font-mono">{state.requestId}</span>
                  </>
                )}
              </p>
            </div>
            {showPayload ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setHidden(state.requestId)
                }}
              >
                {supportAccessMessages.reveal.resultHide}
              </Button>
            ) : null}
          </header>

          {showPayload ? (
            <RevealedRecord payload={state.payload} />
          ) : (
            <p className="text-[12px] text-muted">{supportAccessMessages.reveal.resultHidden}</p>
          )}
        </section>
      ) : null}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="md" variant="danger" disabled={pending} className="self-start">
      {pending ? supportAccessMessages.reveal.submitting : supportAccessMessages.reveal.submit}
    </Button>
  )
}
