'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, fieldControlProps } from '@/components/ui/field'
import { createAnnouncementAction, updateAnnouncementAction } from '@/lib/actions/announcements'
import {
  AUDIENCE_LABELS_TR,
  LOCALE_LABELS_TR,
  PLATFORM_LABELS_TR,
  announcementMessages,
} from '@/lib/messages/announcements'
import { AnnouncementPreview } from './AnnouncementPreview'
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_FIELDS,
  ANNOUNCEMENT_LOCALES,
  ANNOUNCEMENT_PLATFORMS,
  BODY_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  initialAnnouncementFormState,
  isPlatformAudience,
  type AnnouncementAudienceValue,
  type AnnouncementDraft,
  type AnnouncementFormState,
  type AnnouncementLocaleValue,
  type AnnouncementPlatformValue,
} from './contract'

/**
 * Compose or correct an announcement.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A CLIENT COMPONENT
 * ---------------------------------------------------------------------------
 *
 * Two reasons, and neither of them is validation. The first is the preview: the
 * point of a preview is that it moves while you type, and a server round trip
 * per keystroke is not a preview. The second is rendering what the Server
 * Action hands back — a message under the control that caused it, rather than a
 * page-level "bir hata oluştu" that loses the paragraph the operator wrote.
 *
 * Everything that matters happens on the server. The permission is checked
 * against `admin_role_permissions` and then asked again of the database at the
 * moment of writing, the values are parsed by a Zod schema that mirrors the
 * table's own constraints, and the write itself carries `published_at is null`
 * so a draft that went live while this form was open cannot be silently
 * rewritten. The `maxLength` and `disabled` attributes below are a courtesy so
 * an operator is told before they submit; they are not the check.
 *
 * ---------------------------------------------------------------------------
 * THE PLATFORM BOXES DISABLE THEMSELVES, AND SAY WHY
 * ---------------------------------------------------------------------------
 *
 * `announcements_one_platform_filter` refuses a row that filters by platform
 * twice — an `ios` audience *and* a `platforms` array. Rather than let an
 * operator fill both and meet a constraint violation, the boxes grey out with
 * the sentence that explains it the moment the audience becomes a platform.
 * The schema refuses the same combination, and Postgres refuses it after that.
 */

export interface AnnouncementFormProps {
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  mode: 'create' | 'edit'
  /** Present in edit mode: the row being corrected. */
  announcementId?: string
  initial: AnnouncementDraft
  /** Where "vazgeç" goes. */
  cancelHref: string
}

export function AnnouncementForm({
  csrf,
  mode,
  announcementId,
  initial,
  cancelHref,
}: AnnouncementFormProps) {
  const [state, formAction] = useActionState<AnnouncementFormState, FormData>(
    mode === 'create' ? createAnnouncementAction : updateAnnouncementAction,
    initialAnnouncementFormState,
  )

  /**
   * Every field is controlled, and that is not a style preference.
   *
   * React resets an uncontrolled `<form action={…}>` once the action settles.
   * On the success path that is right — the operator is being navigated away.
   * On a validation failure it would wipe the nine fields they filled in to
   * report a problem with one of them, which is the exact behaviour the state
   * this action returns exists to avoid. State-driven values survive the reset.
   */
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [audience, setAudience] = useState<AnnouncementAudienceValue>(initial.audience)
  const [locale, setLocale] = useState<AnnouncementLocaleValue>(initial.locale)
  const [platforms, setPlatforms] = useState<readonly AnnouncementPlatformValue[]>(
    initial.platforms,
  )
  const [minVersion, setMinVersion] = useState(initial.minAppVersion)
  const [startsAt, setStartsAt] = useState(initial.startsAtLocal)
  const [endsAt, setEndsAt] = useState(initial.endsAtLocal)
  const [dismissible, setDismissible] = useState(initial.dismissible)

  function togglePlatform(platform: AnnouncementPlatformValue, checked: boolean): void {
    setPlatforms((current) =>
      checked
        ? current.includes(platform)
          ? current
          : [...current, platform]
        : current.filter((value) => value !== platform),
    )
  }

  const baseId = useId()
  const ids = {
    title: `${baseId}-title`,
    body: `${baseId}-body`,
    audience: `${baseId}-audience`,
    locale: `${baseId}-locale`,
    minVersion: `${baseId}-min-version`,
    startsAt: `${baseId}-starts`,
    endsAt: `${baseId}-ends`,
  }

  const issue = (field: string): string | null => state.issues[field] ?? null
  const platformsLocked = isPlatformAudience(audience)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <form action={formAction} className="flex min-w-0 flex-col gap-4">
        <input type="hidden" name={csrf.name} value={csrf.value} />
        {mode === 'edit' && announcementId !== undefined ? (
          <input type="hidden" name={ANNOUNCEMENT_FIELDS.announcementId} value={announcementId} />
        ) : null}

        <Field
          htmlFor={ids.title}
          label={announcementMessages.form.titleLabel}
          description={announcementMessages.form.titleDescription}
          error={issue(ANNOUNCEMENT_FIELDS.title)}
          required
          meta={`${title.length} / ${TITLE_MAX_LENGTH}`}
        >
          <Input
            id={ids.title}
            name={ANNOUNCEMENT_FIELDS.title}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
            }}
            required
            maxLength={TITLE_MAX_LENGTH}
            placeholder={announcementMessages.form.titlePlaceholder}
            {...fieldControlProps(ids.title, {
              description: true,
              error: issue(ANNOUNCEMENT_FIELDS.title),
            })}
          />
        </Field>

        <Field
          htmlFor={ids.body}
          label={announcementMessages.form.bodyLabel}
          description={announcementMessages.form.bodyDescription}
          error={issue(ANNOUNCEMENT_FIELDS.body)}
          required
          meta={`${body.length} / ${BODY_MAX_LENGTH}`}
        >
          <Textarea
            id={ids.body}
            name={ANNOUNCEMENT_FIELDS.body}
            value={body}
            onChange={(event) => {
              setBody(event.target.value)
            }}
            rows={5}
            required
            maxLength={BODY_MAX_LENGTH}
            placeholder={announcementMessages.form.bodyPlaceholder}
            {...fieldControlProps(ids.body, {
              description: true,
              error: issue(ANNOUNCEMENT_FIELDS.body),
            })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            htmlFor={ids.audience}
            label={announcementMessages.form.audienceLabel}
            description={announcementMessages.form.audienceDescription}
            error={issue(ANNOUNCEMENT_FIELDS.audience)}
            required
          >
            <Select
              id={ids.audience}
              name={ANNOUNCEMENT_FIELDS.audience}
              value={audience}
              onChange={(event) => {
                setAudience(event.target.value as AnnouncementAudienceValue)
              }}
              {...fieldControlProps(ids.audience, {
                description: true,
                error: issue(ANNOUNCEMENT_FIELDS.audience),
              })}
            >
              {ANNOUNCEMENT_AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {AUDIENCE_LABELS_TR[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            htmlFor={ids.locale}
            label={announcementMessages.form.localeLabel}
            description={announcementMessages.form.localeDescription}
            error={issue(ANNOUNCEMENT_FIELDS.locale)}
            required
          >
            <Select
              id={ids.locale}
              name={ANNOUNCEMENT_FIELDS.locale}
              value={locale}
              onChange={(event) => {
                setLocale(event.target.value as AnnouncementLocaleValue)
              }}
              {...fieldControlProps(ids.locale, {
                description: true,
                error: issue(ANNOUNCEMENT_FIELDS.locale),
              })}
            >
              {ANNOUNCEMENT_LOCALES.map((value) => (
                <option key={value} value={value}>
                  {LOCALE_LABELS_TR[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-1" disabled={platformsLocked}>
          <legend className="text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
            {announcementMessages.form.platformsLabel}
          </legend>
          <p className="text-[11px] text-faint">
            {platformsLocked
              ? announcementMessages.form.platformConflict
              : announcementMessages.form.platformsDescription}
          </p>

          <ul className="mt-1 flex flex-wrap gap-2">
            {ANNOUNCEMENT_PLATFORMS.map((platform) => (
              <li key={platform}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-md border border-hairline px-3 py-1.5 text-[13px] transition-colors hover:border-primary/40 ${
                    platformsLocked ? 'cursor-not-allowed opacity-55' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    name={ANNOUNCEMENT_FIELDS.platform}
                    value={platform}
                    checked={platforms.includes(platform)}
                    onChange={(event) => {
                      togglePlatform(platform, event.target.checked)
                    }}
                    className="size-3.5 accent-primary"
                  />
                  <span className="text-ink">{PLATFORM_LABELS_TR[platform]}</span>
                </label>
              </li>
            ))}
          </ul>

          {issue(ANNOUNCEMENT_FIELDS.platform) === null ? null : (
            <p role="alert" className="text-[11px] font-medium text-critical-text">
              {issue(ANNOUNCEMENT_FIELDS.platform)}
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            htmlFor={ids.startsAt}
            label={announcementMessages.form.startsLabel}
            description={announcementMessages.form.startsDescription}
            error={issue(ANNOUNCEMENT_FIELDS.startsAt)}
            required
          >
            <Input
              id={ids.startsAt}
              name={ANNOUNCEMENT_FIELDS.startsAt}
              type="datetime-local"
              value={startsAt}
              onChange={(event) => {
                setStartsAt(event.target.value)
              }}
              required
              {...fieldControlProps(ids.startsAt, {
                description: true,
                error: issue(ANNOUNCEMENT_FIELDS.startsAt),
              })}
            />
          </Field>

          <Field
            htmlFor={ids.endsAt}
            label={announcementMessages.form.endsLabel}
            description={announcementMessages.form.endsDescription}
            error={issue(ANNOUNCEMENT_FIELDS.endsAt)}
          >
            <Input
              id={ids.endsAt}
              name={ANNOUNCEMENT_FIELDS.endsAt}
              type="datetime-local"
              value={endsAt}
              onChange={(event) => {
                setEndsAt(event.target.value)
              }}
              {...fieldControlProps(ids.endsAt, {
                description: true,
                error: issue(ANNOUNCEMENT_FIELDS.endsAt),
              })}
            />
          </Field>
        </div>

        <Field
          htmlFor={ids.minVersion}
          label={announcementMessages.form.minVersionLabel}
          description={announcementMessages.form.minVersionDescription}
          error={issue(ANNOUNCEMENT_FIELDS.minVersion)}
          className="max-w-xs"
        >
          <Input
            id={ids.minVersion}
            name={ANNOUNCEMENT_FIELDS.minVersion}
            value={minVersion}
            onChange={(event) => {
              setMinVersion(event.target.value)
            }}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder={announcementMessages.form.minVersionPlaceholder}
            className="font-mono"
            {...fieldControlProps(ids.minVersion, {
              description: true,
              error: issue(ANNOUNCEMENT_FIELDS.minVersion),
            })}
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-hairline px-3 py-2">
          <input
            type="checkbox"
            name={ANNOUNCEMENT_FIELDS.dismissible}
            checked={dismissible}
            onChange={(event) => {
              setDismissible(event.target.checked)
            }}
            className="mt-0.5 size-3.5 accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-ink">
              {announcementMessages.form.dismissibleLabel}
            </span>
            <span className="block text-[11px] text-faint">
              {announcementMessages.form.dismissibleDescription}
            </span>
          </span>
        </label>

        {state.status === 'error' && state.message !== null ? (
          <p
            role="alert"
            className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton mode={mode} />
          <Button asChild size="md" variant="secondary">
            <Link href={cancelHref}>{announcementMessages.form.cancel}</Link>
          </Button>
        </div>
      </form>

      <aside className="flex min-w-0 flex-col gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">
            {announcementMessages.preview.title}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted">
            {announcementMessages.preview.description}
          </p>
        </div>
        <AnnouncementPreview
          title={title}
          body={body}
          dismissible={dismissible}
          published={false}
          layout="stacked"
        />
      </aside>
    </div>
  )
}

function SubmitButton({ mode }: { mode: 'create' | 'edit' }) {
  const { pending } = useFormStatus()
  const label =
    mode === 'create'
      ? pending
        ? announcementMessages.form.submitCreating
        : announcementMessages.form.submitCreate
      : pending
        ? announcementMessages.form.submitSaving
        : announcementMessages.form.submitSave

  return (
    <Button type="submit" size="md" variant="primary" disabled={pending}>
      {label}
    </Button>
  )
}
