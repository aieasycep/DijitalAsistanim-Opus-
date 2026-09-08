import { messages } from '@/lib/messages'
import { opsMessages } from '@/components/ops/messages'

/**
 * The queue's loading state: heading, filter bar, then a table of rows. It has
 * its own file rather than inheriting the dashboard's because this route has no
 * stat tiles, and a skeleton that promises tiles the page will not render is a
 * layout jump with extra steps.
 */
export default function OpsQueueLoading() {
  return (
    <div className="p-4">
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
        <div>
          <span className="bo-skeleton block h-2.5 w-32" />
          <span className="bo-skeleton mt-2 block h-5 w-64" />
          <span className="bo-skeleton mt-2 block h-3 w-96 max-w-full" />
        </div>
        <div className="bo-panel flex flex-wrap items-end gap-3 px-3 py-2">
          {Array.from({ length: 3 }, (_unused, index) => (
            <div key={index} className="flex flex-col gap-1">
              <span className="bo-skeleton block h-2.5 w-16" />
              <span className="bo-skeleton block h-7 w-36" />
            </div>
          ))}
        </div>
      </div>

      <section className="bo-panel overflow-hidden" aria-hidden="true">
        <div className="border-b border-hairline px-4 py-2.5">
          <span className="sr-only">{opsMessages.failing.section}</span>
          <span className="bo-skeleton block h-3 w-52" />
        </div>
        <div className="flex flex-col gap-2 p-3">
          {Array.from({ length: 10 }, (_unused, index) => (
            <span key={index} className="bo-skeleton block h-3 w-full" />
          ))}
        </div>
      </section>
    </div>
  )
}
