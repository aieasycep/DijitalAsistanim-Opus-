'use client'

import { REFRESH_FIELDS } from './contract'
import { privacyMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * Re-runs every query on the current page.
 *
 * A deadline board is only useful if an operator can trust it is current, and
 * these routes are `force-dynamic` but still cached per render. This posts to a
 * Server Action that revalidates the path and returns to exactly the same URL,
 * filters intact — a real round trip, not a client-side refetch that would
 * leave the server's cached render in place.
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
        label={privacyMessages.overview.refresh}
        pendingLabel={privacyMessages.overview.refreshing}
        variant="quiet"
      />
    </form>
  )
}
