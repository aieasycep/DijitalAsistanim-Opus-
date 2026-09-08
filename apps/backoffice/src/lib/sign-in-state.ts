/**
 * The shape the sign-in Server Action returns to its form.
 *
 * It lives outside `session-actions.ts` because a `'use server'` module may
 * only export async functions — a plain constant there is a build error. Types
 * are erased and would be fine either way; the initial value is not.
 */
export interface SignInState {
  /** A Turkish message from `messages.auth`, or null on the first render. */
  error: string | null
}

export const initialSignInState: SignInState = { error: null }
