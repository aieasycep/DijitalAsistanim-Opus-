'use client'

import { BillingErrorPanel } from '@/components/billing/BillingErrorPanel'
import { BILLING_PATH } from '@/components/billing/contract'
import { billingMessages } from '@/components/billing/messages'

/**
 * The billing area's error boundary. It also catches anything thrown by the
 * nested routes that do not declare one closer to the failure.
 */
export default function BillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <BillingErrorPanel
      digest={error.digest}
      reset={reset}
      backHref={BILLING_PATH}
      backLabel={billingMessages.area.tabs.subscriptions}
    />
  )
}
