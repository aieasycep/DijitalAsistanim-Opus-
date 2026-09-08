import type { BadgeTone } from '@/components/ui'

/**
 * A one-row bar chart cell.
 *
 * Share-of-total is the kind of number that is read wrong as a bare percentage
 * in a column of six — the bar is what makes "most accounts are free" visible
 * at a glance. It is decoration over a figure that is always printed beside it,
 * so it is hidden from assistive technology rather than duplicated into it.
 */

const TONE_CLASS: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-faint/50',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical',
  info: 'bg-info',
  primary: 'bg-primary',
}

export function MeterBar({
  value,
  max,
  tone = 'neutral',
  width = 'w-24',
}: {
  value: number
  max: number
  tone?: BadgeTone
  /** Tailwind width utility for the track. */
  width?: string
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  // A non-zero value always draws something, so "a few" never looks like "none".
  const percent = value > 0 ? Math.max(2, Math.round(ratio * 100)) : 0

  return (
    <span
      aria-hidden="true"
      className={['inline-block h-1.5 overflow-hidden rounded-full bg-surface2', width].join(' ')}
    >
      <span
        className={['block h-full rounded-full', TONE_CLASS[tone]].join(' ')}
        style={{ width: `${percent}%` }}
      />
    </span>
  )
}
