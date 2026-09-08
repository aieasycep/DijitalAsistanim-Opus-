import {
  formatAxisDay,
  formatAxisHour,
  formatCompact,
  formatCostMicros,
  formatDuration,
  formatNumber,
  formatRatio,
} from '@/lib/format'
import type { ChartTimeUnit, ChartValueFormat } from './contract.ts'

/**
 * Value and tick formatting for charts.
 *
 * A separate module because both the chart and its table fallback have to
 * render the same number the same way — a tooltip saying `$12,40` above a table
 * saying `12400000` is two answers to one question.
 *
 * `ChartValueFormat` is a token rather than a function so it can cross the RSC
 * boundary as a prop. A page names the shape of its numbers; the client turns
 * the token into the formatter.
 */

export function formatChartValue(
  value: number | null | undefined,
  format: ChartValueFormat,
  unit?: string,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'

  const rendered = ((): string => {
    switch (format) {
      case 'compact':
        return formatCompact(value)
      case 'cost_micros':
        return formatCostMicros(value)
      case 'percent':
        return formatRatio(value)
      case 'duration_seconds':
        return formatDuration(value)
      case 'number':
        return formatNumber(value)
    }
  })()

  return unit === undefined || format === 'cost_micros' || format === 'percent'
    ? rendered
    : `${rendered} ${unit}`
}

/** Axis ticks are always compact: a full-width count collides with its neighbour. */
export function formatAxisValue(value: number, format: ChartValueFormat): string {
  return format === 'cost_micros' || format === 'percent'
    ? formatChartValue(value, format)
    : formatCompact(value)
}

/** The x tick. `category` passes the label through — it is already a word. */
export function formatChartCategory(value: string, unit: ChartTimeUnit): string {
  switch (unit) {
    case 'hour':
      return formatAxisHour(value)
    case 'day':
      return formatAxisDay(value)
    case 'category':
      return value
  }
}
