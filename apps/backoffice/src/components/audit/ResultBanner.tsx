import Link from 'next/link'
import { shortId } from '@/lib/format'
import { isReviewFiled, type ReviewOutcome } from './contract'
import { REVIEW_OUTCOME_MESSAGE, auditMessages } from './messages'

/**
 * What the last review note actually did.
 *
 * The outcome travels in the URL rather than in component state, so the answer
 * survives the redirect, is linkable between operators, and cannot drift out of
 * step with the table underneath it — which was re-queried on the same render.
 *
 * Only an outcome token and an entry id travel here. No message from the
 * database ever reaches this component, because the action never produces one.
 */

const TONE_CLASS: Readonly<Record<'success' | 'warning' | 'critical', string>> = {
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
}

function toneFor(outcome: ReviewOutcome): 'success' | 'warning' | 'critical' {
  if (isReviewFiled(outcome)) return 'success'
  if (outcome === 'yinelenen') return 'warning'
  return 'critical'
}

export interface ResultBannerProps {
  outcome: ReviewOutcome
  entryId: string | null
  /** The same page without the result parameters — the dismiss target. */
  dismissHref: string
}

export function ResultBanner({ outcome, entryId, dismissHref }: ResultBannerProps) {
  return (
    <div
      role="status"
      className={[
        'mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2',
        TONE_CLASS[toneFor(outcome)],
      ].join(' ')}
    >
      <span className="bo-kicker text-current opacity-70">{auditMessages.result.heading}</span>
      <span className="text-[13px] font-semibold">{REVIEW_OUTCOME_MESSAGE[outcome]}</span>

      {entryId !== null ? (
        <span className="text-[12px] opacity-90">
          <span className="bo-kicker mr-1 text-current opacity-70">
            {auditMessages.result.entry}
          </span>
          <span className="font-mono">{shortId(entryId)}</span>
        </span>
      ) : null}

      <Link
        href={dismissHref}
        className="ml-auto text-[12px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
      >
        {auditMessages.result.dismiss}
      </Link>
    </div>
  )
}
