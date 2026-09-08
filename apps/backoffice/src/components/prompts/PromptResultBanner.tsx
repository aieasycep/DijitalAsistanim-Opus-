import Link from 'next/link'
import type { BadgeTone } from '@/components/ui/Badge'
import { promptMessages, promptOutcomeMessages } from '@/lib/messages/prompts'
import { isPromptOutcome, versionReference } from './contract'
import { outcomeTone } from './presentation'

/**
 * What the last action did, said in the operator's own language.
 *
 * The only things that cross the URL are a token from `PROMPT_OUTCOMES`, a
 * feature name and a version number — this codebase's own vocabulary, re-checked
 * here rather than trusted, so nothing a database or a provider wrote can reach
 * this banner. An unrecognised token renders nothing at all rather than an empty
 * box.
 *
 * `activated` reads as a statement rather than a celebration: it succeeded, and
 * it also means every call for that feature is now being made with a different
 * instruction than it was a minute ago.
 */

const TONE_CLASS: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-surface2 text-muted',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
  info: 'bg-info-soft text-info-text',
  primary: 'bg-primary-soft text-primary-on-soft',
}

export function PromptResultBanner({
  outcome,
  feature,
  version,
  dismissHref,
}: {
  /** The raw `?result=` value. */
  outcome: string
  /** The raw `?pf=` value, or an empty string. */
  feature: string
  /** The raw `?pv=` value, or an empty string. */
  version: string
  /** Where the "kapat" link goes: this page without the result parameters. */
  dismissHref: string
}) {
  if (!isPromptOutcome(outcome)) return null

  const copy = promptOutcomeMessages[outcome]
  const tone = outcomeTone(outcome)

  const versionNumber = Number(version)
  const reference =
    feature === '' || !Number.isSafeInteger(versionNumber) || versionNumber <= 0
      ? feature === ''
        ? null
        : feature
      : versionReference(feature, versionNumber)

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
        {promptMessages.banner.dismiss}
      </Link>
    </div>
  )
}
