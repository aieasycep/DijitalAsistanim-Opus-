'use client'

import Link from 'next/link'
import { ANNOUNCEMENTS_PATH } from '@/components/announcements/contract'
import { messages } from '@/lib/messages'
import { announcementMessages } from '@/lib/messages/announcements'

/**
 * The announcements area's error boundary.
 *
 * A failure here is almost always one query being unreachable rather than
 * anything about an announcement, so the operator gets a retry and a way back
 * to the list — neither of which is a dead end. Nothing from the thrown error is
 * rendered except its digest: a PostgREST message can name the row it failed on,
 * and this tool's promise is that such a string never reaches a screen.
 */
export default function AnnouncementsError({
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
            href={ANNOUNCEMENTS_PATH}
            className="inline-flex h-8 items-center rounded-md border border-hairline px-4 text-[13px] font-medium text-muted hover:text-ink"
          >
            {announcementMessages.detail.backToList}
          </Link>
        </div>
      </div>
    </div>
  )
}
