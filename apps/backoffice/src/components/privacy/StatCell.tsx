import { StatTile, type BadgeTone } from '@/components/ui'

/**
 * One tile that can also be a failure.
 *
 * A failed query renders the label, an em dash and the message, never a zero.
 * Zero and "we could not ask" are different answers, and a deadline dashboard
 * that confuses them is worse than one that is missing — an operator would read
 * "0 süre aşımı" and move on.
 */

export interface StatCellProps {
  label: string
  /** Null renders an em dash: the query succeeded but had nothing to show. */
  value: string | null
  hint?: string
  tone?: BadgeTone
  href?: string
  /** When set, the tile renders as an error instead of a number. */
  error: string | null
}

export function StatCell({ label, value, hint, tone = 'neutral', href, error }: StatCellProps) {
  if (error !== null) {
    return (
      <div className="bo-panel px-3 py-2.5" role="alert">
        <span className="bo-kicker">{label}</span>
        <span className="mt-1 block text-[24px] leading-7 font-semibold text-faint">—</span>
        <span className="mt-0.5 block text-[12px] text-critical-text">{error}</span>
      </div>
    )
  }

  return <StatTile label={label} value={value ?? '—'} hint={hint} tone={tone} href={href} />
}
