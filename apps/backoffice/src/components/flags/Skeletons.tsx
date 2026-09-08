import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { messages } from '@/lib/messages'

/**
 * The loading states, shaped like the pages they precede so nothing jumps when
 * the queries land. Announced rather than only drawn: `role="status"` on a
 * visually hidden line is what tells a screen reader that something is
 * happening; the bars are for everybody else.
 */

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <section className="bo-panel overflow-hidden" aria-hidden="true">
      <div className="border-b border-hairline bg-surface2/60 px-3 py-2">
        <span className="bo-skeleton block h-2.5 w-full max-w-lg" />
      </div>
      {Array.from({ length: rows }, (_unused, index) => (
        <div
          key={index}
          className="flex gap-6 border-b border-hairline/70 px-3 py-2.5 last:border-b-0"
        >
          <span className="bo-skeleton block h-3 w-48" />
          <span className="bo-skeleton block h-3 w-24" />
          <span className="bo-skeleton block h-3 w-40" />
          <span className="bo-skeleton ml-auto block h-3 w-20" />
        </div>
      ))}
    </section>
  )
}

export function FlagListSkeleton() {
  return (
    <>
      <span className="sr-only" role="status">
        {messages.states.loading}
      </span>

      <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
        <div>
          <span className="bo-skeleton block h-5 w-56" />
          <span className="bo-skeleton mt-2 block h-3 w-[38rem] max-w-full" />
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
        <TableSkeleton />
      </div>
    </>
  )
}

export function FlagDetailSkeleton() {
  return (
    <>
      <span className="sr-only" role="status">
        {messages.states.loading}
      </span>

      <div className="mb-4 flex flex-col gap-2" aria-hidden="true">
        <span className="bo-skeleton block h-2.5 w-40" />
        <span className="bo-skeleton block h-5 w-72" />
        <span className="bo-skeleton block h-3 w-[32rem] max-w-full" />
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <StatGrid>
          {Array.from({ length: 4 }, (_unused, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <section className="bo-panel p-4">
          <span className="bo-skeleton block h-3 w-40" />
          <span className="bo-skeleton mt-3 block h-3 w-full max-w-xl" />
          <span className="bo-skeleton mt-2 block h-3 w-full max-w-lg" />
        </section>

        <TableSkeleton rows={4} />
      </div>
    </>
  )
}

export function FlagFormSkeleton() {
  return (
    <>
      <span className="sr-only" role="status">
        {messages.states.loading}
      </span>
      <div className="mb-4 flex flex-col gap-2" aria-hidden="true">
        <span className="bo-skeleton block h-5 w-56" />
        <span className="bo-skeleton block h-3 w-[32rem] max-w-full" />
      </div>
      <section className="bo-panel flex flex-col gap-4 p-4" aria-hidden="true">
        {Array.from({ length: 6 }, (_unused, index) => (
          <div key={index} className="flex flex-col gap-1">
            <span className="bo-skeleton block h-2.5 w-24" />
            <span className="bo-skeleton block h-7 w-full max-w-md" />
          </div>
        ))}
      </section>
    </>
  )
}
