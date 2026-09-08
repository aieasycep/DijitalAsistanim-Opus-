import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { messages } from '@/lib/messages'

/**
 * The loading shapes the three AI routes share.
 *
 * Each `loading.tsx` composes these into the layout of the page it precedes —
 * same number of tiles, same panels in the same order — so nothing jumps when
 * the queries land. A route-level loading file cannot render `NavShell`,
 * because the shell needs a session it cannot await; the frame arrives with the
 * page itself.
 */

export function PageHeaderSkeleton() {
  return (
    <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
      <div>
        <span className="bo-skeleton block h-2.5 w-24" />
        <span className="bo-skeleton mt-2 block h-5 w-56" />
        <span className="bo-skeleton mt-2 block h-3 w-96 max-w-full" />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 3 }, (_unused, index) => (
          <span key={index} className="bo-skeleton block h-7 w-24" />
        ))}
      </div>
      <div className="bo-panel flex flex-wrap items-end gap-3 px-3 py-2">
        {Array.from({ length: 2 }, (_unused, index) => (
          <div key={index} className="flex flex-col gap-1">
            <span className="bo-skeleton block h-2.5 w-16" />
            <span className="bo-skeleton block h-7 w-36" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TileGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <StatGrid>
      {Array.from({ length: count }, (_unused, index) => (
        <StatTileSkeleton key={index} />
      ))}
    </StatGrid>
  )
}

export function PanelSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <section className="bo-panel overflow-hidden" aria-hidden="true">
      <div className="border-b border-hairline px-4 py-2.5">
        <span className="sr-only">{label}</span>
        <span className="bo-skeleton block h-3 w-44" />
      </div>
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: rows }, (_unused, index) => (
          <span key={index} className="bo-skeleton block h-3 w-full" />
        ))}
      </div>
    </section>
  )
}

/** The one announcement a screen reader needs while a page is loading. */
export function LoadingAnnouncement() {
  return (
    <span className="sr-only" role="status">
      {messages.table.loading}
    </span>
  )
}
