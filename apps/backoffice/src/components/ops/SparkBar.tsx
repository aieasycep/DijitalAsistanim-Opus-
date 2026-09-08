/**
 * A one-line magnitude bar under a number in a dense table.
 *
 * It is decoration in the strict sense — the number it sits under is always
 * rendered as text, and the bar is `aria-hidden` — but it is the difference
 * between reading seven daily figures and *seeing* that Thursday was double.
 *
 * Width is relative to the largest value in the same column, so a column of
 * small numbers still shows its shape. A non-zero value never renders thinner
 * than 3%, because a bar that rounds to invisible reads as a zero.
 */

export interface SparkBarProps {
  value: number
  max: number
  tone?: 'primary' | 'critical' | 'info'
}

const TONE_CLASS = {
  primary: 'bg-primary',
  critical: 'bg-critical',
  info: 'bg-info',
} as const

export function SparkBar({ value, max, tone = 'primary' }: SparkBarProps) {
  const ratio = max > 0 ? value / max : 0
  const percent = value <= 0 ? 0 : Math.max(3, Math.round(ratio * 100))

  return (
    <span aria-hidden="true" className="mt-1 block h-1 w-full rounded-full bg-surface2">
      {percent > 0 ? (
        <span
          className={['block h-1 rounded-full', TONE_CLASS[tone]].join(' ')}
          style={{ width: `${percent}%` }}
        />
      ) : null}
    </span>
  )
}
