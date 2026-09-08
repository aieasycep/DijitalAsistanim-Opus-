import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { approvalMessages } from '@/components/approvals/messages'
import { messages } from '@/lib/messages'

/**
 * The oversight page's loading state.
 *
 * Shaped like the page it precedes — heading, filter bar, eight tiles, then the
 * panels in the order they arrive — so nothing jumps when the queries land. A
 * route-level `loading.tsx` cannot render `NavShell`, because the shell needs a
 * session this file cannot await; the frame arrives with the page.
 */
export default function ApprovalsLoading() {
  return (
    <div className="p-4">
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
        <div>
          <span className="bo-skeleton block h-2.5 w-20" />
          <span className="bo-skeleton mt-2 block h-5 w-56" />
          <span className="bo-skeleton mt-2 block h-3 w-full max-w-2xl" />
        </div>
        <div className="bo-panel flex flex-wrap items-end gap-3 px-3 py-2">
          <span className="bo-skeleton block h-7 w-56" />
          <span className="bo-skeleton block h-7 w-36" />
          <span className="bo-skeleton block h-7 w-36" />
        </div>
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <StatGrid>
          {Array.from({ length: 8 }, (_unused, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <PanelSkeleton rows={5} label={approvalMessages.types.section} />

        <div className="grid gap-4 xl:grid-cols-2">
          <PanelSkeleton rows={6} label={approvalMessages.trend.section} />
          <PanelSkeleton rows={3} label={approvalMessages.timing.section} />
        </div>

        <PanelSkeleton rows={5} label={approvalMessages.failures.section} />
        <PanelSkeleton rows={6} label={approvalMessages.queue.section} />
      </div>
    </div>
  )
}

function PanelSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <section className="bo-panel overflow-hidden">
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
