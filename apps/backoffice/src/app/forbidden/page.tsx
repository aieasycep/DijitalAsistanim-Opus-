import type { Metadata } from 'next'
import Link from 'next/link'
import { signOutAction } from '@/app/session-actions'
import { readStaffSession } from '@/lib/auth'
import { DENIAL_NEEDED_PARAM, DENIAL_REASON_PARAM } from '@/lib/session-cookies'
import {
  DENIAL_MESSAGES_TR,
  PERMISSION_LABELS_TR,
  isAccessDenialReason,
  isAdminPermission,
} from '@/lib/permissions'
import { messages } from '@/lib/messages'

export const metadata: Metadata = { title: messages.auth.unauthorizedTitle }
export const dynamic = 'force-dynamic'

/**
 * Where `requireStaff()` sends an authenticated user who is not authorised.
 *
 * It is a separate page from sign-in because the remedy is different: signing
 * in again will not help someone with no `staff_members` row. The page names
 * the account so the operator can tell they are signed in as the wrong one, and
 * offers the only two useful actions — sign out, or go back if their tier is
 * simply too low for the page they tried.
 */
export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  // These two keys are the ones `refuse()` in auth.ts actually sends. The page
  // used to read `neden` and `gerekli`, the names from an earlier pass, and
  // compared them against `'rol'` and the old `admin`/`ops`/`support` tiers —
  // so every value failed to match and the page fell through to the generic
  // body every single time. A 403 that cannot say what it wanted sends the
  // operator to ask somebody, which is the whole cost of getting this wrong.
  const reasonParam = typeof params[DENIAL_REASON_PARAM] === 'string' ? params['reason'] : null
  const reason = reasonParam !== null && isAccessDenialReason(reasonParam) ? reasonParam : null

  // `needed` is comma-joined when the requirement was `anyOf`, so more than one
  // name here means any one of them would have been enough.
  const needed = (typeof params[DENIAL_NEEDED_PARAM] === 'string' ? params['needed'] : '')
    .split(',')
    .map((name) => name.trim())
    .filter(isAdminPermission)

  const session = await readStaffSession()
  const identity =
    session.kind === 'staff'
      ? (session.session.email ?? session.session.userId)
      : session.kind === 'not_staff' || session.kind === 'disabled'
        ? (session.user.email ?? session.user.id)
        : null

  // The denial's own sentence, from the same table `decideAccess` denials are
  // described by everywhere else, so the page and the audit row cannot disagree
  // about why somebody was turned away.
  const body = reason === null ? messages.auth.unauthorizedBody : DENIAL_MESSAGES_TR[reason]

  // What to do about it, which differs by reason: a missing permission is
  // somebody else's to grant, a missing console account needs a record created.
  const remedy =
    reason === 'permission_denied'
      ? messages.auth.unauthorizedRoleBody
      : reason === 'not_admin'
        ? messages.auth.unauthorizedBody
        : null

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="bo-panel w-full max-w-md p-6">
        <span className="bo-kicker">403</span>
        <h1 className="mt-1 text-[16px] font-semibold text-ink">
          {messages.auth.unauthorizedTitle}
        </h1>
        <p className="mt-1 text-[13px] text-muted">{body}</p>

        {remedy !== null && remedy !== body ? (
          <p className="mt-2 text-[13px] text-muted">{remedy}</p>
        ) : null}

        {needed.length > 0 ? (
          <p className="mt-2 text-[12px] text-muted">
            <span className="bo-kicker mr-1">
              {needed.length > 1
                ? messages.auth.neededAnyPermission
                : messages.auth.neededPermission}
            </span>
            {needed.map((permission) => PERMISSION_LABELS_TR[permission]).join(' · ')}
          </p>
        ) : null}

        {reason === 'admin_disabled' ? (
          <p className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
            {messages.auth.disabled}
          </p>
        ) : null}

        {identity ? (
          <p className="mt-3 text-[12px] text-faint">
            <span className="bo-kicker mr-1">{messages.nav.signedInAs}</span>
            {identity}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {reason === 'permission_denied' ? (
            <Link
              href="/"
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
            >
              {messages.auth.backToOverview}
            </Link>
          ) : null}
          <form action={signOutAction}>
            <button
              type="submit"
              className="h-8 rounded-md border border-hairline px-3 text-[13px] font-medium text-muted hover:text-ink"
            >
              {messages.nav.signOut}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
