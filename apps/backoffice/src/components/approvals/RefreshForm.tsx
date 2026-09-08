'use client'

import { REFRESH_FIELDS } from './contract'
import { approvalMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * Re-runs every query on the current page.
 *
 * These are live operational counters, and the pages are `force-dynamic`, so
 * "refresh" means exactly what it says: the Server Action revalidates this path
 * and sends the operator back to the same filtered URL. It is a form rather than
 * a link so the round trip is a real cache revalidation, not a client navigation
 * that might be served from the router cache.
 */

export interface RefreshFormProps {
  action: (formData: FormData) => void | Promise<void>
  /** Path, with query, to return to. Checked against an allowlist server-side. */
  returnTo: string
}

export function RefreshForm({ action, returnTo }: RefreshFormProps) {
  return (
    <form action={action}>
      <input type="hidden" name={REFRESH_FIELDS.returnTo} value={returnTo} />
      <SubmitButton
        label={approvalMessages.refresh.label}
        pendingLabel={approvalMessages.refresh.pending}
        variant="quiet"
      />
    </form>
  )
}
