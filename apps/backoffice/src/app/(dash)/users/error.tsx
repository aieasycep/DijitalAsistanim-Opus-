'use client'

import Link from 'next/link'
import { messages } from '@/lib/messages'
import { userMessages } from '@/components/users/messages'

/**
 * The users area's error boundary.
 *
 * It renders a message, a working retry and a way out — and nothing from the
 * thrown error itself. A PostgREST failure can quote the row it choked on, and
 * this tool's promise is that such a string never reaches a screen, so the
 * digest is all that is shown; the real error stays in the server log where a
 * developer, not an operator, reads it.
 */
export default function UsersError({
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
        <p className="mt-1 text-[13px] text-muted">{messages.errors.unexpectedBody}</p>

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
            href="/users"
            className="inline-flex h-8 items-center rounded-md border border-hairline px-4 text-[13px] font-medium text-muted hover:text-ink"
          >
            {userMessages.detail.notFoundAction}
          </Link>
        </div>
      </div>
    </div>
  )
}
