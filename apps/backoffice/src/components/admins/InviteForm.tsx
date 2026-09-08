'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, fieldControlProps } from '@/components/ui/field'
import { inviteAdminAction } from '@/lib/actions/admins'
import { formatDateTime } from '@/lib/format'
import { adminMessages } from '@/lib/messages/admins'
import type { AdminRole } from '@/lib/permissions'
import {
  ADMINS_PATH,
  ADMIN_EMAIL_MAX,
  DEFAULT_INVITE_TTL_DAYS,
  INVITE_FIELDS,
  INVITE_TTL_DAYS,
  ROLES_PATH,
  initialAdminFormState,
} from './contract'

/**
 * The invite form, and the one place the plaintext token is ever shown.
 *
 * ---------------------------------------------------------------------------
 * THE TOKEN APPEARS ONCE
 * ---------------------------------------------------------------------------
 *
 * `inviteAdminAction` generates the token in the server process, writes only its
 * SHA-256 to `admin_invites.token_hash`, and returns the plaintext in the form
 * state — to this component and to nothing else. It is not in the redirect, not
 * in an audit detail, not in a log line, and not readable back: `@/lib/db` puts
 * `token_hash` on its unreadable-column list and refuses a `select *` on the
 * table, so no screen and no query in this console can produce it again.
 *
 * That means the panel below is genuinely the only copy, and it says so in the
 * operator's own language rather than hinting at it. If the tab is closed, the
 * remedy is to revoke the invite and issue a new one, which is stated too.
 *
 * ---------------------------------------------------------------------------
 * THE VALIDATION HERE IS A COURTESY
 * ---------------------------------------------------------------------------
 *
 * `type="email"`, `maxLength` and the disabled button stop nobody who can post
 * a form. The Server Action re-checks the session, the CSRF token, the
 * permission, every field and the written reason; `@da/validation`'s
 * `emailSchema` decides whether the address is well-formed; and 0019's
 * `admin_invites_email_shape`, its expiry check and its one-live-invite-per-
 * address index re-check after that.
 */

export interface InviteRoleOption {
  readonly role: AdminRole
  readonly label: string
  readonly description: string
}

export function InviteForm({
  options,
  csrf,
  minReasonLength,
  maxReasonLength,
}: {
  options: readonly InviteRoleOption[]
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  minReasonLength: number
  maxReasonLength: number
}) {
  const [state, formAction] = useActionState(inviteAdminAction, initialAdminFormState)

  const baseId = useId()
  const emailId = `${baseId}-email`
  const roleId = `${baseId}-role`
  const ttlId = `${baseId}-ttl`
  const reasonId = `${baseId}-reason`

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>(options[0]?.role ?? '')
  const [ttl, setTtl] = useState(String(DEFAULT_INVITE_TTL_DAYS))
  const [reason, setReason] = useState('')

  const issue = (field: string): string | null => state.issues[field] ?? null

  if (state.status === 'success' && state.issuedToken !== undefined) {
    return (
      <IssuedToken
        token={state.issuedToken}
        email={state.issuedEmail ?? ''}
        expiresAt={state.issuedExpiresAt ?? ''}
      />
    )
  }

  const selected = options.find((option) => option.role === role) ?? null
  const trimmedReason = reason.trim()
  const reasonLocalError =
    trimmedReason.length === 0 || trimmedReason.length >= minReasonLength
      ? null
      : `Gerekçe en az ${minReasonLength} karakter olmalıdır.`

  const ready =
    email.trim() !== '' &&
    role !== '' &&
    trimmedReason.length >= minReasonLength &&
    trimmedReason.length <= maxReasonLength

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name={csrf.name} value={csrf.value} />

      {state.status === 'error' && state.message !== null ? (
        <p
          role="alert"
          className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
        >
          {state.message}
        </p>
      ) : null}

      <Field
        htmlFor={emailId}
        label={adminMessages.invite.emailLabel}
        description={adminMessages.invite.emailHint}
        error={issue(INVITE_FIELDS.email)}
        required
      >
        <Input
          id={emailId}
          name={INVITE_FIELDS.email}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
          }}
          maxLength={ADMIN_EMAIL_MAX}
          autoComplete="off"
          spellCheck={false}
          placeholder={adminMessages.invite.emailPlaceholder}
          required
          {...fieldControlProps(emailId, {
            description: true,
            error: issue(INVITE_FIELDS.email),
          })}
        />
      </Field>

      <Field
        htmlFor={roleId}
        label={adminMessages.invite.roleLabel}
        description={selected?.description ?? adminMessages.invite.roleHint}
        error={issue(INVITE_FIELDS.role)}
        required
      >
        <Select
          id={roleId}
          name={INVITE_FIELDS.role}
          value={role}
          onChange={(event) => {
            setRole(event.target.value)
          }}
          required
          {...fieldControlProps(roleId, { description: true, error: issue(INVITE_FIELDS.role) })}
        >
          {options.map((option) => (
            <option key={option.role} value={option.role}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        htmlFor={ttlId}
        label={adminMessages.invite.ttlLabel}
        description={adminMessages.invite.ttlHint}
        error={issue(INVITE_FIELDS.ttlDays)}
        required
      >
        <Select
          id={ttlId}
          name={INVITE_FIELDS.ttlDays}
          value={ttl}
          onChange={(event) => {
            setTtl(event.target.value)
          }}
          {...fieldControlProps(ttlId, { description: true, error: issue(INVITE_FIELDS.ttlDays) })}
        >
          {INVITE_TTL_DAYS.map((days) => (
            <option key={days} value={String(days)}>
              {adminMessages.invite.ttlOption(days)}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        htmlFor={reasonId}
        label={adminMessages.invite.reasonLabel}
        description={adminMessages.invite.reasonHint}
        error={issue(INVITE_FIELDS.reason) ?? reasonLocalError}
        required
        meta={String(Math.max(0, maxReasonLength - reason.length))}
      >
        <Textarea
          id={reasonId}
          name={INVITE_FIELDS.reason}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
          }}
          rows={3}
          maxLength={maxReasonLength}
          placeholder={adminMessages.invite.reasonPlaceholder}
          required
          {...fieldControlProps(reasonId, {
            description: true,
            error: issue(INVITE_FIELDS.reason) ?? reasonLocalError,
          })}
        />
      </Field>

      <div className="flex items-center gap-2">
        <SubmitButton ready={ready} />
        <Button asChild variant="ghost" size="md">
          <Link href={ADMINS_PATH}>{adminMessages.invite.cancel}</Link>
        </Button>
        <Link
          href={ROLES_PATH}
          className="ml-auto text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
        >
          {adminMessages.list.rolesLink}
        </Link>
      </div>
    </form>
  )
}

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="md" variant="primary" disabled={!ready || pending}>
      {pending ? adminMessages.invite.submitting : adminMessages.invite.submit}
    </Button>
  )
}

/**
 * The token, once.
 *
 * Rendered as selectable monospace text rather than behind a "copy" button that
 * needs the clipboard API: the operator can see exactly what they are about to
 * send, and a failed clipboard write cannot silently leave them with nothing.
 */
function IssuedToken({
  token,
  email,
  expiresAt,
}: {
  token: string
  email: string
  expiresAt: string
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="rounded-md border border-warning bg-warning-soft px-3 py-2.5">
        <p className="text-[13px] font-semibold text-warning-text">
          {adminMessages.invite.tokenTitle}
        </p>
        <p className="mt-1 text-[12px] text-warning-text/90">{adminMessages.invite.tokenBody}</p>
      </div>

      <div className="bo-panel px-3 py-2.5">
        <p className="bo-kicker">{adminMessages.invite.tokenLabel}</p>
        <p className="mt-1 font-mono text-[13px] break-all text-ink select-all">{token}</p>
        <p className="mt-2 text-[11px] text-faint">
          {adminMessages.invite.tokenFor(email)}
          {expiresAt === ''
            ? null
            : ` · ${adminMessages.invite.tokenExpires(formatDateTime(expiresAt))}`}
        </p>
      </div>

      <p className="text-[12px] text-muted">{adminMessages.invite.tokenLost}</p>

      <div className="flex items-center gap-2">
        <Button asChild variant="secondary" size="md">
          <Link href={ADMINS_PATH}>{adminMessages.invite.backToList}</Link>
        </Button>
      </div>
    </div>
  )
}
