import { OPS_LOCALE } from '@/lib/format'
import { approvalMessages } from './messages'

/**
 * Display helpers specific to rates.
 *
 * `@/lib/format` already owns dates, counts, money and durations; what it does
 * not have is the vocabulary this area is built around — a rate, and the change
 * in a rate between two periods. Those live here rather than being pushed into
 * the shared module, which other agents own.
 */

/**
 * A fraction as a Turkish percentage. One decimal below ten per cent, where the
 * difference between 4% and 4.4% is the difference between "fine" and "watch
 * it", and none above, where it is noise.
 */
export function formatRate(value: number | null): string {
  if (value === null) return '—'
  const percent = value * 100
  const digits = percent > 0 && percent < 10 ? 1 : 0
  return `%${percent.toLocaleString(OPS_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

/** Tone thresholds for a rejection rate, in one place so panels agree. */
export type RateTone = 'success' | 'neutral' | 'warning' | 'critical'

export function rejectionRateTone(value: number | null): RateTone {
  if (value === null) return 'neutral'
  if (value >= 0.4) return 'critical'
  if (value >= 0.2) return 'warning'
  return 'success'
}

export interface RateDelta {
  label: string
  /** `critical` when the rate got worse, `success` when it improved. */
  tone: RateTone
}

/**
 * The change in a rejection rate, in percentage points.
 *
 * Anything under one point is reported as flat: two periods of a small sample
 * will differ by a fraction of a point constantly, and a table that shows every
 * one of those as a movement teaches an operator to ignore the column.
 */
export function formatRateDelta(delta: number | null, previousDecided: number): RateDelta {
  if (delta === null || previousDecided === 0) {
    return { label: approvalMessages.types.trendNoBaseline, tone: 'neutral' }
  }

  const points = delta * 100
  if (Math.abs(points) < 1) {
    return { label: approvalMessages.types.trendFlat, tone: 'neutral' }
  }

  const magnitude = Math.abs(points).toLocaleString(OPS_LOCALE, { maximumFractionDigits: 0 })
  return points > 0
    ? { label: approvalMessages.types.trendUp(magnitude), tone: 'critical' }
    : { label: approvalMessages.types.trendDown(magnitude), tone: 'success' }
}
