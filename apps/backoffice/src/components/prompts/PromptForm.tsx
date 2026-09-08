'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea, fieldControlProps } from '@/components/ui/field'
import { createPromptDraftAction, updatePromptDraftAction } from '@/lib/actions/prompts'
import { promptMessages } from '@/lib/messages/prompts'
import {
  BODY_MAX,
  BODY_MIN,
  FEATURE_MAX,
  MODEL_MAX,
  NOTES_MAX,
  PROMPT_FIELDS,
  initialPromptFormState,
  versionLabel,
  type PromptFormState,
} from './contract'

/**
 * The composer, for a new draft and for editing one.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A CLIENT COMPONENT
 * ---------------------------------------------------------------------------
 *
 * Two reasons, both about telling the operator the truth before they commit. The
 * first is the per-field error the Server Action hands back, rendered under the
 * input that caused it rather than as "bir şeyler yanlış" over a form whose main
 * field is four hundred words long. The second is the length counter: the body
 * has a floor and a ceiling, and finding out about either after a submit that
 * discarded the text would be the worst possible moment.
 *
 * ---------------------------------------------------------------------------
 * SAVING IS NOT PUBLISHING, AND THE FORM NEVER IMPLIES IT IS
 * ---------------------------------------------------------------------------
 *
 * There is no activate control here and no "kaydet ve yayına al" checkbox. The
 * Server Action writes `status: 'draft'` whatever the form says. Activation is a
 * separate decision, made on the version's own page against a diff, and it
 * demands a written reason.
 *
 * ---------------------------------------------------------------------------
 * THE VALIDATION HERE IS A COURTESY
 * ---------------------------------------------------------------------------
 *
 * `minLength`, `maxLength` and `pattern` stop nobody who can post a form. The
 * Server Action re-checks the session, the CSRF token, the permission and every
 * field, and `prompt_versions_feature_shape`, `prompt_versions_body_not_blank`
 * and `prompt_versions_unique_version` re-check after that.
 */

export interface PromptFormValues {
  readonly feature: string
  readonly model: string
  readonly notes: string
  readonly body: string
}

export interface PromptFormProps {
  mode: 'create' | 'edit'
  /** Required in edit mode; ignored when creating. */
  promptId?: string
  values: PromptFormValues
  /**
   * The number this draft will take, when it can be known before the write.
   * Advisory: `prompt_versions_unique_version` is what decides, and the label
   * says so.
   */
  nextVersion?: number | null
  /** Set in edit mode: the version being edited already has its number. */
  currentVersion?: number | null
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  cancelHref: string
  /** Shown above the fields when the body was copied from another version. */
  copiedFrom?: string | null
  /** Shown when a `?from=` parameter named a version that could not be read. */
  copyMissing?: boolean
}

export function PromptForm({
  mode,
  promptId,
  values,
  nextVersion = null,
  currentVersion = null,
  csrf,
  cancelHref,
  copiedFrom = null,
  copyMissing = false,
}: PromptFormProps) {
  const [state, formAction] = useActionState<PromptFormState, FormData>(
    mode === 'create' ? createPromptDraftAction : updatePromptDraftAction,
    initialPromptFormState,
  )

  const [feature, setFeature] = useState(values.feature)
  const [model, setModel] = useState(values.model)
  const [notes, setNotes] = useState(values.notes)
  const [body, setBody] = useState(values.body)

  const baseId = useId()
  const featureId = `${baseId}-feature`
  const modelId = `${baseId}-model`
  const notesId = `${baseId}-notes`
  const bodyId = `${baseId}-body`

  const issue = (name: string): string | null => state.issues[name] ?? null

  const trimmedBody = body.trim()
  const bodyLocalError =
    trimmedBody.length === 0 || trimmedBody.length >= BODY_MIN
      ? null
      : promptMessages.form.bodyTooShort(BODY_MIN)

  const versionText =
    mode === 'edit' && currentVersion !== null
      ? versionLabel(currentVersion)
      : nextVersion === null
        ? promptMessages.form.versionUnknown
        : `${versionLabel(nextVersion)} · ${promptMessages.form.versionUnknown}`

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name={csrf.name} value={csrf.value} />
      {mode === 'edit' && promptId !== undefined ? (
        <input type="hidden" name={PROMPT_FIELDS.promptId} value={promptId} />
      ) : null}

      {copyMissing ? (
        <p
          role="alert"
          className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text"
        >
          {promptMessages.form.copyMissing}
        </p>
      ) : null}

      {copiedFrom === null ? null : (
        <p className="rounded-md bg-info-soft px-3 py-2 text-[12px] text-info-text">{copiedFrom}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === 'create' ? (
          <Field
            htmlFor={featureId}
            label={promptMessages.form.featureLabel}
            description={promptMessages.form.featureDescription}
            error={issue(PROMPT_FIELDS.feature)}
            required
          >
            <Input
              id={featureId}
              name={PROMPT_FIELDS.feature}
              value={feature}
              onChange={(event) => {
                setFeature(event.target.value)
              }}
              required
              maxLength={FEATURE_MAX}
              autoComplete="off"
              spellCheck={false}
              placeholder={promptMessages.form.featurePlaceholder}
              className="font-mono"
              {...fieldControlProps(featureId, {
                description: true,
                error: issue(PROMPT_FIELDS.feature),
              })}
            />
          </Field>
        ) : (
          <div>
            <span className="bo-kicker">{promptMessages.form.featureLabel}</span>
            <p className="mt-0.5 font-mono text-[13px] text-ink">{values.feature}</p>
            <p className="mt-0.5 text-[11px] text-faint">{promptMessages.form.featureLocked}</p>
          </div>
        )}

        <div>
          <span className="bo-kicker">{promptMessages.form.versionLabel}</span>
          <p className="mt-0.5 font-mono text-[13px] text-ink">{versionText}</p>
          <p className="mt-0.5 text-[11px] text-faint">{promptMessages.form.versionDescription}</p>
        </div>
      </div>

      <Field
        htmlFor={modelId}
        label={promptMessages.form.modelLabel}
        description={promptMessages.form.modelDescription}
        error={issue(PROMPT_FIELDS.model)}
      >
        <Input
          id={modelId}
          name={PROMPT_FIELDS.model}
          value={model}
          onChange={(event) => {
            setModel(event.target.value)
          }}
          maxLength={MODEL_MAX}
          autoComplete="off"
          spellCheck={false}
          placeholder={promptMessages.form.modelPlaceholder}
          className="max-w-sm font-mono"
          {...fieldControlProps(modelId, { description: true, error: issue(PROMPT_FIELDS.model) })}
        />
      </Field>

      <Field
        htmlFor={bodyId}
        label={promptMessages.form.bodyLabel}
        description={promptMessages.form.bodyDescription}
        error={issue(PROMPT_FIELDS.body) ?? bodyLocalError}
        required
        meta={promptMessages.form.lengthMeta(trimmedBody.length, BODY_MIN)}
      >
        <Textarea
          id={bodyId}
          name={PROMPT_FIELDS.body}
          value={body}
          onChange={(event) => {
            setBody(event.target.value)
          }}
          rows={20}
          required
          maxLength={BODY_MAX}
          spellCheck={false}
          placeholder={promptMessages.form.bodyPlaceholder}
          className="font-mono text-[12px] leading-5"
          {...fieldControlProps(bodyId, {
            description: true,
            error: issue(PROMPT_FIELDS.body) ?? bodyLocalError,
          })}
        />
      </Field>

      <Field
        htmlFor={notesId}
        label={promptMessages.form.notesLabel}
        description={promptMessages.form.notesDescription}
        error={issue(PROMPT_FIELDS.notes)}
        meta={`${notes.trim().length} / ${NOTES_MAX}`}
      >
        <Textarea
          id={notesId}
          name={PROMPT_FIELDS.notes}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value)
          }}
          rows={3}
          maxLength={NOTES_MAX}
          placeholder={promptMessages.form.notesPlaceholder}
          {...fieldControlProps(notesId, { description: true, error: issue(PROMPT_FIELDS.notes) })}
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

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          label={
            mode === 'create' ? promptMessages.form.submitCreate : promptMessages.form.submitEdit
          }
        />
        <Link
          href={cancelHref}
          className="inline-flex h-8 items-center rounded-md border border-hairline px-3 text-[13px] font-medium text-muted hover:text-ink"
        >
          {promptMessages.form.cancel}
        </Link>
      </div>
    </form>
  )
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="md" variant="primary" disabled={pending}>
      {pending ? promptMessages.form.submitting : label}
    </Button>
  )
}
