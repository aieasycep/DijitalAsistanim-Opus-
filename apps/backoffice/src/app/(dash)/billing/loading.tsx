import {
  BillingHeaderSkeleton,
  BillingLoadingAnnouncement,
  BillingStatGridSkeleton,
  BillingTableSkeleton,
} from '@/components/billing/Skeletons'

/**
 * The subscriptions page's route-level loading state: header, tabs, the cohort
 * filter, two stat rows and the three panels, in the order they arrive.
 */
export default function BillingSubscriptionsLoading() {
  return (
    <div className="p-4">
      <BillingLoadingAnnouncement />
      <BillingHeaderSkeleton filterCount={1} />
      <div className="flex flex-col gap-4">
        <BillingStatGridSkeleton />
        <BillingStatGridSkeleton />
        <div className="grid gap-4 xl:grid-cols-2">
          <BillingTableSkeleton rows={6} />
          <BillingTableSkeleton rows={4} />
        </div>
        <BillingTableSkeleton rows={6} />
      </div>
    </div>
  )
}
