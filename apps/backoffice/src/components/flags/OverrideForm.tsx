'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, fieldControlProps } from '@/components/ui/field'
import { setFlagOverrideAction } from '@/lib/actions/flags'
import { flagMessages } from '@/lib/messages/flags'
import {
  BOOLEAN_FALSE,
  BOOLEAN_TRUE,
  DEFAULT_OVERRIDE_DURATION_DAYS,
  OVERRIDE_DURATION_DAYS,
  OVERRIDE_FIELDS,
  initialFlagFormState,
  type FlagFormState,
} from './contract'

/**
 * Pin one account to one value.
 *
 * ---------------------------------------------------------------------------
 * WHY THE REASON AND THE EXPIRY ARE BOTH ASKED FOR
 * ---------------------------------------------------------------------------
 *
 * `feature_flag_overrides.reason` is NOT NULL in the schema, and the comment on
 * the table says why: an override that outlives its investigation is how a
 * "50% rollout" quietly becomes something else, and the reason is what makes a
 * stale one obvious to whoever finds it. The expiry is the other half — a pin
 * with a duration stops mattering on its own, and `admin_cleanup_expired()`
 * removes it a week later.
 *
 * The duration is a select rather than a date field on purpose: the operator's
 * browser and the server do not share a timezone, and the instant is computed
 * server-side from the injected clock, so an expiry cannot land three hours
 * away from where it looked.
 *
 * The account is named by id, not by address. This console does not resolve
 * addresses to accounts — the id is what a user record shows, and a support
 * screen that accepted an address would be a search over other people's
 * mailboxes.
 */

export interface OverrideFormProps {
  flagId: string
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  /** Pre-filled when arriving from a user record. */
  initialUserId?: string
  /** `MIN_REASON_LENGTH` / `MAX_REASON_LENGTH` from `@/lib/admin-action`. */
  minReasonLength: number
  maxReasonLength: number
}

export function OverrideForm({
  flagId,
  csrf,
  initialUserId = '',
  minReasonLength,
  maxReasonLength,
}: OverrideFormProps) {
  const [state, formAction] = useActionState<FlagFormState, FormData>(
    setFlagOverrideAction,
    initialFlagFormState,
  )
  const [reason, setReason] = useState('')

  const baseId = useId()
  const userId = `${baseId}-user`
  const valueId = `${baseId}-value`
  const durationId = `${baseId}-duration`
  const reasonId = `${baseId}-reason`

  const issue = (field: string): string | null => state.issues[field] ?? null
  const trimmedReason = reason.trim()
  const reasonLocalError =
    trimmedReason.length === 0 || trimmedReason.length >= minReasonLength
      ? null
      : `Gerekçe en az ${minReasonLength} karakter olmalıdır.`

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name={csrf.name} value={csrf.value} />
      <input type="hidden" name={OVERRIDE_FIELDS.flagId} value={flagId} />

      <Field
        htmlFor={userId}
        label={flagMessages.overrides.userLabel}
        description={flagMessages.overrides.userDescription}
        error={issue(OVERRIDE_FIELDS.userId)}
        required
      >
        <Input
          id={userId}
          name={OVERRIDE_FIELDS.userId}
          defaultValue={initialUserId}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={flagMessages.overrides.userPlaceholder}
          className="max-w-md font-mono"
          {...fieldControlProps(userId, {
            description: true,
            error: issue(OVERRIDE_FIELDS.userId),
          })}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          htmlFor={valueId}
          label={flagMessages.overrides.valueLabel}
          description={flagMessages.overrides.valueDescription}
          error={issue(OVERRIDE_FIELDS.enabled)}
          required
        >
          <Select
            id={valueId}
            name={OVERRIDE_FIELDS.enabled}
            defaultValue={BOOLEAN_TRUE}
            {...fieldControlProps(valueId, {
              description: true,
              error: issue(OVERRIDE_FIELDS.enabled),
            })}
          >
            <option value={BOOLEAN_TRUE}>{flagMessages.overrides.valueOn}</option>
            <option value={BOOLEAN_FALSE}>{flagMessages.overrides.valueOff}</option>
          </Select>
        </Field>

        <Field
          htmlFor={durationId}
          label={flagMessages.overrides.durationLabel}
          description={flagMessages.overrides.durationDescription}
          error={issue(OVERRIDE_FIELDS.durationDays)}
          required
        >
          <Select
            id={durationId}
            name={OVERRIDE_FIELDS.durationDays}
            defaultValue={String(DEFAULT_OVERRIDE_DURATION_DAYS)}
            {...fieldControlProps(durationId, {
              description: true,
              error: issue(OVERRIDE_FIELDS.durationDays),
            })}
          >
            {OVERRIDE_DURATION_DAYS.map((days) => (
              <option key={days} value={days}>
                {flagMessages.overrides.durationOption(days)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        htmlFor={reasonId}
        label={flagMessages.overrides.reasonLabel}
        description={flagMessages.form.reasonDescription(minReasonLength)}
        error={issue(OVERRIDE_FIELDS.reason) ?? reasonLocalError}
        required
        meta={`${trimmedReason.length} / ${minReasonLength}`}
      >
        <Textarea
          id={reasonId}
          name={OVERRIDE_FIELDS.reason}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
          }}
          rows={2}
          required
          minLength={minReasonLength}
          maxLength={maxReasonLength}
          placeholder={flagMessages.overrides.reasonPlaceholder}
          {...fieldControlProps(reasonId, {
            description: true,
            error: issue(OVERRIDE_FIELDS.reason) ?? reasonLocalError,
          })}
        />
      </Field>

      {state.status === 'error' && state.message !== null ? (
        <p
          role="alert"
          className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === 'success' && state.message !== null ? (
        <p
          role="status"
          className="rounded-md bg-success-soft px-3 py-2 text-[12px] text-success-text"
        >
          {state.message}
        </p>
      ) : null}

      <OverrideSubmit />
    </form>
  )
}

function OverrideSubmit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="md" variant="primary" disabled={pending} className="self-start">
      {pending ? flagMessages.overrides.submitting : flagMessages.overrides.submit}
    </Button>
  )
}
