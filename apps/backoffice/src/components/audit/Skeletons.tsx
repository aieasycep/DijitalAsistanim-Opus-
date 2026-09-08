import { auditMessages } from './messages'

/**
 * The loading states, shaped like the pages they precede.
 *
 * A skeleton that does not match its page is a layout shift with extra steps,
 * so these mirror the real header, filter bars, tiles and panels row for row.
 */

/** Announced to assistive technology while a route segment is loading. */
export function LoadingAnnouncement() {
  return (
    <p role="status" className="sr-only">
      {auditMessages.loading.announce}
    </p>
  )
}

export function PageSkeletonHeader({ filterBars = 2 }: { filterBars?: number }) {
  return (
    <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="bo-skeleton block h-5 w-48" />
          <span className="bo-skeleton mt-2 block h-3 w-full max-w-2xl" />
        </div>
        <span className="bo-skeleton h-7 w-24 rounded-md" />
      </div>
      {Array.from({ length: filterBars }, (_unused, index) => (
        <div key={index} className="bo-panel flex items-center gap-3 px-3 py-2">
          <span className="bo-skeleton h-7 w-40 rounded-md" />
          <span className="bo-skeleton h-7 w-32 rounded-md" />
          <span className="bo-skeleton h-7 w-28 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export function PanelSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <section className="bo-panel" aria-hidden="true">
      <header className="border-b border-hairline px-4 py-2.5">
        <span className="bo-kicker">{label}</span>
      </header>
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: rows }, (_unused, index) => (
          <span
            key={index}
            className="bo-skeleton block h-3"
            style={{ width: `${100 - (index % 4) * 12}%` }}
          />
        ))}
      </div>
    </section>
  )
}

export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="bo-panel overflow-hidden" aria-hidden="true">
      <div className="border-b border-hairline bg-surface2/60 px-3 py-2">
        <span className="bo-skeleton block h-2.5 w-32" />
      </div>
      {Array.from({ length: rows }, (_unused, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-hairline/70 px-3 py-2 last:border-b-0"
        >
          <span className="bo-skeleton h-3 w-32" />
          <span className="bo-skeleton h-3 flex-1" />
          <span className="bo-skeleton h-3 w-20" />
          <span className="bo-skeleton h-3 w-16" />
        </div>
      ))}
    </div>
  )
}
