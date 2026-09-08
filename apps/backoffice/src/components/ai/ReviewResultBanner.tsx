import Link from 'next/link'
import { shortId } from '@/lib/format'
import type { ReviewOutcome } from './contract'
import { aiMessages } from './messages'

/**
 * What the last quota review actually did.
 *
 * The outcome arrives in the URL rather than in component state, so the answer
 * survives the redirect, is linkable, and cannot drift out of step with the
 * table underneath it — which was re-queried on the same render.
 *
 * Nothing here comes from a database error message. The action reports one of
 * four tokens of its own vocabulary; a PostgREST string never reaches a screen.
 */

const OUTCOME_MESSAGE: Readonly<Record<ReviewOutcome, string>> = {
  recorded: aiMessages.reviewResult.recorded,
  invalid: aiMessages.reviewResult.invalid,
  forbidden: aiMessages.reviewResult.forbidden,
  failed: aiMessages.reviewResult.failed,
}

const TONE_CLASS: Readonly<Record<'success' | 'critical', string>> = {
  success: 'bg-success-soft text-success-text',
  critical: 'bg-critical-soft text-critical-text',
}

export interface ReviewResultBannerProps {
  outcome: ReviewOutcome
  decision: string | null
  userId: string | null
  /** The same page without the result parameters — the dismiss target. */
  dismissHref: string
}

export function ReviewResultBanner({
  outcome,
  decision,
  userId,
  dismissHref,
}: ReviewResultBannerProps) {
  const tone = outcome === 'recorded' ? 'success' : 'critical'

  return (
    <div
      role="status"
      className={[
        'mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2',
        TONE_CLASS[tone],
      ].join(' ')}
    >
      <span className="bo-kicker text-current opacity-70">{aiMessages.reviewResult.heading}</span>
      <span className="text-[13px] font-semibold">{OUTCOME_MESSAGE[outcome]}</span>

      {userId ? (
        <span className="text-[12px] opacity-90">
          <span className="bo-kicker mr-1 text-current opacity-70">
            {aiMessages.reviewResult.user}
          </span>
          <span className="font-mono">{shortId(userId)}</span>
        </span>
      ) : null}

      {decision ? (
        <span className="text-[12px] opacity-90">
          <span className="bo-kicker mr-1 text-current opacity-70">
            {aiMessages.reviewResult.decisionLabel}
          </span>
          {aiMessages.ceiling.decisions[decision] ?? decision}
        </span>
      ) : null}

      <Link
        href={dismissHref}
        className="ml-auto text-[12px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
      >
        {aiMessages.reviewResult.dismiss}
      </Link>
    </div>
  )
}
