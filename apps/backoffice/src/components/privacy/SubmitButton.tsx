'use client'

import { useFormStatus } from 'react-dom'

/**
 * A submit button that knows its own form is in flight.
 *
 * The only reason this is a client component: an operator who files a re-run
 * order and sees nothing change presses the button again, and each order
 * eventually causes a full archive rebuild of somebody's mailbox. The action
 * de-duplicates server-side too, but a button that visibly went nowhere is a
 * button people hit twice.
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
