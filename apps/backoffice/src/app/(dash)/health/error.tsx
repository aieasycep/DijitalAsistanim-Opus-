'use client'

import Link from 'next/link'
// Imported from the leaf module rather than the barrel: this file is a Client
// Component, and the barrel also re-exports the server components, which reach
// `@/lib/queries/health` and through it `@/lib/db` and its service-role key.
import { HEALTH_PATH } from '@/components/health/contract'
import { messages } from '@/lib/messages'
import { healthMessages } from '@/lib/messages/health'

/**
 * The health area's error boundary.
 *
 * It sits at the segment rather than at the root, so a failure here takes down
 * this section and not the console an operator is using to diagnose it. Both
 * pages settle their panels independently and will usually render something, so
 * reaching this boundary means the render itself failed — a missing session, a
 * missing migration — rather than one dead view.
 *
 * It renders nothing from the error but the digest. A PostgREST failure can
 * quote the row it choked on; the real error is in the server log, keyed by the
 * digest, which is where it belongs.
 */
export default function HealthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
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
          href={HEALTH_PATH}
          className="h-8 rounded-md border border-hairline px-4 text-[13px] leading-8 font-medium text-muted hover:text-ink"
        >
          {healthMessages.config.backToHealth}
        </Link>
      </div>
    </div>
  )
}
