import type { ReactNode } from 'react'
import { formatRatio } from '@/lib/format'
import { messages } from '@/lib/messages'
import { ChartFrame, type ChartLegendEntry } from './ChartFrame.tsx'
import { DonutCanvas } from './canvas.tsx'
import {
  CHART_SERIES_COLORS,
  MAX_SERIES,
  type ChartSlice,
  type ChartValueFormat,
} from './contract.ts'
import { formatChartValue } from './format.ts'

/**
 * The donut: one total, broken into the handful of parts that make it up.
 *
 * ---------------------------------------------------------------------------
 * WHEN THIS IS THE WRONG CHART
 * ---------------------------------------------------------------------------
 *
 * A donut answers "what is this made of", and only when the parts sum to a
 * meaningful whole and there are few of them. It cannot answer "which is
 * bigger" as well as a bar can, and it cannot answer "is it getting worse" at
 * all. Two slices at 31% and 34% are indistinguishable by eye — which is
 * exactly why the total sits in the middle and the numbers sit in the legend,
 * rather than the reader being asked to judge an angle.
 *
 * Past six slices the tail folds into "Diğer" instead of inventing a seventh
 * hue. Six is where the categorical palette stops being separable, and a
 * generated colour would break the one rule that makes these charts readable
 * for a colour-blind operator.
 */

export interface DonutChartProps {
  title: string
  description?: string
  summary?: string
  action?: ReactNode

  slices: readonly ChartSlice[]
  /** How to write every value, in the centre, the legend and the table. */
  valueFormat?: ChartValueFormat
  /** What the centre number is, e.g. "toplam çağrı". */
  centerLabel?: string
  /** Column heading for the slice names in the table fallback. */
  categoryLabel?: string
  /** Slices past this many fold into "Diğer". Capped at the palette size. */
  maxSlices?: number

  loading?: boolean
  error?: string | null
  errorHint?: string
  errorAction?: ReactNode
  emptyMessage?: string
  emptyHint?: string

  height?: number
  className?: string
}

/**
 * Order by size, keep the largest, and fold the rest into one honest slice.
 * The fold is neutral grey, not a palette hue: "Diğer" is not a category, it is
 * the absence of one.
 */
function foldSlices(
  slices: readonly ChartSlice[],
  maxSlices: number,
): { visible: readonly ChartSlice[]; folded: number } {
  const sorted = [...slices].sort((a, b) => b.value - a.value)
  const limit = Math.max(1, Math.min(maxSlices, MAX_SERIES))
  if (sorted.length <= limit) return { visible: sorted, folded: 0 }

  const kept = sorted.slice(0, limit - 1)
  const rest = sorted.slice(limit - 1)
  const other: ChartSlice = {
    key: '__other__',
    label: messages.chart.otherSeries,
    value: rest.reduce((sum, slice) => sum + slice.value, 0),
    color: 'var(--da-text-tertiary)',
  }
  return { visible: [...kept, other], folded: rest.length }
}

export function DonutChart({
  title,
  description,
  summary,
  action,
  slices,
  valueFormat = 'number',
  centerLabel,
  categoryLabel,
  maxSlices = MAX_SERIES,
  loading = false,
  error = null,
  errorHint,
  errorAction,
  emptyMessage,
  emptyHint,
  height = 220,
  className,
}: DonutChartProps) {
  const positive = slices.filter((slice) => slice.value > 0)
  const { visible } = foldSlices(positive, maxSlices)
  const total = visible.reduce((sum, slice) => sum + slice.value, 0)

  const colored = visible.map((slice, index) => ({
    ...slice,
    color: slice.color ?? CHART_SERIES_COLORS[index % MAX_SERIES] ?? CHART_SERIES_COLORS[0],
  }))

  const legend: readonly ChartLegendEntry[] = colored.map((slice) => ({
    label: slice.label,
    color: slice.color,
  }))

  return (
    <ChartFrame
      title={title}
      description={description}
      summary={summary}
      action={action}
      loading={loading}
      error={error}
      errorHint={errorHint}
      errorAction={errorAction}
      empty={total <= 0}
      emptyMessage={emptyMessage}
      emptyHint={emptyHint}
      legend={legend}
      table={{
        columns: [
          categoryLabel ?? messages.chart.seriesLabel,
          messages.chart.totalLabel,
          messages.chart.shareOfTotal('%'),
        ],
        rows: colored.map((slice) => [
          slice.label,
          formatChartValue(slice.value, valueFormat),
          total > 0 ? formatRatio(slice.value / total, 0) : '—',
        ]),
      }}
      height={height}
      className={className}
    >
      <DonutCanvas
        slices={colored}
        colors={CHART_SERIES_COLORS}
        valueFormat={valueFormat}
        centerValue={formatChartValue(total, valueFormat)}
        centerLabel={centerLabel ?? messages.chart.totalLabel}
      />
    </ChartFrame>
  )
}
