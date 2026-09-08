import 'server-only'

import { AppError, isAppError, systemClock, type Clock } from '@da/domain'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  findStaffMember,
  verifyAccessToken,
  type AuthenticatedUser,
  type StaffMemberRecord,
  type StaffRole,
  type StaffSessionTokens,
} from './db'
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE,
  SIGN_IN_PATH,
  UNAUTHORIZED_PATH,
  sessionCookieOptions,
} from './session-cookies'

/**
 * Staff identity for the backoffice. Deny by default, everywhere.
 *
 * There are exactly two ways in: `requireStaff()` for a Server Component or a
 * Server Action that must have an operator, and `readStaffSession()` for the
 * handful of places that need to render differently for a signed-out visitor
 * (the sign-in page, the unauthorised page, the shell's header). Every other
 * caller gets a redirect rather than a null, so a page cannot forget to check.
 *
 * A session is only a session when all three hold:
 *   1. the access-token cookie verifies against GoTrue,
 *   2. that user has a row in `staff_members`,
 *   3. the row's `disabled_at` is null.
 *
 * Any failure is a redirect, never a partially rendered page.
 */

// Re-exported so a page importing the gate also gets the routes it redirects
// to, without reaching into the edge-safe module directly.
export { SIGN_IN_PATH, UNAUTHORIZED_PATH }

/** Least to most privileged. Higher rank implies every lower capability. */
const ROLE_RANK: Readonly<Record<StaffRole, number>> = Object.freeze({
  support: 1,
  ops: 2,
  admin: 3,
})

export function roleRank(role: StaffRole): number {
  return ROLE_RANK[role]
}

export function roleSatisfies(actual: StaffRole, minimum: StaffRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum]
}

export interface StaffSession {
  userId: string
  /**
   * The operator's own address, unredacted. This is the one full address the
   * backoffice ever renders, and it belongs to the person reading the screen —
   * it is how they confirm which account they are signed in as. No user's
   * address is ever shown, at any tier.
   */
  email: string | null
  role: StaffRole
  member: StaffMemberRecord
}

/**
 * Why a request has no usable staff session. The caller turns this into either
 * a sign-in redirect or the unauthorised page — they are different pages
 * because they need different remedies.
 */
export type SessionDenial =
  | { kind: 'no_session' }
  | { kind: 'not_staff'; user: AuthenticatedUser }
  | { kind: 'disabled'; user: AuthenticatedUser }
  | { kind: 'unavailable'; code: string }

export type SessionResult = { kind: 'staff'; session: StaffSession } | SessionDenial

/**
 * Resolve the current staff session without redirecting.
 *
 * Used by the sign-in and unauthorised pages, which must render for a visitor
 * who has no session at all, and by the shell header.
 */
export async function readStaffSession(): Promise<SessionResult> {
  const store = await cookies()
  const accessToken = store.get(ACCESS_COOKIE)?.value
  if (!accessToken) return { kind: 'no_session' }

  try {
    const user = await verifyAccessToken(accessToken)
    if (!user) return { kind: 'no_session' }

    const member = await findStaffMember(user.id)
    if (!member) return { kind: 'not_staff', user }
    if (member.disabledAt !== null) return { kind: 'disabled', user }

    return {
      kind: 'staff',
      session: { userId: user.id, email: user.email, role: member.role, member },
    }
  } catch (error) {
    // A configuration or infrastructure failure must not read as "signed out":
    // that would send an operator into a sign-in loop during an outage.
    const code = isAppError(error) ? error.code : 'unknown'
    return { kind: 'unavailable', code }
  }
}

/**
 * The gate every protected Server Component and Server Action calls first.
 *
 * Redirects rather than throwing, so a page body never runs without an
 * operator. `minimumRole` defaults to `support`, the lowest tier: a page that
 * needs more must say so explicitly.
 */
export async function requireStaff(minimumRole: StaffRole = 'support'): Promise<StaffSession> {
  const result = await readStaffSession()

  if (result.kind === 'staff') {
    if (!roleSatisfies(result.session.role, minimumRole)) {
      redirect(`${UNAUTHORIZED_PATH}?neden=rol&gerekli=${minimumRole}`)
    }
    return result.session
  }

  if (result.kind === 'not_staff') redirect(`${UNAUTHORIZED_PATH}?neden=yetki`)
  if (result.kind === 'disabled') redirect(`${UNAUTHORIZED_PATH}?neden=askida`)

  if (result.kind === 'unavailable') {
    // Surfaced by the nearest error boundary, which renders a real message.
    // Deliberately not a sign-in redirect: an outage is not a signed-out user,
    // and treating it as one loops an operator through a form that cannot work.
    throw new AppError('server_unavailable', {
      detail: `staff session unavailable: ${result.code}`,
      retryable: true,
    })
  }

  redirect(SIGN_IN_PATH)
}

/**
 * The Server Action variant. Actions cannot redirect a client that is mid-POST
 * as cleanly as a page can, and they need to return a message the form renders,
 * so this throws a typed error instead of redirecting.
 */
export async function requireStaffAction(
  minimumRole: StaffRole = 'support',
): Promise<StaffSession> {
  const result = await readStaffSession()
  if (result.kind === 'staff') {
    if (!roleSatisfies(result.session.role, minimumRole)) {
      throw new AppError('forbidden', {
        detail: `role ${result.session.role} < ${minimumRole}`,
        status: 403,
      })
    }
    return result.session
  }
  if (result.kind === 'unavailable') {
    throw new AppError('server_unavailable', { detail: result.code, retryable: true })
  }
  throw new AppError('unauthorized', { detail: result.kind, status: 401 })
}

/** Writes the session cookies. Only a Server Action may call this. */
export async function establishSession(
  tokens: StaffSessionTokens,
  clock: Clock = systemClock,
): Promise<void> {
  const store = await cookies()
  const nowSeconds = Math.floor(clock.now().getTime() / 1000)
  const accessLifetime =
    tokens.expiresAt > nowSeconds
      ? Math.min(tokens.expiresAt - nowSeconds, ACCESS_COOKIE_MAX_AGE)
      : ACCESS_COOKIE_MAX_AGE

  store.set(ACCESS_COOKIE, tokens.accessToken, sessionCookieOptions(accessLifetime))
  store.set(REFRESH_COOKIE, tokens.refreshToken, sessionCookieOptions(REFRESH_COOKIE_MAX_AGE))
}

/** Removes the session cookies. Only a Server Action may call this. */
export async function clearSession(): Promise<string | null> {
  const store = await cookies()
  const refreshToken = store.get(REFRESH_COOKIE)?.value ?? null
  store.set(ACCESS_COOKIE, '', sessionCookieOptions(0))
  store.set(REFRESH_COOKIE, '', sessionCookieOptions(0))
  return refreshToken
}

/**
 * Every tier, least privileged first. Used to render a role picker in the
 * order the ranking actually implies, so a form cannot offer them out of order.
 */
export function roleOrderedList(): readonly StaffRole[] {
  return ['support', 'ops', 'admin']
}
