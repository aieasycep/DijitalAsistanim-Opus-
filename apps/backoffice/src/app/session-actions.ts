'use server'

import { isAppError } from '@da/domain'
import { emailSchema } from '@da/validation'
import { redirect } from 'next/navigation'
import { recordSignInDenied, recordStaffAction } from '@/lib/audit'
import { SIGN_IN_PATH, clearSession, establishSession, readStaffSession } from '@/lib/auth'
import { findStaffMember, revokeSession, signInWithPassword } from '@/lib/db'
import { messages } from '@/lib/messages'
import type { SignInState } from '@/lib/sign-in-state'

/**
 * The two Server Actions that move a staff session in or out of existence.
 *
 * Both write an `audit_logs` row. A refused sign-in is recorded too, with
 * `actor: system` rather than `actor: staff` — the whole point of that row is
 * that the account was not staff, so it must not appear in the trail as if a
 * staff member had acted.
 *
 * A `'use server'` module may export nothing but async functions, so the form's
 * initial state lives in `@/lib/sign-in-state`.
 */

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const rawEmail = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (rawEmail === '' || password === '') {
    return { error: messages.auth.missingFields }
  }

  const parsedEmail = emailSchema.safeParse(rawEmail)
  if (!parsedEmail.success) {
    // Deliberately the same message as a wrong password: a distinct "no such
    // address" reply would turn the form into an account-existence oracle.
    return { error: messages.auth.invalidCredentials }
  }

  try {
    const result = await signInWithPassword(parsedEmail.data, password)
    if (!result) return { error: messages.auth.invalidCredentials }

    const member = await findStaffMember(result.user.id)
    if (!member) {
      await recordSignInDenied(result.user.id, 'not_staff')
      return { error: messages.auth.notStaff }
    }
    if (member.disabledAt !== null) {
      await recordSignInDenied(result.user.id, 'disabled')
      return { error: messages.auth.disabled }
    }

    await establishSession(result.tokens)
    await recordStaffAction({
      actor: { userId: member.userId, role: member.role },
      action: 'staff.signed_in',
      subjectUserId: member.userId,
      entityType: 'staff_member',
      entityId: member.userId,
      reason: 'Backoffice oturumu açıldı',
    })
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === 'rate_limited') return { error: messages.auth.rateLimited }
      return { error: messages.auth.unavailable }
    }
    return { error: messages.auth.unavailable }
  }

  // Outside the try block: `redirect` signals by throwing, and a catch would
  // swallow it and report a failed sign-in that actually succeeded.
  redirect('/')
}

export async function signOutAction(): Promise<void> {
  const result = await readStaffSession()

  if (result.kind === 'staff') {
    await recordStaffAction({
      actor: { userId: result.session.userId, role: result.session.role },
      action: 'staff.signed_out',
      subjectUserId: result.session.userId,
      entityType: 'staff_member',
      entityId: result.session.userId,
      reason: 'Backoffice oturumu kapatıldı',
    })
  }

  const refreshToken = await clearSession()
  if (refreshToken) {
    try {
      await revokeSession(refreshToken)
    } catch {
      // The cookies are already gone, so the operator is signed out of this
      // browser either way. A failed server-side revoke is not worth blocking
      // the redirect for; the token expires on its own.
    }
  }

  redirect(SIGN_IN_PATH)
}
