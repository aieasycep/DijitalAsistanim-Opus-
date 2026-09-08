'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, fieldControlProps } from '@/components/ui/field'
import { requestSupportAccessAction } from '@/lib/actions/support-access'
import { supportAccessMessages } from '@/lib/messages/support-access'
import {
  SCOPE_DESCRIPTIONS_TR,
  SCOPE_LABELS_TR,
  SCOPE_SENSITIVITY_ORDER,
  type SupportAccessScope,
} from '@/lib/redact'
import {
  REQUEST_FIELDS,
  grantHref,
  initialRequestFormState,
  type RequestFormState,
} from './contract'

/**
 * The request form.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A CLIENT COMPONENT
 * ---------------------------------------------------------------------------
 *
 * Only to render what the Server Action hands back — a per-field message under
 * the input that caused it, and a pending state on the button. Everything that
 * matters happens on the server: the permission is checked against
 * `admin_role_permissions`, the subject and the ticket are resolved against the
 * database, the reason floor is enforced by `runAdminAction` before Postgres
 * enforces its own, and the row is inserted with a written audit entry naming
 * the actor, the subject and the reason.
 *
 * The `minLength` attributes below are a courtesy so an operator is told before
 * they submit. They are not the check: a request that skipped this form is
 * refused by the same schema on the way in.
 *
 * ---------------------------------------------------------------------------
 * THE SCOPE LIST IS ORDERED BY WHAT IT COSTS SOMEBODY
 * ---------------------------------------------------------------------------
 *
 * `SCOPE_SENSITIVITY_ORDER` runs from `identity` to `email_body`, so the
 * cheapest sufficient scope is the first one an operator sees and the most
 * invasive is the last. Each checkbox carries the plain-Turkish description of
 * what it opens, from `@/lib/redact` — somebody ticking a box should be reading
 * a description of a person's private life, not a column name.
 */

export interface RequestFormProps {
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  /** Pre-filled from `?user=` when arriving from a user record. */
  initialSubjectUserId: string
  /** `MIN_SUPPORT_ACCESS_REASON` — the floor `support_access_grants` enforces. */
  minReasonLength: number
  maxReasonLength: number
  /** `SUPPORT_ACCESS_WINDOW_OPTIONS`, shortest first. */
  windowOptions: readonly number[]
  defaultWindowMinutes: number
  /** `MAX_SUPPORT_ACCESS_WINDOW_MINUTES / 60`, for the ceiling sentence. */
  maxWindowHours: number
}

export function RequestForm({
  csrf,
  initialSubjectUserId,
  minReasonLength,
  maxReasonLength,
  windowOptions,
  defaultWindowMinutes,
  maxWindowHours,
}: RequestFormProps) {
  const [state, formAction] = useActionState<RequestFormState, FormData>(
    requestSupportAccessAction,
    initialRequestFormState,
  )
  const [reason, setReason] = useState('')
  const baseId = useId()

  const subjectId = `${baseId}-subject`
  const reasonId = `${baseId}-reason`
  const ticketId = `${baseId}-ticket`
  const windowId = `${baseId}-window`

  const issue = (field: string): string | null => state.issues[field] ?? null
  const trimmedReason = reason.trim()
  const reasonLocalError =
    trimmedReason.length === 0 || trimmedReason.length >= minReasonLength
      ? null
      : supportAccessMessages.request.reasonTooShort(minReasonLength)

  if (state.status === 'success' && state.grantId !== null) {
    return (
      <div role="status" className="flex flex-col items-start gap-2 rounded-md bg-success-soft p-4">
        <p className="text-[13px] font-semibold text-success-text">
          {supportAccessMessages.request.successTitle}
        </p>
        <p className="max-w-prose text-[12px] text-success-text/90">{state.message}</p>
        <Button asChild size="md" variant="primary">
          <Link href={grantHref(state.grantId)}>{supportAccessMessages.request.successOpen}</Link>
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name={csrf.name} value={csrf.value} />

      <Field
        htmlFor={subjectId}
        label={supportAccessMessages.request.subjectLabel}
        description={supportAccessMessages.request.subjectDescription}
        error={issue(REQUEST_FIELDS.subject)}
        required
      >
        <Input
          id={subjectId}
          name={REQUEST_FIELDS.subject}
          defaultValue={initialSubjectUserId}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={supportAccessMessages.request.subjectPlaceholder}
          className="max-w-md font-mono"
          {...fieldControlProps(subjectId, {
            description: true,
            error: issue(REQUEST_FIELDS.subject),
          })}
        />
      </Field>

      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
          {supportAccessMessages.request.scopesLabel}
          <span aria-hidden="true" className="ml-0.5 text-critical-text">
            *
          </span>
        </legend>
        <p className="text-[11px] text-faint">{supportAccessMessages.request.scopesDescription}</p>

        <ul className="mt-1 flex flex-col gap-1">
          {SCOPE_SENSITIVITY_ORDER.map((scope: SupportAccessScope) => (
            <li key={scope}>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-hairline px-3 py-2 transition-colors hover:border-primary/40 hover:bg-surface2/50">
                <input
                  type="checkbox"
                  name={REQUEST_FIELDS.scope}
                  value={scope}
                  className="mt-0.5 size-3.5 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">
                    {SCOPE_LABELS_TR[scope]}
                  </span>
                  <span className="block text-[11px] text-faint">
                    {SCOPE_DESCRIPTIONS_TR[scope]}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        {issue(REQUEST_FIELDS.scope) === null ? null : (
          <p role="alert" className="text-[11px] font-medium text-critical-text">
            {issue(REQUEST_FIELDS.scope)}
          </p>
        )}
      </fieldset>

      <Field
        htmlFor={reasonId}
        label={supportAccessMessages.request.reasonLabel}
        description={supportAccessMessages.request.reasonDescription(minReasonLength)}
        error={issue(REQUEST_FIELDS.reason) ?? reasonLocalError}
        required
        meta={`${trimmedReason.length} / ${minReasonLength}`}
      >
        <Textarea
          id={reasonId}
          name={REQUEST_FIELDS.reason}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
          }}
          rows={3}
          required
          minLength={minReasonLength}
          maxLength={maxReasonLength}
          placeholder={supportAccessMessages.request.reasonPlaceholder}
          {...fieldControlProps(reasonId, {
            description: true,
            error: issue(REQUEST_FIELDS.reason) ?? reasonLocalError,
          })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          htmlFor={windowId}
          label={supportAccessMessages.request.windowLabel}
          description={supportAccessMessages.request.windowDescription(maxWindowHours)}
          error={issue(REQUEST_FIELDS.window)}
          required
        >
          <Select
            id={windowId}
            name={REQUEST_FIELDS.window}
            defaultValue={String(defaultWindowMinutes)}
            {...fieldControlProps(windowId, {
              description: true,
              error: issue(REQUEST_FIELDS.window),
            })}
          >
            {windowOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {supportAccessMessages.request.windowOption(minutes)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          htmlFor={ticketId}
          label={supportAccessMessages.request.ticketLabel}
          description={supportAccessMessages.request.ticketDescription}
          error={issue(REQUEST_FIELDS.ticket)}
        >
          <Input
            id={ticketId}
            name={REQUEST_FIELDS.ticket}
            autoComplete="off"
            spellCheck={false}
            placeholder={supportAccessMessages.request.ticketPlaceholder}
            className="font-mono"
            {...fieldControlProps(ticketId, {
              description: true,
              error: issue(REQUEST_FIELDS.ticket),
            })}
          />
        </Field>
      </div>

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
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="md" variant="primary" disabled={pending} className="self-start">
      {pending ? supportAccessMessages.request.submitting : supportAccessMessages.request.submit}
    </Button>
  )
}
