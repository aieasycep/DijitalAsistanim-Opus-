'use server'

import { isAppError } from '@da/domain'
import { emailSchema } from '@da/validation'
import { redirect } from 'next/navigation'
import { recordSignInDenied, recordStaffAction, writeAudit } from '@/lib/audit'
import {
  SIGN_IN_PATH,
  challengeMfaFactor,
  clearSession,
  completeMfaSignIn,
  readStaffSession,
  signInAdmin,
  signOutAdmin,
  type AdminSignInOutcome,
} from '@/lib/auth'
import { revokeSession } from '@/lib/db'
import { messages } from '@/lib/messages'
import {
  CREDENTIALS_ATTEMPT,
  SIGN_IN_FIELDS,
  SIGN_IN_RESTART,
  initialSignInState,
  resolveSignInOutcome,
  signInError,
  signInMfaState,
  signInRefusalState,
  type SignInAttempt,
  type SignInFactorOption,
  type SignInResolution,
  type SignInState,
  type SignInStep,
} from '@/lib/sign-in-state'

/**
 * The Server Actions that move a console session in or out of existence.
 *
 * ---------------------------------------------------------------------------
 * EVERY CHECK IS IN `signInAdmin()`, NOT HERE
 * ---------------------------------------------------------------------------
 *
 * The rate limiter (two buckets, hashed address and hashed client IP), the
 * password check, the `admin_users` resolution and `BACKOFFICE_MFA_POLICY` all
 * live behind one call, so there is no way to assemble a sign-in from this file
 * that skips one of them. What is left here is side effects: the audit row, the
 * TOTP challenge and the redirect. Which sentence each outcome produces is
 * decided in `@/lib/sign-in-state`, which is pure and tested.
 *
 * ---------------------------------------------------------------------------
 * WHAT LANDS IN `audit_logs`
 * ---------------------------------------------------------------------------
 *
 * A successful sign-in writes `admin.signed_in` with the admin as actor. A
 * refusal that names an account writes `auth.admin_sign_in_denied` with no
 * actor at all — the whole point of that row is that the account is not an
 * administrator, so naming one would be a false attribution.
 *
 * Two refusals deliberately write nothing. A wrong password and a rate-limited
 * attempt are both producible by anyone who can reach the form, and the limiter
 * counts every attempt past its ceiling, so a row each would let an anonymous
 * caller grow the trail without bound while naming nobody. Neither carries a
 * subject to record either. `signInAdmin()` and `finishSignIn()` write no audit
 * rows of their own, so nothing here is a second copy.
 */

// ===========================================================================
// Signing in
// ===========================================================================

export async function signInAction(
  previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const resolution = await runSignInStep(previous, formData)

  // Outside every try block: `redirect` signals by throwing, and a catch would
  // swallow it and report a failed sign-in that actually succeeded.
  if (resolution.kind === 'signed_in') redirect('/')
  return resolution.state
}

async function runSignInStep(previous: SignInState, formData: FormData): Promise<SignInResolution> {
  const attempt = attemptFrom(previous, formData)

  if (field(formData, SIGN_IN_FIELDS.intent) === SIGN_IN_RESTART) {
    return { kind: 'state', state: await abandonAttempt() }
  }

  try {
    return attempt.step === 'mfa'
      ? await submitMfaCode(attempt, formData)
      : await submitCredentials(attempt, formData)
  } catch (error) {
    // `signInAdmin()` answers a refused sign-in with an outcome, so anything
    // thrown from here is infrastructure: GoTrue unreachable, PostgREST down, a
    // missing environment variable. None of that is the operator's fault and
    // none of it should read as "wrong password".
    const message =
      isAppError(error) && error.code === 'rate_limited'
        ? messages.auth.rateLimited
        : messages.auth.unavailable
    return { kind: 'state', state: signInError(stepState(attempt), message) }
  }
}

async function submitCredentials(
  attempt: SignInAttempt,
  formData: FormData,
): Promise<SignInResolution> {
  const email = field(formData, SIGN_IN_FIELDS.email).trim()
  const password = field(formData, SIGN_IN_FIELDS.password)

  if (email === '' || password === '') {
    return { kind: 'state', state: signInError(initialSignInState, messages.auth.missingFields) }
  }

  const parsedEmail = emailSchema.safeParse(email)
  if (!parsedEmail.success) {
    // Refused through the same mapping a wrong password goes through, and for
    // the same reason: a distinct "that address does not exist" reply would
    // turn the form into an account-existence oracle. One call site, one
    // sentence, no second author to keep in step.
    return {
      kind: 'state',
      state: signInRefusalState({ status: 'invalid_credentials' }, CREDENTIALS_ATTEMPT),
    }
  }

  const outcome = await signInAdmin({ email: parsedEmail.data, password })
  return settle(outcome, attempt)
}

async function submitMfaCode(
  attempt: SignInAttempt,
  formData: FormData,
): Promise<SignInResolution> {
  const code = field(formData, SIGN_IN_FIELDS.code).trim()
  const factorId = attempt.factorId

  if (factorId === null || factorId === '') {
    // The form posted the MFA step without naming a factor, which is a session
    // that has lost its first half rather than a code the operator got wrong.
    return { kind: 'state', state: signInError(initialSignInState, messages.auth.sessionExpired) }
  }
  if (code === '') {
    return {
      kind: 'state',
      state: signInError(signInMfaState(attempt), messages.auth.mfaCodeRequired),
    }
  }

  const challenge = await challengeMfaFactor(factorId)
  if (challenge === null) {
    // The access cookie the password step wrote is gone — expired, or cleared
    // in another tab. There is nothing to verify a code against any more.
    return { kind: 'state', state: signInError(initialSignInState, messages.auth.sessionExpired) }
  }

  const outcome = await completeMfaSignIn({
    factorId,
    challengeId: challenge.challengeId,
    code,
  })
  return settle(outcome, attempt)
}

/** Record the outcome, then turn it into what the form shows next. */
async function settle(
  outcome: AdminSignInOutcome,
  attempt: SignInAttempt,
): Promise<SignInResolution> {
  await recordOutcome(outcome, attempt.step)
  return resolveSignInOutcome(outcome, attempt)
}

async function recordOutcome(outcome: AdminSignInOutcome, step: SignInStep): Promise<void> {
  switch (outcome.status) {
    case 'signed_in':
      await writeAudit({
        actor: { adminUserId: outcome.adminUserId },
        action: 'admin.signed_in',
        entityType: 'admin_user',
        entityId: outcome.adminUserId,
      })
      return

    case 'not_admin':
      // Recorded as `not_staff`, which is how every existing row in the trail
      // spells this refusal. A second name for one fact would split every
      // "who was refused" query in two.
      await recordSignInDenied(outcome.authUserId, 'not_staff')
      return

    case 'mfa_enrolment_required':
      // No subject: the outcome deliberately carries no identifier, and the row
      // still records that the policy refused a sign-in at this moment. Reaching
      // it needs a correct password for an active admin, so it cannot be
      // produced in volume by somebody guessing.
      await recordSignInDenied(null, 'mfa_failed')
      return

    case 'invalid_credentials':
      if (step === 'mfa') await recordSignInDenied(null, 'mfa_failed')
      return

    case 'mfa_required':
    case 'rate_limited':
      return
  }
}

/**
 * Abandon a half-finished sign-in.
 *
 * At the MFA and enrolment steps the password has already been accepted and
 * GoTrue cookies are in the browser. Clearing them server-side is what makes
 * "start over" a control that does something rather than a link back to a form
 * the browser is already past.
 */
async function abandonAttempt(): Promise<SignInState> {
  try {
    await signOutAdmin('Yönetici girişi tamamlanmadan bırakıldı')
  } catch {
    // The cookies are cleared on the way through; a failed upstream revoke is
    // not worth keeping the operator on a step they asked to leave.
  }
  return initialSignInState
}

/**
 * What the submitted form was answering.
 *
 * The step and the factor come from the form itself rather than from the
 * previous state, because React hands an action the *initial* state when a form
 * is submitted before hydration. The factor list can only come from the state,
 * so `sign-in-state.ts` rebuilds a single-entry list from the factor id when it
 * arrives empty.
 */
function attemptFrom(previous: SignInState, formData: FormData): SignInAttempt {
  if (field(formData, SIGN_IN_FIELDS.step) !== 'mfa') return CREDENTIALS_ATTEMPT
  const posted = field(formData, SIGN_IN_FIELDS.factorId)
  const offered = offeredFactors(previous)
  const factorId =
    posted !== '' && (offered.length === 0 || offered.some((factor) => factor.id === posted))
      ? posted
      : (offered[0]?.id ?? null)
  return { step: 'mfa', factors: offered, factorId }
}

/**
 * The factors the previous step offered.
 *
 * That state travels to the browser and back with the form, so it is data
 * rather than a guarantee. Nothing is decided from it — GoTrue is what says
 * whether a factor belongs to the account, and it refuses one that does not —
 * but it is read defensively so a hand-written post renders a form instead of a
 * stack trace.
 */
function offeredFactors(previous: SignInState): readonly SignInFactorOption[] {
  const factors: unknown = previous.factors
  return Array.isArray(factors) ? previous.factors : []
}

/** The step the operator is on, with nothing wrong with it yet. */
function stepState(attempt: SignInAttempt): SignInState {
  return attempt.step === 'mfa' ? signInMfaState(attempt) : initialSignInState
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

// ===========================================================================
// Signing out
// ===========================================================================

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
