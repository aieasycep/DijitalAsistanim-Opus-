'use client'

import { useEffect, useRef, useState } from 'react'
import { ACCESS_DEDUPE_MINUTES, type AccessOutcome } from './contract'
import { ACCESS_OUTCOME_TONE, auditMessages } from './messages'

/**
 * The receipt that this view was itself audited.
 *
 * A console that records everything except its own operators reading the record
 * is the first thing an assessor asks about, and it is a fair question: the
 * whole point of a trail is that nobody is outside it. So opening this page
 * files an `audit.log_inspected` row naming the staff member and the exact
 * filter set they were looking at, and that row appears in the table below like
 * any other.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS AN EFFECT AND NOT PART OF THE RENDER
 * ---------------------------------------------------------------------------
 *
 * The obvious implementation — write the row while the Server Component runs —
 * is wrong twice over. A render is not allowed to have side effects, and Next
 * may run one for a prefetch nobody ever looks at, so the trail would fill with
 * rows for pages that were never on a screen. Instead the row is filed once the
 * page is actually in front of a person, by a Server Action this component
 * calls on mount, and the action de-duplicates server-side: one row per staff
 * member per filter set per {@link ACCESS_DEDUPE_MINUTES} minutes. Paging
 * through a result set does not re-file, because the cursor is not part of the
 * filter set; changing a filter does, because that is a different question
 * being asked of the data.
 *
 * The component renders its own state rather than working silently. An operator
 * should be able to see that the record was written — and, if it was not, that
 * their reading of the trail is missing from it.
 */

export interface AccessReceiptProps {
  action: (scopeKey: string) => Promise<AccessOutcome>
  /** Server-built token naming the active filter set. Never contains an address. */
  scopeKey: string
}

type ReceiptState = { kind: 'pending' } | { kind: 'settled'; outcome: AccessOutcome }

const TONE_CLASS: Readonly<Record<'success' | 'warning' | 'critical', string>> = {
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
}

export function AccessReceipt({ action, scopeKey }: AccessReceiptProps) {
  const [state, setState] = useState<ReceiptState>({ kind: 'pending' })
  const latestAction = useRef(action)
  latestAction.current = action

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'pending' })

    latestAction
      .current(scopeKey)
      .then((outcome) => {
        if (!cancelled) setState({ kind: 'settled', outcome })
      })
      .catch(() => {
        // The action already maps every failure it can see to `basarisiz`; this
        // catches the transport itself dying, which is the same news.
        if (!cancelled) setState({ kind: 'settled', outcome: 'basarisiz' })
      })

    return () => {
      cancelled = true
    }
  }, [scopeKey])

  const message =
    state.kind === 'pending'
      ? auditMessages.access.pending
      : state.outcome === 'islendi'
        ? auditMessages.access.recorded
        : state.outcome === 'zaten_var'
          ? auditMessages.access.deduped(ACCESS_DEDUPE_MINUTES)
          : auditMessages.access.failed

  const tone = state.kind === 'pending' ? null : ACCESS_OUTCOME_TONE[state.outcome]

  return (
    <div
      role="status"
      aria-busy={state.kind === 'pending'}
      className="bo-panel flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
    >
      <span className="bo-kicker">{auditMessages.access.heading}</span>

      <span
        className={[
          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
          tone === null ? 'bg-surface2 text-muted' : TONE_CLASS[tone],
        ].join(' ')}
      >
        {message}
      </span>

      <span className="text-[11px] text-faint">
        <span className="bo-kicker mr-1">{auditMessages.access.scope}</span>
        <span className="font-mono">{scopeKey}</span>
      </span>

      <span className="ml-auto max-w-xl text-[11px] text-faint">
        {auditMessages.access.explain(ACCESS_DEDUPE_MINUTES)}
      </span>
    </div>
  )
}
