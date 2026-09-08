/**
 * The chart kit.
 *
 * Four forms, and no fifth without a reason: a line for change over time,
 * grouped bars for comparison, stacked bars for composition, a donut for a
 * single breakdown. Everything else this console needs to say is a number, a
 * table, or a stat tile — and a number that would be clearer as a number does
 * not become clearer by being drawn.
 */

export {
  ChartFrame,
  type ChartFrameProps,
  type ChartLegendEntry,
  type ChartTableData,
} from './ChartFrame.tsx'
export { LineChart, BarChart, StackedBarChart, type SeriesChartProps } from './SeriesChart.tsx'
export { DonutChart, type DonutChartProps } from './DonutChart.tsx'
export {
  CHART_SERIES_COLORS,
  CHART_STATUS_COLORS,
  MAX_SERIES,
  seriesColor,
  type ChartPoint,
  type ChartSeries,
  type ChartSlice,
  type ChartStatusTone,
  type ChartTimeUnit,
  type ChartValueFormat,
} from './contract.ts'
export { formatChartValue, formatChartCategory } from './format.ts'
