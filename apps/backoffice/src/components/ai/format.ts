import { OPS_LOCALE } from '@/lib/format'
import { messages } from '@/lib/messages'

/**
 * Number formatting this area needs and the console-wide helpers deliberately
 * do not provide.
 *
 * `formatCostMicros` in `@/lib/format` renders a figure a human spends — two
 * decimals, or none once it passes ten. That is right for a monthly total and
 * useless for the cost of one model call, which is four zeroes and then a
 * digit. Rounding those to `$0,00` would make every model on the page look
 * identical, which is the one comparison the page exists to support.
 *
 * Everything here formats for `tr-TR` like the rest of the console.
 */

/** Cost of a single model call. Four decimals, and an honest floor below that. */
export function formatCostPerEvent(costMicros: number, events: number): string {
  if (events <= 0) return '—'
  const units = costMicros / events / 1_000_000
  if (units === 0) return `${messages.units.currency}0`
  if (units < 0.0001) return `<${messages.units.currency}0,0001`
  const digits = units >= 1 ? 2 : 4
  return `${messages.units.currency}${units.toLocaleString(OPS_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

/** A derived average, to one decimal: `12,4`. */
export function formatAverage(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value.toLocaleString(OPS_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/**
 * A ratio as a percentage. One decimal below 10% so a rejection rate creeping
 * from 2% to 4% is visible rather than rounding into the same "%3".
 */
export function formatRatio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const percent = value * 100
  const digits = percent > 0 && percent < 10 ? 1 : 0
  return `%${percent.toLocaleString(OPS_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

/** `part / whole`, or null when the denominator cannot support a rate. */
export function ratioOf(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/** Seconds, to one decimal under a minute: `4,2 sn` / `3 dk`. */
export function formatSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${formatAverage(seconds)} ${messages.units.seconds}`
  return `${formatAverage(seconds / 60)} ${messages.units.minutes}`
}

export type DeltaDirection = 'up' | 'down' | 'flat' | 'none'

export interface Delta {
  direction: DeltaDirection
  /** Absolute change as a share of the previous period, e.g. `0.42`. */
  ratio: number | null
}

/**
 * Change against the previous period.
 *
 * `none` when there is nothing to compare against: a first week of data has no
 * trend, and inventing "+100%" out of a zero baseline is how a dashboard
 * teaches its operators to ignore it.
 */
export function deltaOf(current: number, previous: number): Delta {
  if (previous <= 0) return { direction: current > 0 ? 'none' : 'flat', ratio: null }
  if (current === previous) return { direction: 'flat', ratio: 0 }
  const ratio = (current - previous) / previous
  return { direction: ratio > 0 ? 'up' : 'down', ratio: Math.abs(ratio) }
}
