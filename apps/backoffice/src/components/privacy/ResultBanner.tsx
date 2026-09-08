import Link from 'next/link'
import { shortId } from '@/lib/format'
import { isOrderedOutcome, type RerunOutcome } from './contract'
import { RERUN_OUTCOME_MESSAGE, privacyMessages } from './messages'

/**
 * What the last re-run order actually did.
 *
 * The outcome travels in the URL rather than in component state, so the answer
 * survives the redirect, is linkable between operators, and cannot drift out of
 * step with the table underneath it — which was re-queried on the same render.
 *
 * Only an outcome token and a request id travel here. No message from the
 * database and no failure text from a provider is ever parsed into this
 * component, because the action never produces one.
 */

const TONE_CLASS: Readonly<Record<'success' | 'warning' | 'critical', string>> = {
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
}

function toneFor(outcome: RerunOutcome): 'success' | 'warning' | 'critical' {
  if (isOrderedOutcome(outcome)) return 'success'
  if (outcome === 'duplicate' || outcome === 'ineligible') return 'warning'
  return 'critical'
}

export interface ResultBannerProps {
  outcome: RerunOutcome
  requestId: string | null
  /** The same page without the result parameters — the dismiss target. */
  dismissHref: string
}

export function ResultBanner({ outcome, requestId, dismissHref }: ResultBannerProps) {
  return (
    <div
      role="status"
      className={[
        'mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2',
        TONE_CLASS[toneFor(outcome)],
      ].join(' ')}
    >
      <span className="bo-kicker text-current opacity-70">
        {privacyMessages.rerunResult.heading}
      </span>
      <span className="text-[13px] font-semibold">{RERUN_OUTCOME_MESSAGE[outcome]}</span>

      {requestId !== null ? (
        <span className="text-[12px] opacity-90">
          <span className="bo-kicker mr-1 text-current opacity-70">
            {privacyMessages.rerunResult.request}
          </span>
          <span className="font-mono">{shortId(requestId)}</span>
        </span>
      ) : null}

      <Link
        href={dismissHref}
        className="ml-auto text-[12px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
      >
        {privacyMessages.rerunResult.dismiss}
      </Link>
    </div>
  )
}
