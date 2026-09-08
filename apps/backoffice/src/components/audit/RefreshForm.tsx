'use client'

import { REFRESH_FIELDS } from './contract'
import { auditMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * Re-runs every query on the current page.
 *
 * These routes are `force-dynamic` but still cached per render, and a trail
 * whose freshness an operator cannot establish is a trail they will not trust
 * during an incident. This posts to a Server Action that revalidates the path
 * and returns to exactly the same URL, filters and cursor intact — a real round
 * trip, not a client-side refetch that would leave the server's render in place.
 */

export interface RefreshFormProps {
  action: (formData: FormData) => void | Promise<void>
  returnTo: string
}

export function RefreshForm({ action, returnTo }: RefreshFormProps) {
  return (
    <form action={action}>
      <input type="hidden" name={REFRESH_FIELDS.returnTo} value={returnTo} />
      <SubmitButton
        label={auditMessages.refresh.label}
        pendingLabel={auditMessages.refresh.pending}
        variant="quiet"
      />
    </form>
  )
}
