'use client'

import { useFormStatus } from 'react-dom'

/**
 * A submit button that knows its own form is in flight.
 *
 * The only reason this component is a client component: an operator who files a
 * quota review and sees nothing change presses the button again, and a second
 * press would write a second audit row saying the same thing. `useFormStatus`
 * reads the enclosing form's pending state, so the button disables and renames
 * itself without any page owning state.
 */

export interface SubmitButtonProps {
  label: string
  pendingLabel: string
  variant?: 'primary' | 'quiet'
}

const VARIANT_CLASS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-pressed',
  quiet: 'border border-hairline text-muted hover:border-primary/40 hover:text-ink',
} as const

export function SubmitButton({ label, pendingLabel, variant = 'primary' }: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={[
        'h-7 shrink-0 rounded-md px-2.5 text-[12px] font-medium transition-colors disabled:opacity-60',
        VARIANT_CLASS[variant],
      ].join(' ')}
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
