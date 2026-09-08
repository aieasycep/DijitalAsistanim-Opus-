import { messages } from '@/lib/messages'

/**
 * The shapes a privacy route shows while its queries are in flight.
 *
 * They are laid out like the pages that follow them — header, filter bar, tiles,
 * then panels in the same order — so nothing jumps when the data lands. A
 * route-level `loading.tsx` cannot render `NavShell`, because the shell needs a
 * session the file cannot await; the frame arrives with the page.
 */

export function PageSkeletonHeader({ filters = 2 }: { filters?: number }) {
  return (
    <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
      <div>
        <span className="bo-skeleton block h-2.5 w-28" />
        <span className="bo-skeleton mt-2 block h-5 w-56" />
        <span className="bo-skeleton mt-2 block h-3 w-full max-w-2xl" />
      </div>
      {filters > 0 ? (
        <div className="bo-panel flex flex-wrap items-end gap-3 px-3 py-2">
          {Array.from({ length: filters }, (_unused, index) => (
            <span key={index} className="bo-skeleton block h-7 w-40" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function PanelSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <section className="bo-panel overflow-hidden">
      <div className="border-b border-hairline px-4 py-2.5">
        <span className="sr-only">{label}</span>
        <span className="bo-skeleton block h-3 w-48" />
      </div>
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: rows }, (_unused, index) => (
          <span key={index} className="bo-skeleton block h-3 w-full" />
        ))}
      </div>
    </section>
  )
}

/** The announcement a screen reader hears while a route is loading. */
export function LoadingAnnouncement() {
  return (
    <span className="sr-only" role="status">
      {messages.table.loading}
    </span>
  )
}
