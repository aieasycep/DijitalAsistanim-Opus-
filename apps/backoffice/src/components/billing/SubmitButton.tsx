'use client'

import { useFormStatus } from 'react-dom'

/**
 * A submit button that knows its own form is in flight.
 *
 * The only reason anything in this area is a client component: an operator who
 * presses "Talimatı kaydet" and sees nothing move for a second presses it
 * again, and a second press writes a second audit row for the same decision.
 * `useFormStatus` reads the pending state of the enclosing form, so the button
 * disables and renames itself without the page owning any state.
 */

export interface BillingSubmitButtonProps {
  label: string
  pendingLabel: string
  variant?: 'primary' | 'danger' | 'quiet'
}

const VARIANT_CLASS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-pressed',
  danger: 'bg-critical text-on-primary hover:opacity-90',
  quiet: 'border border-hairline text-muted hover:border-primary/40 hover:text-ink',
} as const

export function BillingSubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
}: BillingSubmitButtonProps) {
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
