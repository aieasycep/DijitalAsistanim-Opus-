import { REFRESH_FIELDS } from './contract'
import { billingMessages } from './messages'
import { BillingSubmitButton } from './SubmitButton'

/**
 * Re-runs every query on the current page.
 *
 * Billing pages are `force-dynamic`, so they are already fresh on navigation —
 * but an operator watching a webhook catch up needs to ask again without
 * losing the filters they set. The action revalidates the path and redirects
 * back to the same URL, so this is a real re-query rather than a control that
 * only looks like one.
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
      <BillingSubmitButton
        label={billingMessages.area.refresh}
        pendingLabel={billingMessages.area.refreshing}
        variant="quiet"
      />
    </form>
  )
}
