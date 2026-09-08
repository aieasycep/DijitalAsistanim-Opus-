import { messages } from '@/lib/messages'

/**
 * Route-level loading shapes for the billing pages.
 *
 * Each one mirrors the page it stands in for — header, tab row, filter bar,
 * then the panels in the order they appear — so the layout does not jump when
 * the queries return. These pages fan out to twenty-odd `count(*)` calls, which
 * is exactly the case where a spinner tells an operator nothing and a shape
 * tells them what is coming.
 */

export function BillingHeaderSkeleton({ filterCount = 1 }: { filterCount?: number }) {
  return (
    <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
      <div>
        <span className="bo-skeleton block h-5 w-44" />
        <span className="bo-skeleton mt-2 block h-3 w-[34rem] max-w-full" />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 3 }, (_, index) => (
          <span key={index} className="bo-skeleton block h-7 w-24 rounded-md" />
        ))}
      </div>
      <div className="bo-panel flex flex-wrap gap-3 px-3 py-2">
        {Array.from({ length: filterCount }, (_, index) => (
          <div key={index} className="flex flex-col gap-1">
            <span className="bo-skeleton block h-2.5 w-16" />
            <span className="bo-skeleton block h-7 w-40" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function BillingStatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="bo-panel px-3 py-2.5">
          <span className="bo-skeleton block h-2.5 w-24" />
          <span className="bo-skeleton mt-2 block h-6 w-16" />
          <span className="bo-skeleton mt-1.5 block h-2.5 w-20" />
        </div>
      ))}
    </div>
  )
}

export function BillingTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bo-panel overflow-hidden" aria-hidden="true">
      <div className="border-b border-hairline px-4 py-2.5">
        <span className="bo-skeleton block h-3 w-40" />
        <span className="bo-skeleton mt-1.5 block h-2.5 w-72 max-w-full" />
      </div>
      <div className="border-b border-hairline bg-surface2/60 px-3 py-2">
        <span className="bo-skeleton block h-2.5 w-full max-w-md" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex gap-6 border-b border-hairline/70 px-3 py-2.5 last:border-b-0"
        >
          <span className="bo-skeleton block h-3 w-40" />
          <span className="bo-skeleton block h-3 w-20" />
          <span className="bo-skeleton block h-3 w-24" />
          <span className="bo-skeleton ml-auto block h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

/** The one visible-to-assistive-technology part of a loading route. */
export function BillingLoadingAnnouncement() {
  return (
    <span className="sr-only" role="status">
      {messages.table.loading}
    </span>
  )
}
