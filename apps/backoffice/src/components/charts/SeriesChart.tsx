import type { ReactNode } from 'react'
import { messages } from '@/lib/messages'
import { ChartFrame, type ChartLegendEntry, type ChartTableData } from './ChartFrame.tsx'
import { BarCanvas, LineCanvas } from './canvas.tsx'
import {
  seriesColor,
  type ChartPoint,
  type ChartSeries,
  type ChartTimeUnit,
  type ChartValueFormat,
} from './contract.ts'
import { formatChartCategory, formatChartValue } from './format.ts'

/**
 * The three series charts: a line for a trend, grouped bars for a comparison,
 * stacked bars for a composition.
 *
 * Each is a Server Component that renders the frame — heading, legend, states,
 * table — and hands only the plot to Recharts on the client. A page therefore
 * writes one element and gets the accessibility, the states and the numbers for
 * free, rather than remembering to add them.
 *
 * Which one to reach for:
 *   - `LineChart`        change over time. Never for categories: a line between
 *                        two providers implies a path between them that does
 *                        not exist.
 *   - `BarChart`         magnitude, compared side by side.
 *   - `StackedBarChart`  a total, broken into parts that add up to it. If the
 *                        parts do not sum to something meaningful, this is the
 *                        wrong chart and `BarChart` is the right one.
 *
 * There is no dual-axis variant, and there will not be one. Two measures on two
 * scales in one frame invite a comparison the geometry cannot support; two
 * charts stacked, or one indexed to a common base, say the true thing instead.
 */

export interface SeriesChartProps {
  title: string
  /** What is counted, over what window, from which view. */
  description?: string
  /** One sentence naming the shape, for the plot's accessible label. */
  summary?: string
  /** Top-right slot: a link to the full page, a range picker. */
  action?: ReactNode

  data: readonly ChartPoint[]
  series: readonly ChartSeries[]
  /** How to label the x axis. `day` and `hour` expect ISO instants in `x`. */
  timeUnit?: ChartTimeUnit
  /** How to write every value: in the axis, the tooltip and the table. */
  valueFormat?: ChartValueFormat
  /** Column heading for the x axis in the table fallback. */
  categoryLabel?: string

  loading?: boolean
  error?: string | null
  errorHint?: string
  errorAction?: ReactNode
  emptyMessage?: string
  emptyHint?: string

  height?: number
  className?: string
}

function legendFor(series: readonly ChartSeries[]): readonly ChartLegendEntry[] {
  return series.map((definition, index) => ({
    label: definition.label,
    color: seriesColor(definition, index),
  }))
}

function tableFor(
  data: readonly ChartPoint[],
  series: readonly ChartSeries[],
  timeUnit: ChartTimeUnit,
  valueFormat: ChartValueFormat,
  categoryLabel: string,
): ChartTableData {
  return {
    columns: [categoryLabel, ...series.map((definition) => definition.label)],
    rows: data.map((point) => [
      formatChartCategory(point.x, timeUnit),
      ...series.map((definition) => {
        const value = point[definition.key]
        return formatChartValue(
          typeof value === 'number' ? value : null,
          valueFormat,
          definition.unit,
        )
      }),
    ]),
  }
}

/**
 * True when the window produced no measurement at all.
 *
 * A row of zeroes is a measurement and is drawn. A window with no rows, or with
 * nothing but nulls, is not: drawing it as a flat line at zero would claim a
 * reading nobody took.
 */
function isEmpty(data: readonly ChartPoint[], series: readonly ChartSeries[]): boolean {
  if (data.length === 0) return true
  return !data.some((point) =>
    series.some((definition) => typeof point[definition.key] === 'number'),
  )
}

function SeriesChart({
  props,
  canvas,
}: {
  props: SeriesChartProps
  canvas: (resolved: { timeUnit: ChartTimeUnit; valueFormat: ChartValueFormat }) => ReactNode
}) {
  const timeUnit = props.timeUnit ?? 'day'
  const valueFormat = props.valueFormat ?? 'number'
  const categoryLabel = props.categoryLabel ?? messages.chart.seriesLabel

  return (
    <ChartFrame
      title={props.title}
      description={props.description}
      summary={props.summary}
      action={props.action}
      loading={props.loading}
      error={props.error ?? null}
      errorHint={props.errorHint}
      errorAction={props.errorAction}
      empty={isEmpty(props.data, props.series)}
      emptyMessage={props.emptyMessage}
      emptyHint={props.emptyHint}
      legend={legendFor(props.series)}
      table={tableFor(props.data, props.series, timeUnit, valueFormat, categoryLabel)}
      height={props.height}
      className={props.className}
    >
      {canvas({ timeUnit, valueFormat })}
    </ChartFrame>
  )
}

export function LineChart(props: SeriesChartProps) {
  return (
    <SeriesChart
      props={props}
      canvas={({ timeUnit, valueFormat }) => (
        <LineCanvas
          data={props.data}
          series={props.series}
          timeUnit={timeUnit}
          valueFormat={valueFormat}
        />
      )}
    />
  )
}

export function BarChart(props: SeriesChartProps) {
  return (
    <SeriesChart
      props={props}
      canvas={({ timeUnit, valueFormat }) => (
        <BarCanvas
          data={props.data}
          series={props.series}
          timeUnit={timeUnit}
          valueFormat={valueFormat}
          stacked={false}
        />
      )}
    />
  )
}

export function StackedBarChart(props: SeriesChartProps) {
  return (
    <SeriesChart
      props={props}
      canvas={({ timeUnit, valueFormat }) => (
        <BarCanvas
          data={props.data}
          series={props.series}
          timeUnit={timeUnit}
          valueFormat={valueFormat}
          stacked
        />
      )}
    />
  )
}
