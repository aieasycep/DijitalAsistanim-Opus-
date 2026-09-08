import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { messages } from '@/lib/messages'

/**
 * The route-level loading state. Its shape matches the overview so the page
 * does not jump when the data arrives: four tiles, then a panel.
 */
export default function BackofficeLoading() {
  return (
    <div className="p-4">
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4" aria-hidden="true">
        <span className="bo-skeleton block h-5 w-48" />
        <span className="bo-skeleton mt-2 block h-3 w-80" />
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <StatGrid>
          {Array.from({ length: 8 }, (_, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <div className="bo-panel p-4">
          <span className="bo-skeleton block h-3 w-40" />
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} className="bo-skeleton block h-3 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
