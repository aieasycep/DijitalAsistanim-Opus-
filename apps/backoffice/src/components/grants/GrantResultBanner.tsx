import Link from 'next/link'
import type { BadgeTone } from '@/components/ui/Badge'
import { shortId } from '@/lib/format'
import { grantMessages, grantOutcomeMessages } from '@/lib/messages/grants'
import { isGrantOutcome, isUuidParam } from './contract'
import { outcomeTone } from './presentation'

/**
 * What the last action did, said in the operator's own language.
 *
 * The only things that cross the URL are a token from `GRANT_OUTCOMES` — this
 * codebase's own vocabulary, re-checked here rather than trusted — and a uuid.
 * Nothing a database or a provider wrote can reach this banner, and no address
 * can: a grant is identified by its own id, never by the account's address.
 * An unrecognised token renders nothing at all rather than an empty box.
 */

const TONE_CLASS: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-surface2 text-muted',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
  info: 'bg-info-soft text-info-text',
  primary: 'bg-primary-soft text-primary-on-soft',
}

export function GrantResultBanner({
  outcome,
  grantId,
  dismissHref,
}: {
  /** The raw `?result=` value. */
  outcome: string
  /** The raw `?grant=` value, or an empty string. */
  grantId: string
  /** Where the "kapat" link goes: this page without the result parameters. */
  dismissHref: string
}) {
  if (!isGrantOutcome(outcome)) return null

  const copy = grantOutcomeMessages[outcome]
  const tone = outcomeTone(outcome)
  const reference = isUuidParam(grantId) ? shortId(grantId) : null

  return (
    <div
      role="status"
      className={`flex flex-wrap items-start justify-between gap-3 rounded-md px-3 py-2.5 ${TONE_CLASS[tone]}`}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">
          {copy.title}
          {reference === null ? null : (
            <span className="ml-1.5 font-mono opacity-80">{reference}</span>
          )}
        </p>
        <p className="mt-0.5 max-w-prose text-[12px] opacity-90">{copy.body}</p>
      </div>
      <Link
        href={dismissHref}
        className="shrink-0 text-[12px] font-medium underline underline-offset-2"
      >
        {grantMessages.banner.dismiss}
      </Link>
    </div>
  )
}
