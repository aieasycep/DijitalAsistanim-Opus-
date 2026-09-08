'use client'

import Link from 'next/link'
import { SUPPORT_PATH } from '@/components/tickets/contract'
import { messages } from '@/lib/messages'
import { ticketMessages } from '@/lib/messages/tickets'

/**
 * The detail page's error boundary.
 *
 * Narrower than the area boundary above it: a failure here is one view being
 * unreachable, and the operator's next move is either to retry or to go back
 * and pick up a different ticket. Both are offered; neither is a dead end. As
 * everywhere else in this tool, nothing from the thrown error is rendered
 * except its digest.
 */
export default function TicketDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="p-4">
      <div role="alert" className="bo-panel mx-auto max-w-md p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-3 flex size-8 items-center justify-center rounded-full bg-critical-soft text-critical-text"
        >
          !
        </span>
        <h1 className="text-[16px] font-semibold text-ink">{messages.errors.unexpectedTitle}</h1>
        <p className="mt-1 text-[13px] text-muted">{messages.errors.queryFailedHint}</p>

        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-faint">
            <span className="bo-kicker mr-1">digest</span>
            {error.digest}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="h-8 rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
          >
            {messages.table.retry}
          </button>
          <Link
            href={SUPPORT_PATH}
            className="inline-flex h-8 items-center rounded-md border border-hairline px-4 text-[13px] font-medium text-muted hover:text-ink"
          >
            {ticketMessages.detail.backToQueue}
          </Link>
        </div>
      </div>
    </div>
  )
}
