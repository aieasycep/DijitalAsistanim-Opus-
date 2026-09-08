'use client'

import { BillingErrorPanel } from '@/components/billing/BillingErrorPanel'
import { BILLING_REFERRALS_PATH } from '@/components/billing/contract'
import { billingMessages } from '@/components/billing/messages'

/** The referrals page's own boundary: retry re-runs the fraud queries. */
export default function BillingReferralsError({
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
      backHref={BILLING_REFERRALS_PATH}
      backLabel={billingMessages.area.tabs.referrals}
    />
  )
}
