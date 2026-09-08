'use client'

import { BillingErrorPanel } from '@/components/billing/BillingErrorPanel'
import { BILLING_RECONCILIATION_PATH } from '@/components/billing/contract'
import { billingMessages } from '@/components/billing/messages'

/** The reconciliation page's own boundary: retry lands back on this rule list. */
export default function BillingReconciliationError({
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
      backHref={BILLING_RECONCILIATION_PATH}
      backLabel={billingMessages.area.tabs.reconciliation}
    />
  )
}
