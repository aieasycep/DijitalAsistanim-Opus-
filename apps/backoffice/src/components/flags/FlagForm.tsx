'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, fieldControlProps } from '@/components/ui/field'
import { createFlagAction, updateFlagTargetingAction } from '@/lib/actions/flags'
import { flagMessages, flagPlanLabels, flagPlatformLabels } from '@/lib/messages/flags'
import {
  BOOLEAN_FALSE,
  BOOLEAN_TRUE,
  FLAG_DESCRIPTION_MAX,
  FLAG_DESCRIPTION_MIN,
  FLAG_FIELDS,
  FLAG_KEY_MAX,
  FLAG_PLANS,
  FLAG_PLATFORMS,
  ROLLOUT_MAX,
  ROLLOUT_MIN,
  deriveState,
  initialFlagFormState,
  type FlagFormState,
  type FlagPlan,
  type FlagPlatform,
} from './contract'
import { describeAudience } from './presentation'
import { StateBadge } from './StateBadge'

/**
 * The create and edit form for a flag's targeting.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A CLIENT COMPONENT
 * ---------------------------------------------------------------------------
 *
 * Two reasons, both about telling the operator the truth before they commit.
 * The first is the per-field error the Server Action hands back, rendered under
 * the input that caused it rather than as "bir şeyler yanlış" over nine fields.
 * The second is the preview: this form decides who sees a feature, and the line
 * under it restates the choices as the evaluator will read them — "%25 · iOS ·
 * Pro · tüm sürümler" — while they are still being made.
 *
 * The preview is `deriveState` and `describeAudience`, the same pure functions
 * the read-only screens use, so the sentence before the save and the sentence
 * after it are produced by one piece of code. Neither is the evaluator:
 * `feature_flag_is_enabled()` is, in Postgres, and this form only edits the
 * record it reads.
 *
 * ---------------------------------------------------------------------------
 * THE VALIDATION HERE IS A COURTESY
 * ---------------------------------------------------------------------------
 *
 * `minLength`, `pattern` and the disabled button stop nobody who can post a
 * form. The Server Action re-checks the session, the CSRF token, the
 * permission, every field and the written reason, and the database re-checks
 * the key shape, the version shape and the percentage range after that.
 */

export interface FlagFormValues {
  readonly key: string
  readonly description: string
  readonly enabled: boolean
  readonly rolloutPercentage: number
  readonly platforms: readonly string[]
  readonly plans: readonly string[]
  readonly minAppVersion: string | null
  readonly maxAppVersion: string | null
  /** Shown in the preview; not editable here — the kill switch is its own action. */
  readonly killSwitch: boolean
}

export interface FlagFormProps {
  mode: 'create' | 'edit'
  /** Required in edit mode; ignored when creating. */
  flagId?: string
  values: FlagFormValues
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  /** `MIN_REASON_LENGTH` / `MAX_REASON_LENGTH` from `@/lib/admin-action`. */
  minReasonLength: number
  maxReasonLength: number
}

export function FlagForm({
  mode,
  flagId,
  values,
  csrf,
  minReasonLength,
  maxReasonLength,
}: FlagFormProps) {
  const [state, formAction] = useActionState<FlagFormState, FormData>(
    mode === 'create' ? createFlagAction : updateFlagTargetingAction,
    initialFlagFormState,
  )

  const [description, setDescription] = useState(values.description)
  const [enabled, setEnabled] = useState(values.enabled)
  const [rollout, setRollout] = useState(String(values.rolloutPercentage))
  const [platforms, setPlatforms] = useState<readonly string[]>(values.platforms)
  const [plans, setPlans] = useState<readonly string[]>(values.plans)
  const [minVersion, setMinVersion] = useState(values.minAppVersion ?? '')
  const [maxVersion, setMaxVersion] = useState(values.maxAppVersion ?? '')
  const [reason, setReason] = useState('')

  const baseId = useId()
  const keyId = `${baseId}-key`
  const descriptionId = `${baseId}-description`
  const enabledId = `${baseId}-enabled`
  const rolloutId = `${baseId}-rollout`
  const minId = `${baseId}-min`
  const maxId = `${baseId}-max`
  const reasonId = `${baseId}-reason`

  const issue = (field: string): string | null => state.issues[field] ?? null

  const parsedRollout = Number(rollout)
  const previewRollout = Number.isFinite(parsedRollout)
    ? Math.min(ROLLOUT_MAX, Math.max(ROLLOUT_MIN, Math.trunc(parsedRollout)))
    : 0

  const preview = {
    enabled,
    kill_switch: values.killSwitch,
    rollout_percentage: previewRollout,
    platforms,
    plans,
    min_app_version: minVersion === '' ? null : minVersion,
    max_app_version: maxVersion === '' ? null : maxVersion,
  }

  const trimmedReason = reason.trim()
  const reasonLocalError =
    trimmedReason.length === 0 || trimmedReason.length >= minReasonLength
      ? null
      : `Gerekçe en az ${minReasonLength} karakter olmalıdır.`

  function toggleMember(
    current: readonly string[],
    value: string,
    checked: boolean,
  ): readonly string[] {
    const next = new Set(current)
    if (checked) next.add(value)
    else next.delete(value)
    return [...next]
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name={csrf.name} value={csrf.value} />
      {mode === 'edit' && flagId !== undefined ? (
        <input type="hidden" name={FLAG_FIELDS.flagId} value={flagId} />
      ) : null}

      {mode === 'create' ? (
        <Field
          htmlFor={keyId}
          label={flagMessages.form.keyLabel}
          description={flagMessages.form.keyDescription}
          error={issue(FLAG_FIELDS.key)}
          required
        >
          <Input
            id={keyId}
            name={FLAG_FIELDS.key}
            defaultValue={values.key}
            required
            maxLength={FLAG_KEY_MAX}
            autoComplete="off"
            spellCheck={false}
            placeholder={flagMessages.form.keyPlaceholder}
            className="max-w-md font-mono"
            {...fieldControlProps(keyId, { description: true, error: issue(FLAG_FIELDS.key) })}
          />
        </Field>
      ) : (
        <div>
          <span className="bo-kicker">{flagMessages.form.keyLabel}</span>
          <p className="mt-0.5 font-mono text-[13px] text-ink">{values.key}</p>
          <p className="mt-0.5 text-[11px] text-faint">{flagMessages.form.keyDescription}</p>
        </div>
      )}

      <Field
        htmlFor={descriptionId}
        label={flagMessages.form.descriptionLabel}
        description={flagMessages.form.descriptionDescription}
        error={issue(FLAG_FIELDS.description)}
        required
        meta={`${description.trim().length} / ${FLAG_DESCRIPTION_MIN}`}
      >
        <Textarea
          id={descriptionId}
          name={FLAG_FIELDS.description}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
          }}
          rows={2}
          required
          minLength={FLAG_DESCRIPTION_MIN}
          maxLength={FLAG_DESCRIPTION_MAX}
          placeholder={flagMessages.form.descriptionPlaceholder}
          {...fieldControlProps(descriptionId, {
            description: true,
            error: issue(FLAG_FIELDS.description),
          })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          htmlFor={enabledId}
          label={flagMessages.form.enabledLabel}
          description={flagMessages.form.enabledDescription}
          error={issue(FLAG_FIELDS.enabled)}
          required
        >
          <Select
            id={enabledId}
            name={FLAG_FIELDS.enabled}
            value={enabled ? BOOLEAN_TRUE : BOOLEAN_FALSE}
            onChange={(event) => {
              setEnabled(event.target.value === BOOLEAN_TRUE)
            }}
            {...fieldControlProps(enabledId, {
              description: true,
              error: issue(FLAG_FIELDS.enabled),
            })}
          >
            <option value={BOOLEAN_FALSE}>{flagMessages.form.enabledOff}</option>
            <option value={BOOLEAN_TRUE}>{flagMessages.form.enabledOn}</option>
          </Select>
        </Field>

        <Field
          htmlFor={rolloutId}
          label={flagMessages.form.rolloutLabel}
          description={flagMessages.form.rolloutDescription}
          error={issue(FLAG_FIELDS.rollout)}
          required
          meta={`%${previewRollout}`}
        >
          <Input
            id={rolloutId}
            name={FLAG_FIELDS.rollout}
            type="number"
            inputMode="numeric"
            min={ROLLOUT_MIN}
            max={ROLLOUT_MAX}
            step={1}
            value={rollout}
            onChange={(event) => {
              setRollout(event.target.value)
            }}
            required
            className="max-w-28 tabular-nums"
            {...fieldControlProps(rolloutId, {
              description: true,
              error: issue(FLAG_FIELDS.rollout),
            })}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="bo-kicker">{flagMessages.form.platformsLabel}</legend>
          <p className="text-[11px] text-faint">{flagMessages.form.platformsDescription}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {FLAG_PLATFORMS.map((platform: FlagPlatform) => (
              <label
                key={platform}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-primary/40 hover:bg-surface2/50"
              >
                <input
                  type="checkbox"
                  name={FLAG_FIELDS.platform}
                  value={platform}
                  checked={platforms.includes(platform)}
                  onChange={(event) => {
                    setPlatforms(toggleMember(platforms, platform, event.target.checked))
                  }}
                  className="size-3.5 accent-primary"
                />
                {flagPlatformLabels[platform]}
              </label>
            ))}
          </div>
          {issue(FLAG_FIELDS.platform) === null ? null : (
            <p role="alert" className="text-[11px] font-medium text-critical-text">
              {issue(FLAG_FIELDS.platform)}
            </p>
          )}
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="bo-kicker">{flagMessages.form.plansLabel}</legend>
          <p className="text-[11px] text-faint">{flagMessages.form.plansDescription}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {FLAG_PLANS.map((plan: FlagPlan) => (
              <label
                key={plan}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-primary/40 hover:bg-surface2/50"
              >
                <input
                  type="checkbox"
                  name={FLAG_FIELDS.plan}
                  value={plan}
                  checked={plans.includes(plan)}
                  onChange={(event) => {
                    setPlans(toggleMember(plans, plan, event.target.checked))
                  }}
                  className="size-3.5 accent-primary"
                />
                {flagPlanLabels[plan]}
              </label>
            ))}
          </div>
          {issue(FLAG_FIELDS.plan) === null ? null : (
            <p role="alert" className="text-[11px] font-medium text-critical-text">
              {issue(FLAG_FIELDS.plan)}
            </p>
          )}
        </fieldset>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          htmlFor={minId}
          label={flagMessages.form.minVersionLabel}
          description={flagMessages.form.versionDescription}
          error={issue(FLAG_FIELDS.minVersion)}
        >
          <Input
            id={minId}
            name={FLAG_FIELDS.minVersion}
            value={minVersion}
            onChange={(event) => {
              setMinVersion(event.target.value)
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="1.4.0"
            className="max-w-36 font-mono"
            {...fieldControlProps(minId, {
              description: true,
              error: issue(FLAG_FIELDS.minVersion),
            })}
          />
        </Field>

        <Field
          htmlFor={maxId}
          label={flagMessages.form.maxVersionLabel}
          description={flagMessages.form.versionDescription}
          error={issue(FLAG_FIELDS.maxVersion)}
        >
          <Input
            id={maxId}
            name={FLAG_FIELDS.maxVersion}
            value={maxVersion}
            onChange={(event) => {
              setMaxVersion(event.target.value)
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="2.0.0"
            className="max-w-36 font-mono"
            {...fieldControlProps(maxId, {
              description: true,
              error: issue(FLAG_FIELDS.maxVersion),
            })}
          />
        </Field>
      </div>

      {minVersion !== '' || maxVersion !== '' ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-[11px] text-warning-text">
          {flagMessages.form.versionNeedsAppVersion}
        </p>
      ) : null}

      <div className="rounded-md border border-hairline bg-surface2/40 px-3 py-2">
        <span className="bo-kicker">{flagMessages.form.previewLabel}</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StateBadge state={deriveState(preview)} />
          <span className="text-[12px] text-ink">{describeAudience(preview).join(' · ')}</span>
        </div>
      </div>

      <Field
        htmlFor={reasonId}
        label={flagMessages.form.reasonLabel}
        description={flagMessages.form.reasonDescription(minReasonLength)}
        error={issue(FLAG_FIELDS.reason) ?? reasonLocalError}
        required
        meta={`${trimmedReason.length} / ${minReasonLength}`}
      >
        <Textarea
          id={reasonId}
          name={FLAG_FIELDS.reason}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
          }}
          rows={3}
          required
          minLength={minReasonLength}
          maxLength={maxReasonLength}
          placeholder={flagMessages.form.reasonPlaceholder}
          {...fieldControlProps(reasonId, {
            description: true,
            error: issue(FLAG_FIELDS.reason) ?? reasonLocalError,
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

      <SubmitButton
        label={mode === 'create' ? flagMessages.form.submitCreate : flagMessages.form.submitEdit}
      />
    </form>
  )
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="md" variant="primary" disabled={pending} className="self-start">
      {pending ? flagMessages.form.submitting : label}
    </Button>
  )
}
