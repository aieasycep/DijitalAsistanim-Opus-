import type { BadgeTone } from '@/components/ui'

/**
 * A magnitude bar for a dense table.
 *
 * It is decoration in the strict sense — the figure it sits beside is always
 * printed as text and the bar is `aria-hidden` — but it is the difference
 * between reading thirty daily costs and *seeing* which day doubled.
 *
 * Width is relative to the largest value in the same column, so a column of
 * small numbers still shows its shape, and a non-zero value never renders
 * thinner than 3% because a bar that rounds to invisible reads as a zero.
 */

export interface BarProps {
  value: number
  max: number
  tone?: BadgeTone
  /** Tailwind width utility for the track. Omit to fill the cell. */
  width?: string
  /** Sits under a number rather than beside it. */
  block?: boolean
}

const TONE_CLASS: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-faint/50',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical',
  info: 'bg-info',
  primary: 'bg-primary',
}

export function Bar({ value, max, tone = 'primary', width, block = false }: BarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const percent = value <= 0 ? 0 : Math.max(3, Math.round(ratio * 100))

  return (
    <span
      aria-hidden="true"
      className={[
        'h-1 overflow-hidden rounded-full bg-surface2',
        block ? 'mt-1 block w-full' : 'inline-block align-middle',
        width ?? (block ? '' : 'w-16'),
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {percent > 0 ? (
        <span
          className={['block h-full rounded-full', TONE_CLASS[tone]].join(' ')}
          style={{ width: `${percent}%` }}
        />
      ) : null}
    </span>
  )
}
