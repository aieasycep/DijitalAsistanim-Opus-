'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, fieldControlProps } from '@/components/ui/field'
import { grantEntitlementAction } from '@/lib/actions/grants'
import { grantKindHints, grantKindLabels, grantMessages } from '@/lib/messages/grants'
import {
  DEFAULT_GRANT_KIND,
  GRANTS_PATH,
  GRANT_DAY_SUGGESTIONS,
  GRANT_FIELDS,
  GRANT_KINDS,
  initialGrantFormState,
  isGrantKind,
  type GrantFormState,
} from './contract'

/**
 * Write a temporary Pro grant.
 *
 * ---------------------------------------------------------------------------
 * THE LENGTH FIELD HAS NO BOUNDS ON IT, ON PURPOSE
 * ---------------------------------------------------------------------------
 *
 * `admin_entitlement_grants_days_range` in migration 0019 decides how long a
 * grant may be. Putting `min={1} max={365}` on this input would put a second
 * copy of that rule in the browser, where it would keep working — and keep
 * being wrong — the day finance changes the constraint. So the input accepts
 * any whole number, the four durations an operator actually types are offered
 * as a datalist, and a value the database refuses comes back as a field error
 * saying it was refused. The screen reports the rule; it does not restate it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE OPERATOR IS TOLD BEFORE THEY SUBMIT
 * ---------------------------------------------------------------------------
 *
 * That a free month is a real cost, that the reason is kept and attributable,
 * that the expiry is computed on the server from its own clock — a
 * `datetime-local` that silently lands three hours out is worse than no field
 * at all — and that an account cannot hold two overlapping grants. Each of
 * those is a rule the database enforces; saying so here means the refusal, when
 * it comes, is not a surprise.
 *
 * The account is named by id, not by address. This console does not resolve
 * addresses to accounts: a form that accepted one would be a search over other
 * people's mailboxes wearing a different hat.
 */

export interface GrantFormProps {
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  /** Pre-filled when arriving from a user record. */
  initialUserId?: string
  /** `MIN_REASON_LENGTH` / `MAX_REASON_LENGTH` from `@/lib/admin-action`. */
  minReasonLength: number
  maxReasonLength: number
}

export function GrantForm({
  csrf,
  initialUserId = '',
  minReasonLength,
  maxReasonLength,
}: GrantFormProps) {
  const [state, formAction] = useActionState<GrantFormState, FormData>(
    grantEntitlementAction,
    initialGrantFormState,
  )
  const [reason, setReason] = useState('')
  const [kind, setKind] = useState<string>(DEFAULT_GRANT_KIND)

  const baseId = useId()
  const userId = `${baseId}-user`
  const kindId = `${baseId}-kind`
  const daysId = `${baseId}-days`
  const ticketId = `${baseId}-ticket`
  const reasonId = `${baseId}-reason`
  const daysListId = `${baseId}-days-list`

  const issue = (field: string): string | null => state.issues[field] ?? null
  const trimmedReason = reason.trim()
  const reasonLocalError =
    trimmedReason.length === 0 || trimmedReason.length >= minReasonLength
      ? null
      : `Gerekçe en az ${minReasonLength} karakter olmalıdır.`

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name={csrf.name} value={csrf.value} />

      <Field
        htmlFor={userId}
        label={grantMessages.form.userLabel}
        description={grantMessages.form.userDescription}
        error={issue(GRANT_FIELDS.userId)}
        required
      >
        <Input
          id={userId}
          name={GRANT_FIELDS.userId}
          defaultValue={initialUserId}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={grantMessages.form.userPlaceholder}
          className="max-w-md font-mono"
          {...fieldControlProps(userId, {
            description: true,
            error: issue(GRANT_FIELDS.userId),
          })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          htmlFor={kindId}
          label={grantMessages.form.kindLabel}
          description={
            isGrantKind(kind) ? grantKindHints[kind] : grantMessages.form.kindDescription
          }
          error={issue(GRANT_FIELDS.kind)}
          required
        >
          <Select
            id={kindId}
            name={GRANT_FIELDS.kind}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value)
            }}
            {...fieldControlProps(kindId, {
              description: true,
              error: issue(GRANT_FIELDS.kind),
            })}
          >
            {GRANT_KINDS.map((value) => (
              <option key={value} value={value}>
                {grantKindLabels[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          htmlFor={daysId}
          label={grantMessages.form.daysLabel}
          description={grantMessages.form.daysDescription}
          error={issue(GRANT_FIELDS.days)}
          required
        >
          <Input
            id={daysId}
            name={GRANT_FIELDS.days}
            type="number"
            step={1}
            inputMode="numeric"
            list={daysListId}
            required
            autoComplete="off"
            className="max-w-40 tabular-nums"
            {...fieldControlProps(daysId, {
              description: true,
              error: issue(GRANT_FIELDS.days),
            })}
          />
          <datalist id={daysListId} aria-label={grantMessages.form.daysListLabel}>
            {GRANT_DAY_SUGGESTIONS.map((days) => (
              <option key={days} value={days} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field
        htmlFor={ticketId}
        label={grantMessages.form.ticketLabel}
        description={grantMessages.form.ticketDescription}
        error={issue(GRANT_FIELDS.ticketId)}
      >
        <Input
          id={ticketId}
          name={GRANT_FIELDS.ticketId}
          autoComplete="off"
          spellCheck={false}
          placeholder={grantMessages.form.ticketPlaceholder}
          className="max-w-md font-mono"
          {...fieldControlProps(ticketId, {
            description: true,
            error: issue(GRANT_FIELDS.ticketId),
          })}
        />
      </Field>

      <Field
        htmlFor={reasonId}
        label={grantMessages.form.reasonLabel}
        description={grantMessages.form.reasonDescription(minReasonLength)}
        error={issue(GRANT_FIELDS.reason) ?? reasonLocalError}
        required
        meta={`${trimmedReason.length} / ${minReasonLength}`}
      >
        <Textarea
          id={reasonId}
          name={GRANT_FIELDS.reason}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
          }}
          rows={3}
          required
          minLength={minReasonLength}
          maxLength={maxReasonLength}
          placeholder={grantMessages.form.reasonPlaceholder}
          {...fieldControlProps(reasonId, {
            description: true,
            error: issue(GRANT_FIELDS.reason) ?? reasonLocalError,
          })}
        />
      </Field>

      <p className="max-w-prose rounded-md bg-surface2 px-3 py-2 text-[11px] text-muted">
        {grantMessages.form.previewNote} {grantMessages.form.overlapNote}
      </p>

      {state.status === 'error' && state.message !== null ? (
        <p
          role="alert"
          className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <GrantSubmit />
        <Link
          href={GRANTS_PATH}
          className="inline-flex h-8 items-center rounded-md border border-hairline px-4 text-[13px] font-medium text-muted hover:text-ink"
        >
          {grantMessages.form.cancel}
        </Link>
      </div>
    </form>
  )
}

function GrantSubmit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="md" variant="primary" disabled={pending}>
      {pending ? grantMessages.form.submitting : grantMessages.form.submit}
    </Button>
  )
}
