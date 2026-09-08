import { messages } from '@/lib/messages'
import { supportAccessMessages } from '@/lib/messages/support-access'

/**
 * The request form's loading state.
 *
 * The consequence panel is rendered for real rather than as a skeleton: it is
 * static text, it is the most important thing on the page, and there is no
 * reason to make an operator wait for a query to read what they are about to
 * ask for.
 */
export default function NewSupportAccessLoading() {
  return (
    <>
      <span className="sr-only" role="status">
        {messages.table.loading}
      </span>

      <div className="mb-4" aria-hidden="true">
        <span className="bo-skeleton block h-2.5 w-40" />
        <span className="bo-skeleton mt-2 block h-5 w-64" />
        <span className="bo-skeleton mt-2 block h-3 w-[32rem] max-w-full" />
      </div>

      <div className="flex max-w-5xl flex-col gap-4">
        <section className="rounded-md border border-warning/40 bg-warning-soft px-4 py-3">
          <h2 className="text-[13px] font-semibold text-warning-text">
            {supportAccessMessages.request.consequenceTitle}
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[12px] text-warning-text/90">
            {supportAccessMessages.request.consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {Array.from({ length: 3 }, (_unused, index) => (
          <section key={index} className="bo-panel overflow-hidden" aria-hidden="true">
            <div className="border-b border-hairline px-4 py-2.5">
              <span className="bo-skeleton block h-3 w-52" />
            </div>
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 4 }, (_ignored, row) => (
                <span key={row} className="bo-skeleton block h-3 w-full" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
