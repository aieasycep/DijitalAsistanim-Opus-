'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui'

/**
 * A submit button that knows its own form is in flight.
 *
 * The only reason this is a client component: an operator who presses "Notu
 * ekle" and sees nothing change for two seconds presses it again, and a second
 * note is a real second row in the thread. `useFormStatus` reads the pending
 * state of the enclosing form, so the button disables and renames itself
 * without the page owning any state.
 */

export interface TicketSubmitButtonProps {
  label: string
  pendingLabel: string
  /** Blocks submission while the form's own fields are not yet valid. */
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}

export function TicketSubmitButton({
  label,
  pendingLabel,
  disabled = false,
  variant = 'primary',
}: TicketSubmitButtonProps) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  )
}
