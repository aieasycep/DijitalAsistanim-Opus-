import Link from 'next/link'
import { healthMessages, healthOutcomeMessages, healthTargetLabels } from '@/lib/messages/health'
import { isHealthTarget, type CheckOutcome } from './contract'

/**
 * What the last check actually did, stated on the page it came back to.
 *
 * The wording is chosen so a partial success cannot be mistaken for a success:
 * "ölçüm yapıldı, kayıt eksik" is a different banner from "ölçüm tamamlandı",
 * and it is amber rather than green, because the table underneath is then
 * showing something older than what was just observed.
 *
 * The banner reads a token from this codebase's own vocabulary and a target
 * name from the roster. Nothing a provider wrote reaches it, and nothing a
 * crafted URL puts in `sonucHedef` renders unless it is one of the seven names
 * the console declares.
 */

const TONE_CLASS = {
  success: 'border-success/40 bg-success-soft text-success-text',
  warning: 'border-warning/40 bg-warning-soft text-warning-text',
  critical: 'border-critical/40 bg-critical-soft text-critical-text',
} as const

export interface ResultBannerProps {
  outcome: CheckOutcome
  /** A roster target when one was checked, null for the whole roster. */
  target: string | null
  /** How many measurements reached the database. */
  checked: number
  dismissHref: string
}

export function ResultBanner({ outcome, target, checked, dismissHref }: ResultBannerProps) {
  const message = healthOutcomeMessages[outcome]
  const named = target !== null && isHealthTarget(target) ? healthTargetLabels[target] : null

  return (
    <div
      role="status"
      className={[
        'mb-4 flex items-start justify-between gap-3 rounded-md border px-3 py-2.5',
        TONE_CLASS[message.tone],
      ].join(' ')}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">
          {message.title}
          {named === null ? '' : ` — ${named}`}
        </p>
        <p className="mt-0.5 text-[12px] opacity-90">{message.body}</p>
        {checked > 0 ? (
          <p className="mt-0.5 text-[11px] opacity-80 tabular-nums">
            {healthMessages.window.samples(checked)}
          </p>
        ) : null}
      </div>
      <Link
        href={dismissHref}
        scroll={false}
        className="shrink-0 text-[12px] font-medium underline underline-offset-2"
      >
        {healthMessages.check.dismiss}
      </Link>
    </div>
  )
}
