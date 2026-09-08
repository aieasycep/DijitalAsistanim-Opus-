import Link from 'next/link'
import type { BadgeTone } from '@/components/ui/Badge'
import { flagMessages, flagOutcomeMessages } from '@/lib/messages/flags'
import { isFlagOutcome } from './contract'
import { outcomeTone } from './presentation'

/**
 * What the last action did, said in the operator's own language.
 *
 * The only thing that crosses the URL is a token from `FLAG_OUTCOMES` and the
 * flag's key — this codebase's own vocabulary, re-checked here rather than
 * trusted, so nothing a database or a provider wrote can reach this banner. An
 * unrecognised token renders nothing at all rather than an empty box.
 *
 * `killed` reads as a warning even though it succeeded: pulling a kill switch
 * works, and it still means something is now off for everybody.
 */

const TONE_CLASS: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-surface2 text-muted',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
  info: 'bg-info-soft text-info-text',
  primary: 'bg-primary-soft text-primary-on-soft',
}

export function FlagResultBanner({
  outcome,
  flagKey,
  dismissHref,
}: {
  /** The raw `?result=` value. */
  outcome: string
  /** The raw `?flag=` value, or an empty string. */
  flagKey: string
  /** Where the "kapat" link goes: this page without the result parameters. */
  dismissHref: string
}) {
  if (!isFlagOutcome(outcome)) return null

  const copy = flagOutcomeMessages[outcome]
  const tone = outcomeTone(outcome)

  return (
    <div
      role="status"
      className={`flex flex-wrap items-start justify-between gap-3 rounded-md px-3 py-2.5 ${TONE_CLASS[tone]}`}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">
          {copy.title}
          {flagKey === '' ? null : <span className="ml-1.5 font-mono opacity-80">{flagKey}</span>}
        </p>
        <p className="mt-0.5 max-w-prose text-[12px] opacity-90">{copy.body}</p>
      </div>
      <Link
        href={dismissHref}
        className="shrink-0 text-[12px] font-medium underline underline-offset-2"
      >
        {flagMessages.banner.dismiss}
      </Link>
    </div>
  )
}
