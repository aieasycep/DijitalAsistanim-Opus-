import { messages } from '@/lib/messages'

/**
 * The list's route-level loading state.
 *
 * Its shape matches the page it replaces — header, filter bar, then a table of
 * six rows — so the layout does not jump when the query returns. A spinner
 * would tell an operator less and move more.
 */
export default function UsersLoading() {
  return (
    <div className="p-4">
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
        <div>
          <span className="bo-skeleton block h-5 w-40" />
          <span className="bo-skeleton mt-2 block h-3 w-[32rem] max-w-full" />
        </div>
        <div className="bo-panel px-3 py-2">
          <span className="bo-skeleton block h-2.5 w-12" />
          <span className="bo-skeleton mt-1.5 block h-7 w-80 max-w-full" />
        </div>
        <div className="bo-panel flex flex-wrap gap-3 px-3 py-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex flex-col gap-1">
              <span className="bo-skeleton block h-2.5 w-16" />
              <span className="bo-skeleton block h-7 w-32" />
            </div>
          ))}
        </div>
      </div>

      <div className="bo-panel overflow-hidden" aria-hidden="true">
        <div className="border-b border-hairline bg-surface2/60 px-3 py-2">
          <span className="bo-skeleton block h-2.5 w-full max-w-md" />
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex gap-6 border-b border-hairline/70 px-3 py-2.5 last:border-b-0"
          >
            <span className="bo-skeleton block h-3 w-40" />
            <span className="bo-skeleton block h-3 w-20" />
            <span className="bo-skeleton block h-3 w-24" />
            <span className="bo-skeleton ml-auto block h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
