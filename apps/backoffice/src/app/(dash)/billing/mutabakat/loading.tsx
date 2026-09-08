import {
  BillingHeaderSkeleton,
  BillingLoadingAnnouncement,
  BillingTableSkeleton,
} from '@/components/billing/Skeletons'

/**
 * The reconciliation page's loading state: header and tabs, the six rule tiles,
 * then the list they filter.
 */
export default function BillingReconciliationLoading() {
  return (
    <div className="p-4">
      <BillingLoadingAnnouncement />
      <BillingHeaderSkeleton filterCount={0} />
      <div className="flex flex-col gap-4">
        <div className="bo-panel p-4" aria-hidden="true">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index} className="rounded-xl border border-hairline px-3 py-2.5">
                <span className="bo-skeleton block h-2.5 w-20" />
                <span className="bo-skeleton mt-2 block h-5 w-32" />
                <span className="bo-skeleton mt-2 block h-2.5 w-full" />
              </li>
            ))}
          </ul>
        </div>
        <BillingTableSkeleton rows={8} />
      </div>
    </div>
  )
}
