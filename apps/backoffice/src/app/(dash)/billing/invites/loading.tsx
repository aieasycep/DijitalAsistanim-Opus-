import {
  BillingHeaderSkeleton,
  BillingLoadingAnnouncement,
  BillingStatGridSkeleton,
  BillingTableSkeleton,
} from '@/components/billing/Skeletons'

/**
 * The referrals page's loading state: header, tabs, the four filter groups, the
 * counters, then the series, the two risk lists and the order trail.
 */
export default function BillingReferralsLoading() {
  return (
    <div className="p-4">
      <BillingLoadingAnnouncement />
      <BillingHeaderSkeleton filterCount={4} />
      <div className="flex flex-col gap-4">
        <BillingStatGridSkeleton />
        <BillingTableSkeleton rows={8} />
        <BillingTableSkeleton rows={6} />
        <BillingTableSkeleton rows={4} />
        <BillingTableSkeleton rows={4} />
      </div>
    </div>
  )
}
