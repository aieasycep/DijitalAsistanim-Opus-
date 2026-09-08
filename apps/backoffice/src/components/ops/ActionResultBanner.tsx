import Link from 'next/link'
import { shortId } from '@/lib/format'
import { isSuccessfulOutcome, type ResyncOutcome } from './contract'
import { opsMessages } from './messages'

/**
 * What the last resync actually did.
 *
 * The outcome arrives in the URL rather than in component state, so the answer
 * survives the redirect, is linkable, and cannot drift out of sync with the
 * table underneath it — which was re-queried on the same render.
 *
 * `code` is our own `ErrorCode` vocabulary or one of the action's own tokens. A
 * provider's message never reaches this component, because the action never
 * parses one out of the response.
 */

const OUTCOME_MESSAGE: Readonly<Record<ResyncOutcome, string>> = {
  success: opsMessages.resyncResult.success,
  partial: opsMessages.resyncResult.partial,
  noop: opsMessages.resyncResult.noop,
  rejected: opsMessages.resyncResult.rejected,
  unreachable: opsMessages.resyncResult.unreachable,
  failed: opsMessages.resyncResult.failed,
  invalid: opsMessages.resyncResult.invalid,
  forbidden: opsMessages.resyncResult.forbidden,
}

const TONE_CLASS: Readonly<Record<'success' | 'warning' | 'critical', string>> = {
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
}

function toneFor(outcome: ResyncOutcome): 'success' | 'warning' | 'critical' {
  if (outcome === 'success') return 'success'
  if (outcome === 'partial' || outcome === 'noop') return 'warning'
  return 'critical'
}

export interface ActionResultBannerProps {
  outcome: ResyncOutcome
  code: string | null
  accountId: string | null
  /** Same page without the result parameters — the dismiss target. */
  dismissHref: string
}

export function ActionResultBanner({
  outcome,
  code,
  accountId,
  dismissHref,
}: ActionResultBannerProps) {
  const tone = toneFor(outcome)

  return (
    <div
      role="status"
      className={[
        'mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2',
        TONE_CLASS[tone],
      ].join(' ')}
    >
      <span className="bo-kicker text-current opacity-70">{opsMessages.resyncResult.heading}</span>
      <span className="text-[13px] font-semibold">{OUTCOME_MESSAGE[outcome]}</span>

      {accountId ? (
        <span className="text-[12px] opacity-90">
          <span className="bo-kicker mr-1 text-current opacity-70">
            {opsMessages.resyncResult.account}
          </span>
          <span className="font-mono">{shortId(accountId)}</span>
        </span>
      ) : null}

      {code && !isSuccessfulOutcome(outcome) ? (
        <span className="text-[12px] opacity-90">
          <span className="bo-kicker mr-1 text-current opacity-70">
            {opsMessages.resyncResult.codeLabel}
          </span>
          <span className="font-mono">{code}</span>
        </span>
      ) : null}

      <Link
        href={dismissHref}
        className="ml-auto text-[12px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
      >
        {opsMessages.resyncResult.dismiss}
      </Link>
    </div>
  )
}
