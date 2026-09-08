import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { messages } from '@/lib/messages'

/**
 * The route-level loading states.
 *
 * They mirror the rhythm of the loaded page — four tiles, a filter bar, then a
 * table or a two-column detail — so nothing shifts under the cursor when the
 * queries land. Each announces itself with `role="status"`, because a screen
 * reader gets nothing from a grey bar.
 */

export function QueueSkeleton() {
  return (
    <div className="p-4">
      <span className="sr-only" role="status">
        {messages.states.loading}
      </span>

      <div className="mb-4" aria-hidden="true">
        <span className="bo-skeleton block h-5 w-56" />
        <span className="bo-skeleton mt-2 block h-3 w-[34rem] max-w-full" />
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <StatGrid>
          {Array.from({ length: 4 }, (_, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <div className="bo-panel px-3 py-2">
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index} className="bo-skeleton block h-7 w-36" />
            ))}
          </div>
        </div>

        <div className="bo-panel p-3">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="bo-skeleton mb-2 block h-4 last:mb-0" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function TicketDetailSkeleton() {
  return (
    <div className="p-4">
      <span className="sr-only" role="status">
        {messages.states.loading}
      </span>

      <div className="mb-4" aria-hidden="true">
        <span className="bo-skeleton block h-2.5 w-48" />
        <span className="bo-skeleton mt-2 block h-5 w-96 max-w-full" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3" aria-hidden="true">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="bo-panel p-4">
              <span className="bo-skeleton block h-3 w-40" />
              <div className="mt-3 flex flex-col gap-2">
                {Array.from({ length: 5 }, (_, line) => (
                  <span key={line} className="bo-skeleton block h-3 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="bo-panel p-4">
              <span className="bo-skeleton block h-3 w-32" />
              <div className="mt-3 flex flex-col gap-2">
                {Array.from({ length: 6 }, (_, line) => (
                  <span key={line} className="bo-skeleton block h-3 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
