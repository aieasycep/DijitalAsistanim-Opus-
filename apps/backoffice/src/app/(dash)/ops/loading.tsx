import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { messages } from '@/lib/messages'
import { opsMessages } from '@/components/ops/messages'

/**
 * The dashboard's loading state.
 *
 * Shaped like the page it precedes — heading, eight tiles, then the panels — so
 * the layout does not jump when the queries land. A route-level `loading.tsx`
 * cannot render `NavShell`, because the shell needs a session and this file
 * cannot await one; the frame arrives with the page.
 */
export default function OpsLoading() {
  return (
    <div className="p-4">
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4" aria-hidden="true">
        <span className="bo-skeleton block h-2.5 w-20" />
        <span className="bo-skeleton mt-2 block h-5 w-56" />
        <span className="bo-skeleton mt-2 block h-3 w-96 max-w-full" />
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <StatGrid>
          {Array.from({ length: 8 }, (_unused, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <PanelSkeleton rows={4} label={opsMessages.providers.section} />
        <PanelSkeleton rows={6} label={opsMessages.failing.section} />

        <div className="grid gap-4 xl:grid-cols-2">
          <PanelSkeleton rows={4} label={opsMessages.errorRates.section} />
          <PanelSkeleton rows={4} label={opsMessages.errorCodes.section} />
        </div>

        <PanelSkeleton rows={7} label={opsMessages.throughput.section} />
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
