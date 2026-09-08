/**
 * The chart vocabulary: what a series is, what a point is, and which colour a
 * series gets.
 *
 * Pure and serialisable, because a chart is a Client Component (Recharts
 * measures the DOM) and everything it is given has to cross the RSC boundary.
 * That constraint is also the design: a page hands over rows and labels, never
 * a formatter function and never a React node, so a chart cannot be handed
 * something the server was supposed to redact.
 */

/** The six categorical slots, in the fixed order they are assigned. */
export const CHART_SERIES_COLORS = [
  'var(--da-chart-1)',
  'var(--da-chart-2)',
  'var(--da-chart-3)',
  'var(--da-chart-4)',
  'var(--da-chart-5)',
  'var(--da-chart-6)',
] as const

export const MAX_SERIES = CHART_SERIES_COLORS.length

/**
 * Status colours, which are NOT categorical slots.
 *
 * Green, amber and coral mean something in this console — healthy, watch it,
 * act now — and reusing them for "the third provider" would make a chart lie by
 * association. They are here for the case where the series genuinely *are*
 * states: approved / rejected / failed, in which case green for approved is the
 * honest choice rather than an arbitrary one.
 */
export const CHART_STATUS_COLORS = {
  success: 'var(--da-success)',
  warning: 'var(--da-warning)',
  critical: 'var(--da-critical)',
  info: 'var(--da-info)',
  neutral: 'var(--da-text-tertiary)',
} as const

export type ChartStatusTone = keyof typeof CHART_STATUS_COLORS

/**
 * One series.
 *
 * `key` addresses the field on each point; `label` is what a human reads in the
 * legend, the tooltip and the table. `color` is optional: leave it off and the
 * series takes its slot colour by position, which is what keeps a filter that
 * removes one series from repainting the others.
 */
export interface ChartSeries {
  readonly key: string
  readonly label: string
  /** A `CHART_SERIES_COLORS` slot or a `CHART_STATUS_COLORS` value. */
  readonly color?: string
  /** Appended to values in the tooltip and the table, e.g. `ms`. */
  readonly unit?: string
}

/**
 * One point. `x` is the category or the instant; the rest are the series
 * values, `null` where there is genuinely no measurement — which is not the
 * same as zero and is not drawn as zero.
 */
export interface ChartPoint {
  readonly x: string
  readonly [series: string]: string | number | null
}

/** A slice of a donut. */
export interface ChartSlice {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly color?: string
}

/** How the x axis of a time series should be labelled. */
export type ChartTimeUnit = 'hour' | 'day' | 'category'

/** How a value should be written in the tooltip, the axis and the table. */
export type ChartValueFormat = 'number' | 'compact' | 'cost_micros' | 'percent' | 'duration_seconds'

/** The colour a series ends up with: its own, or its slot. */
export function seriesColor(series: ChartSeries, index: number): string {
  return series.color ?? CHART_SERIES_COLORS[index % MAX_SERIES] ?? CHART_SERIES_COLORS[0]
}
