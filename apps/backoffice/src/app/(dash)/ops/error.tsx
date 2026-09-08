'use client'

import Link from 'next/link'
import { messages } from '@/lib/messages'
// Imported from the leaf modules rather than the `@/components/ops` barrel:
// this file is a client component, and the barrel also re-exports the server
// components, which reach `@/lib/db` and its service-role key. A barrel import
// here would drag that whole graph across the client boundary.
import { OPS_PATH } from '@/components/ops/contract'
import { opsMessages } from '@/components/ops/messages'

/**
 * The ops area's error boundary.
 *
 * It sits at the segment rather than at the root so a thrown query takes down
 * this area and not the whole console, and it renders two ways out: retry the
 * same render, or go back to the dashboard, which settles each panel separately
 * and will usually come up with the working ones.
 *
 * It renders nothing from the error but the digest. A PostgREST failure can
 * quote the row it choked on, and this tool's entire promise is that such a
 * string never reaches a screen — the real error is in the server log, keyed by
 * that digest, which is where it belongs.
 */
export default function OpsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="p-4">
      <div role="alert" className="bo-panel mx-auto max-w-lg p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-3 flex size-8 items-center justify-center rounded-full bg-critical-soft text-critical-text"
        >
          !
        </span>
        <h1 className="text-[16px] font-semibold text-ink">{messages.errors.unexpectedTitle}</h1>
        <p className="mt-1 text-[13px] text-muted">{messages.errors.unexpectedBody}</p>
        <p className="mt-1 text-[12px] text-faint">{messages.errors.queryFailedHint}</p>

        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-faint">
            <span className="bo-kicker mr-1">digest</span>
            {error.digest}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="h-8 rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
          >
            {messages.table.retry}
          </button>
          <Link
            href={OPS_PATH}
            className="h-8 rounded-md border border-hairline px-4 text-[13px] leading-8 font-medium text-muted hover:text-ink"
          >
            {opsMessages.queue.backToDashboard}
          </Link>
        </div>
      </div>
    </div>
  )
}
