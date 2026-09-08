/**
 * A share of a total, drawn.
 *
 * The bar is the only graphic in the audit area, and it earns its place: a
 * column of counts sorted by size tells you the order, and the bar tells you
 * the gap — that one action is nine tenths of the traffic and the rest is
 * noise, which is the thing an operator actually wants from a distribution.
 *
 * It is drawn with a div rather than a chart library so it costs nothing and
 * renders identically on the server. The number is always printed beside it,
 * because a bar alone is not evidence.
 */

export interface ShareBarProps {
  value: number
  total: number
  /** Widest bar in the table, so bars are comparable rather than each maxed out. */
  peak?: number
  label: string
  tone?: 'primary' | 'critical' | 'neutral'
}

const TONE_CLASS = {
  primary: 'bg-primary',
  critical: 'bg-critical',
  neutral: 'bg-muted',
} as const

export function ShareBar({ value, total, peak, label, tone = 'primary' }: ShareBarProps) {
  const scale = peak !== undefined && peak > 0 ? peak : total
  const width = scale > 0 ? Math.max(2, Math.round((value / scale) * 100)) : 0
  const share = total > 0 ? Math.round((value / total) * 100) : 0

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-[11px] tabular-nums text-faint">%{share}</span>
      <span
        role="img"
        aria-label={`${label}: %${share}`}
        className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface2"
      >
        <span
          className={['block h-full rounded-full', TONE_CLASS[tone]].join(' ')}
          style={{ width: `${width}%` }}
        />
      </span>
    </div>
  )
}
