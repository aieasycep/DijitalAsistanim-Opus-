import { approvalMessages } from '@/components/approvals/messages'
import { messages } from '@/lib/messages'

/**
 * The failure queue's loading state: heading, filter bar, the code breakdown,
 * then the row list — the same shapes in the same order the page renders them,
 * so the layout does not move when the two queries land.
 */
export default function ApprovalFailuresLoading() {
  return (
    <div className="p-4">
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4 flex flex-col gap-3" aria-hidden="true">
        <div>
          <span className="bo-skeleton block h-2.5 w-32" />
          <span className="bo-skeleton mt-2 block h-5 w-52" />
          <span className="bo-skeleton mt-2 block h-3 w-full max-w-2xl" />
        </div>
        <div className="bo-panel flex flex-wrap items-end gap-3 px-3 py-2">
          <span className="bo-skeleton block h-7 w-56" />
          <span className="bo-skeleton block h-7 w-36" />
          <span className="bo-skeleton block h-7 w-36" />
        </div>
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <PanelSkeleton rows={5} label={approvalMessages.failures.section} />
        <PanelSkeleton rows={10} label={approvalMessages.failureQueue.title} />
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
