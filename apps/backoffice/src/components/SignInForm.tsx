'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { signInAction } from '@/app/session-actions'
import { messages } from '@/lib/messages'
import { initialSignInState } from '@/lib/sign-in-state'

/**
 * The sign-in form. A client component only because it renders the action's
 * returned error and a pending state; the credentials themselves are handled
 * entirely inside the Server Action, so no key and no session ever exists on
 * this side of the boundary.
 */
export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, initialSignInState)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="bo-kicker">{messages.auth.email}</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-9 rounded-md border border-hairline bg-surface px-2.5 text-[13px] text-ink"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="bo-kicker">{messages.auth.password}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-9 rounded-md border border-hairline bg-surface px-2.5 text-[13px] text-ink"
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-md bg-primary text-[13px] font-semibold text-on-primary transition-colors hover:bg-primary-pressed disabled:opacity-60"
    >
      {pending ? messages.auth.submitting : messages.auth.submit}
    </button>
  )
}
