import type { AdminSignInOutcome, MfaFactorSummary } from './auth.ts'
import { messages } from './messages.ts'

/**
 * What the sign-in form is showing, and the one place an `AdminSignInOutcome`
 * is turned into it.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MAPPING LIVES HERE AND NOT IN THE ACTION
 * ---------------------------------------------------------------------------
 *
 * `signInAdmin()` and `completeMfaSignIn()` answer with six different outcomes,
 * and three of them are not errors at all — one is a second step, one is a
 * refusal the operator cannot fix themselves, and one is a wait. An action that
 * decided which sentence to show inline would be a decision nothing could test:
 * `session-actions.ts` is a `'use server'` module whose imports reach
 * `server-only`, cookies and the service-role key. So the decision is a pure
 * function over a discriminated union, `__tests__/sign-in-state.test.ts` covers
 * every variant of it, and the action is left with the side effects.
 *
 * The exhaustiveness is load-bearing: `signInRefusalState()` switches on every
 * member of `SignInRefusal` and returns from each arm, so a seventh outcome
 * added to `auth.ts` fails to compile here rather than falling through to a
 * generic "something went wrong".
 *
 * ---------------------------------------------------------------------------
 * ONE REFUSAL SENTENCE FOR THE CREDENTIALS STEP
 * ---------------------------------------------------------------------------
 *
 * A form that says "no such account" for an unknown address and "wrong
 * password" for a known one is an account-existence oracle. Both cases arrive
 * here as `invalid_credentials` and the action routes its own "that address is
 * not even an address" case through this same function, so the two sentences
 * are identical by construction rather than by two authors remembering to keep
 * them in step.
 *
 * ---------------------------------------------------------------------------
 * NOTHING SECRET CROSSES THE BOUNDARY
 * ---------------------------------------------------------------------------
 *
 * `useActionState` serialises this object to the browser. `factorId` is an
 * opaque GoTrue handle that is worthless without the session cookie the
 * challenge is issued against, the factor labels are names their owner chose,
 * and the TOTP code is never echoed back.
 */

export type SignInStep =
  /** Address and password. */
  | 'credentials'
  /** A verified factor exists; the form is asking for the six-digit code. */
  | 'mfa'
  /** The policy demands a second factor and the account has none enrolled. */
  | 'enrol_mfa'

export interface SignInFactorOption {
  readonly id: string
  readonly label: string
}

export interface SignInState {
  /** A Turkish message from `messages.auth`, or null when there is nothing wrong. */
  readonly error: string | null
  readonly step: SignInStep
  /** The factors the operator may answer with. Empty outside the `mfa` step. */
  readonly factors: readonly SignInFactorOption[]
  /** The factor the code will be checked against. Null outside the `mfa` step. */
  readonly factorId: string | null
}

export const initialSignInState: SignInState = {
  error: null,
  step: 'credentials',
  factors: [],
  factorId: null,
}

/** The same state with a message attached, keeping the operator on their step. */
export function signInError(state: SignInState, message: string): SignInState {
  return { ...state, error: message }
}

// ===========================================================================
// The form's field names
//
// Shared with the Server Action rather than typed twice: a rename that reached
// only one side would be a form that silently posts nothing.
// ===========================================================================

export const SIGN_IN_FIELDS = {
  email: 'email',
  password: 'password',
  /** Which step the submitted form was on; survives a submit before hydration. */
  step: 'step',
  factorId: 'factorId',
  code: 'code',
  intent: 'intent',
} as const

/**
 * The value the "start over" button posts.
 *
 * It is a real action, not a link: at the MFA and enrolment steps the password
 * has already been accepted and GoTrue cookies are sitting in the browser, so
 * abandoning the attempt has to clear them server-side.
 */
export const SIGN_IN_RESTART = 'restart'

/** The digits a TOTP factor produces. Used for the input's own constraint. */
export const TOTP_CODE_LENGTH = 6

// ===========================================================================
// Outcomes
// ===========================================================================

/** Every outcome except the one that navigates away from the form. */
export type SignInRefusal = Exclude<AdminSignInOutcome, { status: 'signed_in' }>

export type SignInResolution =
  /** The console session exists; the action redirects rather than rendering. */
  { readonly kind: 'signed_in' } | { readonly kind: 'state'; readonly state: SignInState }

/**
 * What the operator was answering when the outcome came back.
 *
 * Taken from the submitted form rather than from the previous state: a form
 * posted before React hydrates arrives with the initial state, and a wrong code
 * must not throw an operator back to the password box because of that.
 */
export interface SignInAttempt {
  readonly step: SignInStep
  /** The factors that step offered. Empty on the credentials step. */
  readonly factors: readonly SignInFactorOption[]
  /** The factor the operator answered with, when they were asked for one. */
  readonly factorId: string | null
}

export const CREDENTIALS_ATTEMPT: SignInAttempt = {
  step: 'credentials',
  factors: [],
  factorId: null,
}

/** A factor's own name when it has one, and an honest generic name when not. */
export function signInFactorOption(factor: MfaFactorSummary): SignInFactorOption {
  const named = factor.friendlyName?.trim() ?? ''
  return { id: factor.id, label: named === '' ? messages.auth.mfaFactorFallback : named }
}

export function resolveSignInOutcome(
  outcome: AdminSignInOutcome,
  attempt: SignInAttempt,
): SignInResolution {
  if (outcome.status === 'signed_in') return { kind: 'signed_in' }
  return { kind: 'state', state: signInRefusalState(outcome, attempt) }
}

/**
 * The state each refusal leaves the form in.
 *
 * Two rules run through it. A refusal the operator can answer keeps them on the
 * step they are on — a wrong code re-asks for a code, not for the password they
 * already got right. A refusal about the account itself sends them back to the
 * credentials step, because there is nothing to answer where they are standing.
 */
export function signInRefusalState(refusal: SignInRefusal, attempt: SignInAttempt): SignInState {
  switch (refusal.status) {
    case 'mfa_required': {
      const factors = refusal.factors.map(signInFactorOption)
      const first = factors[0]
      // GoTrue reporting no verified factor while asking for one would render a
      // code box that cannot succeed. `auth.ts` does not produce that, and if it
      // ever did the honest answer is the enrolment page, not a dead control.
      if (first === undefined) return enrolmentRequiredState()
      return { error: null, step: 'mfa', factors, factorId: first.id }
    }

    case 'mfa_enrolment_required':
      return enrolmentRequiredState()

    case 'invalid_credentials': {
      // On the MFA step the password is already accepted, so the only thing
      // that can be wrong is the code — saying "e-posta veya parola hatalı"
      // there would send the operator to re-check something that is correct.
      // The message follows the step the form actually lands on, so an attempt
      // that has lost its factor is not told its code was wrong on a password
      // form.
      const next = attempt.step === 'mfa' ? signInMfaState(attempt) : initialSignInState
      return next.step === 'mfa'
        ? { ...next, error: messages.auth.mfaInvalidCode }
        : { ...next, error: messages.auth.invalidCredentials }
    }

    case 'not_admin':
      // The account authenticated and holds no console authorization. That is
      // not answerable from the MFA step, so the form goes back to the start.
      return { ...initialSignInState, error: messages.auth.notStaff }

    case 'rate_limited':
      return {
        ...(attempt.step === 'mfa' ? signInMfaState(attempt) : initialSignInState),
        error: messages.auth.rateLimitedFor(retryMinutes(refusal.retryAfterSeconds)),
      }
  }
}

function enrolmentRequiredState(): SignInState {
  return {
    error: messages.auth.mfaEnrolmentRequired,
    step: 'enrol_mfa',
    factors: [],
    factorId: null,
  }
}

/**
 * The MFA step rebuilt from what was submitted.
 *
 * The factor list is rebuilt from the answered factor when the attempt carries
 * none, which is the pre-hydration case: without it a second attempt would
 * render a code box with no factor behind it. An attempt naming no factor at
 * all is not an MFA step any more, so it falls back to the credentials form.
 */
export function signInMfaState(attempt: SignInAttempt): SignInState {
  const factorId = attempt.factorId
  if (factorId === null || factorId === '') return initialSignInState
  const factors =
    attempt.factors.length > 0
      ? attempt.factors
      : [{ id: factorId, label: messages.auth.mfaFactorFallback }]
  return { error: null, step: 'mfa', factors, factorId }
}

/**
 * The wait, in whole minutes, rounded up.
 *
 * The limiter's window is fixed rather than sliding, so the configured window
 * is a ceiling on the wait and never an underestimate. The message says "at
 * most" for that reason: a countdown would claim a precision the server does
 * not have.
 */
function retryMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60))
}
