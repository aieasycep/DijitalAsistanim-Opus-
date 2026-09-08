'use client'

import { messages } from '@/lib/messages'

/**
 * The page-level error boundary.
 *
 * It renders a message and a working retry, and it renders no detail from the
 * thrown error. That is not just tidiness: an error from PostgREST can quote
 * the row it failed on, and this tool's whole promise is that such a string
 * never reaches a screen. The digest is enough to find the real error in the
 * server log, where it belongs.
 */
export default function BackofficeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div role="alert" className="bo-panel w-full max-w-md p-6 text-center">
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

        <button
          type="button"
          onClick={reset}
          className="mt-4 h-8 rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
        >
          {messages.table.retry}
        </button>
      </div>
    </div>
  )
}
