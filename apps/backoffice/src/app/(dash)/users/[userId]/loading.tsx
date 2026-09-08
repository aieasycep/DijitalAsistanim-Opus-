import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { messages } from '@/lib/messages'

/**
 * The detail page's route-level loading state.
 *
 * Twelve tiles, three cards, then two full-width panels — the same rhythm the
 * loaded page has, so nothing shifts under the cursor when the queries land.
 */
export default function UserDetailLoading() {
  return (
    <div className="p-4">
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4" aria-hidden="true">
        <span className="bo-skeleton block h-2.5 w-64" />
        <span className="bo-skeleton mt-2 block h-5 w-56" />
        <span className="bo-skeleton mt-2 block h-3 w-[34rem] max-w-full" />
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        {Array.from({ length: 3 }, (_, gridIndex) => (
          <StatGrid key={gridIndex}>
            {Array.from({ length: 4 }, (_, index) => (
              <StatTileSkeleton key={index} />
            ))}
          </StatGrid>
        ))}

        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="bo-panel p-4">
              <span className="bo-skeleton block h-3 w-28" />
              <div className="mt-3 flex flex-col gap-2">
                {Array.from({ length: 5 }, (_, line) => (
                  <span key={line} className="bo-skeleton block h-3 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="bo-panel p-4">
            <span className="bo-skeleton block h-3 w-40" />
            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, line) => (
                <span key={line} className="bo-skeleton block h-3 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
