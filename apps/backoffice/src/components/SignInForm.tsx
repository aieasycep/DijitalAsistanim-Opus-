'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { signInAction } from '@/app/session-actions'
import { messages } from '@/lib/messages'
import {
  SIGN_IN_FIELDS,
  SIGN_IN_RESTART,
  TOTP_CODE_LENGTH,
  initialSignInState,
  type SignInState,
} from '@/lib/sign-in-state'

/**
 * The sign-in form, in as many steps as the account's policy demands.
 *
 * A client component only because it renders what the action returned and a
 * pending state. No credential, no token and no session ever exists on this
 * side of the boundary: the password goes straight into the Server Action, the
 * TOTP code goes straight into the second one, and what comes back is a step
 * name, a factor list and a Turkish sentence.
 *
 * The step is driven by the action's state rather than by local state, so a
 * reload or a submit before hydration cannot leave the browser showing a code
 * box for a challenge the server has forgotten. Every form here also posts its
 * own step and factor, which is what keeps the flow working without JavaScript.
 */
export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, initialSignInState)

  if (state.step === 'mfa') return <MfaStep state={state} formAction={formAction} />
  if (state.step === 'enrol_mfa') return <EnrolmentStep state={state} formAction={formAction} />
  return <CredentialsStep state={state} formAction={formAction} />
}

interface StepProps {
  state: SignInState
  formAction: (formData: FormData) => void
}

const INPUT_CLASS = 'h-9 rounded-md border border-hairline bg-surface px-2.5 text-[13px] text-ink'

function CredentialsStep({ state, formAction }: StepProps) {
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="bo-kicker">{messages.auth.email}</span>
        <input
          name={SIGN_IN_FIELDS.email}
          type="email"
          autoComplete="username"
          required
          className={INPUT_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="bo-kicker">{messages.auth.password}</span>
        <input
          name={SIGN_IN_FIELDS.password}
          type="password"
          autoComplete="current-password"
          required
          className={INPUT_CLASS}
        />
      </label>

      <Alert message={state.error} />

      <SubmitButton label={messages.auth.submit} pendingLabel={messages.auth.submitting} />
    </form>
  )
}

/**
 * The second step.
 *
 * The factor chooser only appears when there is a choice to make; a single
 * factor is posted as a hidden field and named in the hint instead, because a
 * select with one option is a control that decides nothing. The challenge is
 * not held here — the action asks GoTrue for a fresh one each time the code is
 * submitted, so a code typed a minute late still works.
 */
function MfaStep({ state, formAction }: StepProps) {
  const factors = state.factors
  const selected = state.factorId ?? ''
  const only = factors.length === 1 ? factors[0] : undefined

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name={SIGN_IN_FIELDS.step} value="mfa" />

      <div>
        <h2 className="text-[14px] font-semibold text-ink">{messages.auth.mfaTitle}</h2>
        <p className="mt-1 text-[12px] text-muted">{messages.auth.mfaSubtitle}</p>
      </div>

      {factors.length > 1 ? (
        <label className="flex flex-col gap-1">
          <span className="bo-kicker">{messages.auth.mfaFactor}</span>
          <select name={SIGN_IN_FIELDS.factorId} defaultValue={selected} className={INPUT_CLASS}>
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <input type="hidden" name={SIGN_IN_FIELDS.factorId} value={selected} />
          {only === undefined ? null : (
            <p className="text-[12px] text-muted">
              {messages.auth.mfaFactor}: {only.label}
            </p>
          )}
        </>
      )}

      <label className="flex flex-col gap-1">
        <span className="bo-kicker">{messages.auth.mfaCode}</span>
        <input
          name={SIGN_IN_FIELDS.code}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={`[0-9]{${TOTP_CODE_LENGTH}}`}
          maxLength={TOTP_CODE_LENGTH}
          autoFocus
          required
          className={`${INPUT_CLASS} tracking-[0.3em]`}
        />
      </label>

      <Alert message={state.error} />

      <SubmitButton label={messages.auth.mfaSubmit} pendingLabel={messages.auth.mfaSubmitting} />
      <RestartButton />
    </form>
  )
}

/**
 * The terminal state: the policy demands a second factor and the account has
 * none that can answer a challenge.
 *
 * There is no enrolment control here on purpose, and the text says why rather
 * than leaving the operator to guess. Letting whoever knows the password bind a
 * new factor at the sign-in screen would make the policy something a stolen
 * password walks straight through, so enrolment is somebody else's job — and
 * the panel names who. The one button on the screen does something real.
 */
function EnrolmentStep({ state, formAction }: StepProps) {
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h2 className="text-[14px] font-semibold text-ink">{messages.auth.mfaTitle}</h2>
      <Alert message={state.error} />
      <p className="text-[12px] text-muted">{messages.auth.mfaEnrolmentHelp}</p>
      <RestartButton />
    </form>
  )
}

function Alert({ message }: { message: string | null }) {
  if (message === null) return null
  return (
    <p
      role="alert"
      className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
    >
      {message}
    </p>
  )
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-md bg-primary text-[13px] font-semibold text-on-primary transition-colors hover:bg-primary-pressed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

/**
 * `formNoValidate` because this button leaves the step rather than completing
 * it: without it the browser would refuse to submit while the empty code box
 * still carries `required`, and the operator would be stuck on a form they are
 * trying to abandon.
 */
function RestartButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      name={SIGN_IN_FIELDS.intent}
      value={SIGN_IN_RESTART}
      formNoValidate
      disabled={pending}
      className="h-9 rounded-md border border-hairline text-[13px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
    >
      {messages.auth.startOver}
    </button>
  )
}
