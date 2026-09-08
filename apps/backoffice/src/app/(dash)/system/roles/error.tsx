'use client'

import Link from 'next/link'
// Imported from the leaf module rather than the barrel: this file is a Client
// Component, and the barrel also re-exports the server components, which reach
// `@/lib/db` and its service-role key.
import { ADMINS_PATH } from '@/components/admins/contract'
import { messages } from '@/lib/messages'
import { adminMessages } from '@/lib/messages/admins'

/**
 * The role matrix's error boundary.
 *
 * The page itself settles its one query and renders a card-level error when it
 * fails, so reaching this boundary means something outside that query threw —
 * a missing configuration, a session that expired mid-render. It offers the
 * retry and a way back to the roster, and quotes nothing from the error but the
 * digest the server log is keyed by.
 */
export default function RolesError({
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
      <p className="mt-1 text-[13px] text-muted">{adminMessages.errors.matrixFailed}</p>
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
          href={ADMINS_PATH}
          className="h-8 rounded-md border border-hairline px-4 text-[13px] leading-8 font-medium text-muted hover:text-ink"
        >
          {adminMessages.roles.backToAdmins}
        </Link>
      </div>
    </div>
  )
}
