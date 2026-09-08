import Link from 'next/link'
import type { ReviewOutcome } from './contract'
import { REVIEW_OUTCOME_MESSAGE, approvalMessages } from './messages'

/**
 * What the last recorded review actually did.
 *
 * The outcome travels in the URL rather than in component state, so the answer
 * survives the redirect, is linkable, and cannot drift out of step with the
 * tables underneath it — which were re-queried on the same render.
 *
 * `subject` is an action type or a failure code. Both are vocabulary this
 * codebase defines; neither can carry anything a user wrote.
 */

const TONE_CLASS: Readonly<Record<'success' | 'critical', string>> = {
  success: 'bg-success-soft text-success-text',
  critical: 'bg-critical-soft text-critical-text',
}

export interface ResultBannerProps {
  outcome: ReviewOutcome
  subject: string | null
  /** This page without the result parameters — the dismiss target. */
  dismissHref: string
}

export function ResultBanner({ outcome, subject, dismissHref }: ResultBannerProps) {
  const tone = outcome === 'recorded' ? 'success' : 'critical'

  return (
    <div
      role="status"
      className={[
        'mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2',
        TONE_CLASS[tone],
      ].join(' ')}
    >
      <span className="bo-kicker text-current opacity-70">{approvalMessages.result.heading}</span>
      <span className="text-[13px] font-semibold">{REVIEW_OUTCOME_MESSAGE[outcome]}</span>

      {subject ? (
        <span className="text-[12px] opacity-90">
          <span className="bo-kicker mr-1 text-current opacity-70">
            {approvalMessages.result.subject}
          </span>
          <span className="font-mono">{subject}</span>
        </span>
      ) : null}

      <Link
        href={dismissHref}
        className="ml-auto text-[12px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
      >
        {approvalMessages.result.dismiss}
      </Link>
    </div>
  )
}
