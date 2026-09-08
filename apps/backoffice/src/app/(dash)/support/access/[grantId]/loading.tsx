import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { messages } from '@/lib/messages'
import { supportAccessMessages } from '@/lib/messages/support-access'

/**
 * One grant's loading state: heading, four tiles, the summary and reason pair,
 * then the two logs — the same shape the page settles into, so nothing moves
 * when the six queries land.
 */
export default function SupportAccessGrantLoading() {
  return (
    <>
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4" aria-hidden="true">
        <span className="bo-skeleton block h-2.5 w-44" />
        <span className="bo-skeleton mt-2 block h-5 w-56" />
        <span className="bo-skeleton mt-2 block h-3 w-[34rem] max-w-full" />
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <StatGrid>
          {Array.from({ length: 4 }, (_unused, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <PanelSkeleton rows={9} label={supportAccessMessages.detail.summary} />
          <div className="flex flex-col gap-4">
            <PanelSkeleton rows={3} label={supportAccessMessages.detail.reasonTitle} />
            <PanelSkeleton rows={2} label={supportAccessMessages.detail.decisionTitle} />
          </div>
        </div>

        <PanelSkeleton rows={4} label={supportAccessMessages.detail.scopesTitle} />
        <PanelSkeleton rows={6} label={supportAccessMessages.detail.revealsTitle} />
        <PanelSkeleton rows={4} label={supportAccessMessages.detail.trailTitle} />
      </div>
    </>
  )
}

function PanelSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <section className="bo-panel overflow-hidden">
      <div className="border-b border-hairline px-4 py-2.5">
        <span className="sr-only">{label}</span>
        <span className="bo-skeleton block h-3 w-44" />
      </div>
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: rows }, (_unused, index) => (
          <span key={index} className="bo-skeleton block h-3 w-full" />
        ))}
      </div>
    </section>
  )
}
