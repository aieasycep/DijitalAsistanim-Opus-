'use client'

import type { TooltipContentProps } from 'recharts'
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { messages } from '@/lib/messages'
import type {
  ChartPoint,
  ChartSeries,
  ChartSlice,
  ChartTimeUnit,
  ChartValueFormat,
} from './contract.ts'
import { seriesColor } from './contract.ts'
import { formatAxisValue, formatChartCategory, formatChartValue } from './format.ts'

/**
 * The Recharts layer.
 *
 * The only client code in `components/charts`, and it is deliberately thin:
 * everything above it — the frame, the legend, the table, the states — is
 * server-rendered, so the browser downloads a plotting library and nothing
 * else. Data crosses the boundary as plain rows and tokens, never as
 * formatters, so a chart cannot be handed a function that reads something the
 * server had already decided to withhold.
 *
 * The mark specifications are the same in all four: 2px strokes, 4px rounded
 * data ends, a 2px surface gap between stacked segments and between adjacent
 * bars, a horizontal-only recessive grid, no axis lines, and text in ink
 * tokens rather than in the series colour. A crosshair on the time series, a
 * per-mark highlight on the categorical ones.
 */

const GRID = 'var(--da-chart-grid)'
const AXIS = 'var(--da-chart-axis)'
const SURFACE = 'var(--da-chart-surface)'
const INK = 'var(--da-text)'
const MUTED = 'var(--da-text-secondary)'

const AXIS_TICK = { fill: AXIS, fontSize: 11 } as const
const MARGIN = { top: 4, right: 8, bottom: 0, left: 0 } as const

/**
 * Recharts injects `active`, `payload` and `label` into whatever is handed to
 * `content`. They are optional here because the element form of `content` means
 * TypeScript only ever sees the props written at the call site.
 */
type InjectedTooltipProps = Partial<TooltipContentProps<number, string>>

/**
 * The tooltip.
 *
 * Values are written by the same `formatChartValue` the table uses, so hovering
 * a point and reading the row underneath give the same number. Labels are ink,
 * not series colour — the swatch carries the identity.
 */
function ChartTooltip({
  active,
  payload,
  label,
  series,
  timeUnit,
  valueFormat,
}: InjectedTooltipProps & {
  series: readonly ChartSeries[]
  timeUnit: ChartTimeUnit
  valueFormat: ChartValueFormat
}) {
  if (active !== true || payload === undefined || payload.length === 0) return null

  const heading =
    typeof label === 'string' ? formatChartCategory(label, timeUnit) : String(label ?? '')

  return (
    <div className="rounded-md border border-hairline bg-surface px-2.5 py-2 shadow-lift">
      <p className="mb-1 text-[11px] font-semibold text-ink">{heading}</p>
      <ul className="flex flex-col gap-0.5">
        {payload.map((entry, index) => {
          const key = typeof entry.dataKey === 'string' ? entry.dataKey : String(index)
          const definition = series.find((candidate) => candidate.key === key)
          const value = typeof entry.value === 'number' ? entry.value : null
          return (
            <li key={key} className="flex items-center gap-2 text-[11px]">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: entry.color ?? MUTED }}
              />
              <span className="text-muted">{definition?.label ?? key}</span>
              <span className="ml-auto font-semibold text-ink tabular-nums">
                {formatChartValue(value, valueFormat, definition?.unit)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The donut's tooltip: one slice, its value, and its share of the whole. */
function DonutTooltip({
  active,
  payload,
  valueFormat,
  total,
}: InjectedTooltipProps & { valueFormat: ChartValueFormat; total: number }) {
  if (active !== true || payload === undefined || payload.length === 0) return null
  const datum = payload[0]?.payload as ChartSlice | undefined
  if (datum === undefined) return null

  const share = total > 0 ? datum.value / total : 0
  return (
    <div className="rounded-md border border-hairline bg-surface px-2.5 py-2 shadow-lift">
      <p className="text-[11px] font-semibold text-ink">{datum.label}</p>
      <p className="text-[11px] text-muted tabular-nums">
        {formatChartValue(datum.value, valueFormat)} ·{' '}
        {messages.chart.shareOfTotal(`%${Math.round(share * 100).toLocaleString('tr-TR')}`)}
      </p>
    </div>
  )
}

export interface CanvasProps {
  data: readonly ChartPoint[]
  series: readonly ChartSeries[]
  timeUnit: ChartTimeUnit
  valueFormat: ChartValueFormat
}

export function LineCanvas({ data, series, timeUnit, valueFormat }: CanvasProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsLineChart data={data as ChartPoint[]} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="x"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickFormatter={(value: string) => formatChartCategory(value, timeUnit)}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(value: number) => formatAxisValue(value, valueFormat)}
        />
        <Tooltip
          cursor={{ stroke: AXIS, strokeDasharray: '2 4' }}
          content={<ChartTooltip series={series} timeUnit={timeUnit} valueFormat={valueFormat} />}
        />
        {series.map((definition, index) => (
          <Line
            key={definition.key}
            type="monotone"
            dataKey={definition.key}
            name={definition.label}
            stroke={seriesColor(definition, index)}
            strokeWidth={2}
            // A gap is a gap: `null` is "not measured" and must not be joined
            // across as if the line had passed through it.
            connectNulls={false}
            dot={data.length <= 14 ? { r: 2.5, strokeWidth: 0 } : false}
            activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}

export function BarCanvas({
  data,
  series,
  timeUnit,
  valueFormat,
  stacked,
}: CanvasProps & { stacked: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsBarChart data={data as ChartPoint[]} margin={MARGIN} barGap={2} barCategoryGap="18%">
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="x"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          minTickGap={16}
          tickFormatter={(value: string) => formatChartCategory(value, timeUnit)}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(value: number) => formatAxisValue(value, valueFormat)}
        />
        <Tooltip
          cursor={{ fill: GRID, fillOpacity: 0.35 }}
          content={<ChartTooltip series={series} timeUnit={timeUnit} valueFormat={valueFormat} />}
        />
        {series.map((definition, index) => (
          <Bar
            key={definition.key}
            dataKey={definition.key}
            name={definition.label}
            fill={seriesColor(definition, index)}
            stackId={stacked ? 'stack' : undefined}
            // Rounded only at the free end, so the mark stays anchored to the
            // baseline. In a stack only the topmost segment has a free end.
            radius={stacked && index < series.length - 1 ? 0 : [4, 4, 0, 0]}
            // The 2px separation between stacked segments, drawn in the panel
            // colour so it reads as a gap rather than as an outline.
            stroke={stacked ? SURFACE : undefined}
            strokeWidth={stacked ? 2 : 0}
            isAnimationActive={false}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}

export function DonutCanvas({
  slices,
  colors,
  valueFormat,
  centerValue,
  centerLabel,
}: {
  slices: readonly ChartSlice[]
  colors: readonly string[]
  valueFormat: ChartValueFormat
  centerValue: string
  centerLabel: string
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)

  return (
    <div className="relative h-full">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Tooltip content={<DonutTooltip valueFormat={valueFormat} total={total} />} />
          <Pie
            data={slices as ChartSlice[]}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke={SURFACE}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((slice, index) => (
              <Cell
                key={slice.key}
                fill={slice.color ?? colors[index % colors.length] ?? colors[0]}
              />
            ))}
          </Pie>
        </RechartsPieChart>
      </ResponsiveContainer>

      {/* The headline the donut is actually answering, in ink. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] leading-6 font-semibold tabular-nums" style={{ color: INK }}>
          {centerValue}
        </span>
        <span className="bo-kicker">{centerLabel}</span>
      </div>
    </div>
  )
}
