import type { RateTone } from './format'

/**
 * A one-line magnitude bar under a rate in a dense table.
 *
 * Decoration in the strict sense — the number it sits under is always rendered
 * as text and the bar is `aria-hidden` — but it is the difference between
 * reading six rejection rates and *seeing* that one of them is twice the rest.
 *
 * A rate is its own scale, so the bar is drawn against 100% rather than against
 * the largest value in the column: a 4% rejection rate should look small even
 * when it is the worst row on the page. A non-zero rate never renders thinner
 * than 2%, because a bar that rounds to invisible reads as a zero.
 */

export interface RateBarProps {
  /** A fraction between 0 and 1, or null when there is nothing to draw. */
  value: number | null
  tone: RateTone
}

const TONE_CLASS: Readonly<Record<RateTone, string>> = {
  success: 'bg-success',
  neutral: 'bg-disabled',
  warning: 'bg-warning',
  critical: 'bg-critical',
}

export function RateBar({ value, tone }: RateBarProps) {
  if (value === null) return null
  const percent = value <= 0 ? 0 : Math.max(2, Math.min(100, Math.round(value * 100)))

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

/**
 * A magnitude bar for a count, scaled against the largest count in the same
 * column so a table of small numbers still shows its shape.
 */
export function CountBar({
  value,
  max,
  tone = 'neutral',
}: {
  value: number
  max: number
  tone?: RateTone
}) {
  const percent = value <= 0 || max <= 0 ? 0 : Math.max(3, Math.round((value / max) * 100))

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
