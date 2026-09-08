'use client'

import { REFRESH_FIELDS } from './contract'
import { opsMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * "Yenile" — re-runs every query on the current page and comes back to the same
 * URL, filters and all.
 *
 * A dashboard that lives on a second monitor needs a way to ask for fresh
 * numbers without losing the filter state a browser reload would keep but the
 * router cache might not. The Server Action revalidates the path and redirects
 * back, so this is a real refetch rather than a repaint.
 */
export function RefreshForm({
  action,
  returnTo,
}: {
  action: (formData: FormData) => void | Promise<void>
  returnTo: string
}) {
  return (
    <form action={action}>
      <input type="hidden" name={REFRESH_FIELDS.returnTo} value={returnTo} />
      <SubmitButton
        label={opsMessages.refresh.now}
        pendingLabel={opsMessages.refresh.running}
        variant="quiet"
      />
    </form>
  )
}
