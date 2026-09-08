import Link from 'next/link'
import { shortId } from '@/lib/format'
import type { RevokeOutcome } from './contract'
import { billingMessages } from './messages'

/**
 * What the last revoke attempt did, told back to the operator.
 *
 * The action redirects with its outcome in the URL rather than returning a
 * value, so the answer survives the reload that shows the freshly written
 * order. Only our own outcome token and the referral's uuid travel there — the
 * sentence is composed here, from strings this application owns.
 */

const TONE_CLASS: Readonly<Record<RevokeOutcome, string>> = {
  success: 'bg-success-soft text-success-text',
  noop: 'bg-info-soft text-info-text',
  notfound: 'bg-warning-soft text-warning-text',
  invalid: 'bg-warning-soft text-warning-text',
  forbidden: 'bg-critical-soft text-critical-text',
  failed: 'bg-critical-soft text-critical-text',
}

export function ActionResultBanner({
  outcome,
  message,
  referralId,
  dismissHref,
}: {
  outcome: RevokeOutcome
  /** The composed sentence, built by the page from what it queried. */
  message: string
  referralId: string | null
  /** The same page without the result parameters. */
  dismissHref: string
}) {
  return (
    <div
      role="status"
      className={[
        'mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2',
        TONE_CLASS[outcome],
      ].join(' ')}
    >
      <p className="text-[12px] font-medium">
        {message}
        {referralId ? (
          <span className="ml-2 font-mono text-[11px] opacity-70">{shortId(referralId)}</span>
        ) : null}
      </p>
      <Link
        href={dismissHref}
        className="h-6 rounded-md border border-current/25 px-2 text-[11px] font-medium leading-6"
      >
        {billingMessages.revoke.dismiss}
      </Link>
    </div>
  )
}
