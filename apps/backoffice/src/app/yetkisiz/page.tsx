import type { Metadata } from 'next'
import Link from 'next/link'
import { signOutAction } from '@/app/session-actions'
import { readStaffSession } from '@/lib/auth'
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
  const reason = typeof params['neden'] === 'string' ? params['neden'] : null
  const requiredRole = typeof params['gerekli'] === 'string' ? params['gerekli'] : null

  const session = await readStaffSession()
  const identity =
    session.kind === 'staff'
      ? (session.session.email ?? session.session.userId)
      : session.kind === 'not_staff' || session.kind === 'disabled'
        ? (session.user.email ?? session.user.id)
        : null

  const body =
    reason === 'rol' ? messages.auth.unauthorizedRoleBody : messages.auth.unauthorizedBody

  const requiredLabel =
    requiredRole === 'admin' || requiredRole === 'ops' || requiredRole === 'support'
      ? messages.roles[requiredRole]
      : null

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="bo-panel w-full max-w-md p-6">
        <span className="bo-kicker">403</span>
        <h1 className="mt-1 text-[16px] font-semibold text-ink">
          {messages.auth.unauthorizedTitle}
        </h1>
        <p className="mt-1 text-[13px] text-muted">{body}</p>

        {requiredLabel ? (
          <p className="mt-2 text-[12px] text-muted">
            <span className="bo-kicker mr-1">{messages.fields.role}</span>
            {requiredLabel}
          </p>
        ) : null}

        {reason === 'askida' ? (
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
          {reason === 'rol' ? (
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
