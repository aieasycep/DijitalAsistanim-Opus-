import type { ReactNode } from 'react'
import { messages } from '@/lib/messages'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { cn } from '@/components/ui/utils'

/**
 * The frame every chart in this console sits in.
 *
 * ---------------------------------------------------------------------------
 * A CHART IS EVIDENCE, SO IT COMES WITH ITS NUMBERS
 * ---------------------------------------------------------------------------
 *
 * Every chart carries a table of the same values, in a native `<details>` —
 * open it and the figures are there. That is the accessibility answer (an SVG
 * of a trend line is not readable to a screen reader, and no `aria-label` makes
 * it so), and it is also the operations answer: "roughly 700" is not something
 * to put in a ticket, and an operator should never have to squint at a pixel to
 * find out whether it was 2 failures or 20.
 *
 * `<details>` rather than a toggle button because it needs no JavaScript, is
 * keyboard-operable and announces its own state.
 *
 * ---------------------------------------------------------------------------
 * FOUR STATES, AND "EMPTY" IS NOT "ZERO"
 * ---------------------------------------------------------------------------
 *
 * A window with no rows renders the empty state and says so. It does not render
 * a flat line at zero, which would claim a measurement nobody took — the same
 * rule `bo_system_health.is_stale` enforces on the health probes.
 *
 * ---------------------------------------------------------------------------
 * IDENTITY IS NEVER COLOUR ALONE
 * ---------------------------------------------------------------------------
 *
 * Two or more series always get a legend, with the swatch beside a written
 * label, and the same labels head the table columns. A reader who cannot
 * separate two hues still has two named columns.
 */

export interface ChartLegendEntry {
  readonly label: string
  readonly color: string
}

export interface ChartTableData {
  /** Header row. The first entry names the x axis. */
  readonly columns: readonly string[]
  /** Already formatted — the table and the tooltip must not disagree. */
  readonly rows: readonly (readonly string[])[]
}

export interface ChartFrameProps {
  title: string
  /** What is counted, over what window, from which view. */
  description?: string
  /** Top-right slot: a range picker, a link to the full page. */
  action?: ReactNode
  /** A one-sentence description of the shape, for the `role="img"` label. */
  summary?: string

  loading?: boolean
  error?: string | null
  errorHint?: string
  errorAction?: ReactNode
  empty?: boolean
  emptyMessage?: string
  emptyHint?: string

  /** Rendered when there are two or more series. */
  legend?: readonly ChartLegendEntry[]
  /** The same numbers, readable. Always supplied. */
  table: ChartTableData
  /** Plot height in pixels. The frame owns it so the states match it. */
  height?: number
  children: ReactNode
  className?: string
}

export function ChartFrame({
  title,
  description,
  action,
  summary,
  loading = false,
  error = null,
  errorHint,
  errorAction,
  empty = false,
  emptyMessage,
  emptyHint,
  legend,
  table,
  height = 220,
  children,
  className,
}: ChartFrameProps) {
  const showLegend = legend !== undefined && legend.length >= 2

  return (
    <section className={cn('bo-panel overflow-hidden', className)}>
      <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          {description ? <p className="mt-0.5 text-[12px] text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      {showLegend ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3">
          {legend.map((entry) => (
            <li key={entry.label} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="px-2 py-3">
        {error !== null ? (
          <ErrorState message={error} hint={errorHint} action={errorAction} />
        ) : loading ? (
          <>
            {/* Outside the `aria-hidden` bars: a live region nested inside a
                hidden subtree is never announced. */}
            <span role="status" className="sr-only">
              {messages.chart.loading}
            </span>
            <div className="flex items-end gap-1.5 px-2" style={{ height }} aria-hidden="true">
              {LOADING_BAR_HEIGHTS.map((percent, index) => (
                <span
                  key={index}
                  className="bo-skeleton flex-1"
                  style={{ height: `${percent}%` }}
                />
              ))}
            </div>
          </>
        ) : empty ? (
          <EmptyState message={emptyMessage ?? messages.chart.empty} hint={emptyHint} />
        ) : (
          <div
            role="img"
            aria-label={summary === undefined ? title : `${title}. ${summary}`}
            style={{ height }}
          >
            {children}
          </div>
        )}
      </div>

      {error === null && !loading && !empty ? (
        <details className="border-t border-hairline">
          <summary className="cursor-pointer px-4 py-1.5 text-[11px] font-medium text-faint hover:text-ink">
            {messages.chart.showTable}
          </summary>
          <div className="bo-scroll max-h-64 border-t border-hairline">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{messages.chart.tableCaption(title)}</caption>
              <thead className="sticky top-0 bg-surface2/80">
                <tr className="border-b border-hairline">
                  {table.columns.map((column, index) => (
                    <th
                      key={column}
                      scope="col"
                      className={cn(
                        'bo-kicker px-3 py-1.5 whitespace-nowrap',
                        index === 0 ? 'text-left' : 'text-right',
                      )}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-hairline/70 last:border-b-0">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={cn(
                          'px-3 py-1 text-[12px] whitespace-nowrap',
                          cellIndex === 0 ? 'text-left text-muted' : 'text-right text-ink',
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  )
}

/** A skeleton shaped like a chart rather than like a paragraph. */
const LOADING_BAR_HEIGHTS = [42, 68, 55, 80, 47, 72, 60, 88, 51, 66, 74, 58] as const
