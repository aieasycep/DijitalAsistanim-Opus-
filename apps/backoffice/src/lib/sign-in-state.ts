/**
 * The shape the sign-in Server Actions return to their form.
 *
 * It lives outside the action module because a `'use server'` module may only
 * export async functions — a plain constant there is a build error. Types are
 * erased and would be fine either way; the initial values are not.
 *
 * Sign-in is two steps when the account has a second factor, so the state
 * carries which step the form is on and the challenge it is answering. Nothing
 * secret is in here: `factorId` and `challengeId` are opaque GoTrue handles
 * that are useless without the session cookie the challenge was issued against,
 * and the TOTP code itself is never echoed back.
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

/**
 * Everything but `error` is optional, and every reader must default it — the
 * first-pass sign-in action returns `{ error }` alone and still compiles while
 * it is being moved onto the two-step flow. `signInStep()` below is how a form
 * reads the step without repeating that default.
 */
export interface SignInState {
  /** A Turkish message from `messages.auth`, or null on the first render. */
  readonly error: string | null
  readonly step?: SignInStep
  /** The factors the operator may answer with. Empty outside the `mfa` step. */
  readonly factors?: readonly SignInFactorOption[]
  /** The factor the current challenge belongs to. */
  readonly factorId?: string | null
  /** The GoTrue challenge the submitted code will be checked against. */
  readonly challengeId?: string | null
  /**
   * Seconds the operator must wait after too many attempts. Null unless the
   * rate limiter refused the attempt — the form renders a real countdown rather
   * than repeating "wrong password".
   */
  readonly retryAfterSeconds?: number | null
}

/** The step a form should render. `credentials` whenever the state omits one. */
export function signInStep(state: SignInState): SignInStep {
  return state.step ?? 'credentials'
}

/** The factors a form should offer. Empty whenever the state omits them. */
export function signInFactors(state: SignInState): readonly SignInFactorOption[] {
  return state.factors ?? []
}

export const initialSignInState: SignInState = {
  error: null,
  step: 'credentials',
  factors: [],
  factorId: null,
  challengeId: null,
  retryAfterSeconds: null,
}

/** The same state with an error attached, keeping the operator on their step. */
export function signInError(state: SignInState, message: string): SignInState {
  return { ...state, error: message }
}
