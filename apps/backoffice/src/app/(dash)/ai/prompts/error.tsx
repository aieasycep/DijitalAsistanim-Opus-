'use client'

import Link from 'next/link'
// Imported from the leaf modules rather than the `@/components/prompts` barrel:
// this file is a Client Component, and the barrel also re-exports server
// components that reach `@/lib/db` and its service-role key. A barrel import
// here would drag that whole graph across the client boundary.
import { PROMPTS_PATH } from '@/components/prompts/contract'
import { messages } from '@/lib/messages'
import { promptMessages } from '@/lib/messages/prompts'

/**
 * The prompt area's error boundary, covering the list, the record, the composer
 * and the editor.
 *
 * It sits on this segment rather than at `/ai` so a thrown query takes down the
 * prompt screens and not the spend and quality pages beside them, and it offers
 * two ways out: retry the same render, or fall back to the list, which settles
 * each panel separately and will usually come up with the working ones.
 *
 * It renders nothing from the error but the digest. A PostgREST failure can
 * quote the row it choked on, and this tool's whole promise is that such a
 * string never reaches a screen — the real error is in the server log, keyed by
 * that digest, which is where it belongs.
 */
export default function PromptsError({
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
          href={PROMPTS_PATH}
          className="h-8 rounded-md border border-hairline px-4 text-[13px] leading-8 font-medium text-muted hover:text-ink"
        >
          {promptMessages.list.title}
        </Link>
      </div>
    </div>
  )
}
