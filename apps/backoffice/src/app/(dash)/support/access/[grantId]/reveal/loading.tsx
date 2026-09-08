import { StatGrid, StatTileSkeleton } from '@/components/ui'
import { messages } from '@/lib/messages'
import { supportAccessMessages } from '@/lib/messages/support-access'

/**
 * The reveal console's loading state.
 *
 * The warning panel is drawn at full weight rather than as a grey block: it is
 * the one thing on this page that must never appear to arrive late, and an
 * operator who reaches the form before the sentence explaining what the form
 * does has read a different screen than the one that was designed.
 */
export default function SupportAccessRevealLoading() {
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

      <div className="flex flex-col gap-4">
        <section className="rounded-md border border-critical/40 bg-critical-soft px-4 py-3">
          <h2 className="text-[13px] font-semibold text-critical-text">
            {supportAccessMessages.reveal.noticeTitle}
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[12px] text-critical-text/90">
            {supportAccessMessages.reveal.notices.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <div aria-hidden="true" className="flex flex-col gap-4">
          <StatGrid>
            {Array.from({ length: 4 }, (_unused, index) => (
              <StatTileSkeleton key={index} />
            ))}
          </StatGrid>

          <PanelSkeleton rows={2} label={supportAccessMessages.reveal.grantTitle} />
          <PanelSkeleton rows={5} label={supportAccessMessages.reveal.scopePickerTitle} />
          <PanelSkeleton rows={6} label={supportAccessMessages.reveal.logTitle} />
        </div>
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
