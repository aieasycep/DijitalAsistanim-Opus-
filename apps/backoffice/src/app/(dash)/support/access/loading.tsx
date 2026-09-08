import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { messages } from '@/lib/messages'
import { supportAccessMessages } from '@/lib/messages/support-access'

/**
 * The grant list's loading state.
 *
 * Shaped like the page it precedes — heading, filter bar, four tiles, then the
 * table — so nothing jumps when the queries land. It is announced rather than
 * only drawn: `role="status"` on a visually hidden line is what tells a screen
 * reader that something is happening.
 */
export default function SupportAccessLoading() {
  return (
    <>
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
        <div>
          <span className="bo-skeleton block h-5 w-48" />
          <span className="bo-skeleton mt-2 block h-3 w-[36rem] max-w-full" />
        </div>
        <div className="bo-panel flex flex-wrap gap-3 px-3 py-2">
          {Array.from({ length: 4 }, (_unused, index) => (
            <div key={index} className="flex flex-col gap-1">
              <span className="bo-skeleton block h-2.5 w-16" />
              <span className="bo-skeleton block h-7 w-36" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <StatGrid>
          {Array.from({ length: 4 }, (_unused, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <section className="bo-panel overflow-hidden">
          <span className="sr-only">{supportAccessMessages.list.tableCaption}</span>
          <div className="border-b border-hairline bg-surface2/60 px-3 py-2">
            <span className="bo-skeleton block h-2.5 w-full max-w-lg" />
          </div>
          {Array.from({ length: 8 }, (_unused, index) => (
            <div
              key={index}
              className="flex gap-6 border-b border-hairline/70 px-3 py-2.5 last:border-b-0"
            >
              <span className="bo-skeleton block h-3 w-32" />
              <span className="bo-skeleton block h-3 w-40" />
              <span className="bo-skeleton block h-3 w-40" />
              <span className="bo-skeleton ml-auto block h-3 w-24" />
            </div>
          ))}
        </section>
      </div>
    </>
  )
}
