import Link from 'next/link'
import { CardError, CardSkeleton } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { RuleCount } from '@/lib/queries/billing'
import { BILLING_RECONCILIATION_PATH, RULE_PARAM, type ReconciliationRuleId } from './contract'
import { billingMessages } from './messages'

/**
 * The reconciliation rules, as the page's filter.
 *
 * Each tile carries its own count and is a link that re-queries the list below
 * it — the count and the control are the same object, so there is no filter
 * that says one thing while the table shows another. A rule with no matches
 * still renders: zero is the answer an operator most wants to see, and hiding
 * it would make a healthy platform look like a broken page.
 */

const TONE_CLASS = {
  critical: {
    zero: 'text-muted',
    hit: 'text-critical-text',
  },
  warning: {
    zero: 'text-muted',
    hit: 'text-warning-text',
  },
} as const

export function RuleTiles({
  counts,
  active,
  error,
}: {
  counts: readonly RuleCount[]
  active: ReconciliationRuleId
  error: string | null
}) {
  if (error !== null) {
    return <CardError message={error} hint={messages.errors.queryFailedHint} />
  }

  if (counts.length === 0) {
    return <CardSkeleton lines={3} />
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {counts.map((entry) => {
        const rule = billingMessages.rules[entry.id]
        const isActive = entry.id === active
        const valueClass =
          entry.count > 0 ? TONE_CLASS[entry.severity].hit : TONE_CLASS[entry.severity].zero

        return (
          <li key={entry.id}>
            <Link
              href={`${BILLING_RECONCILIATION_PATH}?${RULE_PARAM}=${entry.id}`}
              aria-current={isActive ? 'true' : undefined}
              className={[
                'block h-full rounded-xl border px-3 py-2.5 transition-colors',
                isActive
                  ? 'border-primary/50 bg-primary-soft/40'
                  : 'border-hairline bg-surface hover:border-primary/40 hover:bg-surface2/50',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="bo-kicker">{rule.short}</span>
                <span className={['text-[20px] font-semibold tabular-nums', valueClass].join(' ')}>
                  {formatNumber(entry.count)}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] font-medium text-ink">{rule.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-faint">{rule.description}</p>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
