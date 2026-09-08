'use client'

import { REFRESH_FIELDS } from './contract'
import { aiMessages } from './messages'
import { SubmitButton } from './SubmitButton'

/**
 * "Yenile" — re-runs every query on the current page and returns to the same
 * URL, window and threshold intact.
 *
 * Cost pages get watched on a second monitor, and a browser reload keeps the
 * filters but not necessarily the router cache. The Server Action revalidates
 * the path and redirects back, so this is a real refetch rather than a repaint.
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
        label={aiMessages.refresh.now}
        pendingLabel={aiMessages.refresh.running}
        variant="quiet"
      />
    </form>
  )
}
