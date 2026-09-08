import type { ReactNode } from 'react'
import { messages } from '@/lib/messages'

/**
 * The table every backoffice list uses.
 *
 * It is generic over the row so a column cannot reference a field the row does
 * not have, and it owns all four states a real data table has to render:
 * loading, error, empty and populated. A page never renders a bare `<table>`,
 * which is how a failed query ends up as a blank panel.
 *
 * Usage:
 *
 *   const columns: readonly Column<BoUserRow>[] = [
 *     { key: 'user', header: 'Kullanıcı', cell: (r) => <Mono>{shortId(r.user_id)}</Mono> },
 *     { key: 'plan', header: 'Plan', align: 'right', cell: (r) => r.subscription_status },
 *   ]
 *
 *   <DataTable
 *     columns={columns}
 *     rows={rows}
 *     rowKey={(r) => r.user_id}
 *     error={error}
 *     emptyMessage="Kayıt yok."
 *   />
 *
 * `columns` is a plain array of objects rather than JSX children so a page can
 * build it conditionally, and so the header row and the body can never drift.
 */

export interface Column<Row> {
  /** Stable identity for the column. Also the React key for its cells. */
  key: string
  header: ReactNode
  /** Renders the cell. Returning `null` renders an em dash placeholder. */
  cell: (row: Row, index: number) => ReactNode
  align?: 'left' | 'right'
  /** Tailwind width utility, e.g. `w-40`. Optional. */
  width?: string
  /** Hidden below `md`, for columns that are context rather than content. */
  secondary?: boolean
  /** Header tooltip, for a column whose name has to be short. */
  title?: string
}

export interface DataTableProps<Row> {
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row, index: number) => string
  /** Renders the error state instead of the body. A message, not an Error. */
  error?: string | null
  /** Extra detail under the error message: what an operator should do next. */
  errorHint?: string
  /** Rendered inside the error state — a retry form, a link to a runbook. */
  errorAction?: ReactNode
  /** Renders the skeleton state. Server pages use `loading.tsx` instead. */
  loading?: boolean
  loadingRows?: number
  emptyMessage?: string
  /** Rendered inside the empty state — a filter reset, usually. */
  emptyAction?: ReactNode
  /** Exact total behind the rows, when the query was paginated. */
  total?: number
  /** Highlights rows that need attention. */
  rowTone?: (row: Row) => 'default' | 'critical' | 'warning'
  caption?: string
}

const TONE_CLASS = {
  default: '',
  critical: 'bg-critical-soft/50',
  warning: 'bg-warning-soft/50',
} as const

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  error = null,
  errorHint,
  errorAction,
  loading = false,
  loadingRows = 6,
  emptyMessage = messages.table.empty,
  emptyAction,
  total,
  rowTone,
  caption,
}: DataTableProps<Row>) {
  // `secondary` columns are hidden by CSS rather than dropped, so the full
  // count is the right colSpan in every viewport: a browser clamps a colSpan
  // that overshoots, and dropping them here would change the header too.
  const colCount = columns.length

  return (
    <div className="bo-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-hairline bg-surface2/60">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  title={column.title}
                  className={[
                    'bo-kicker px-3 py-2 font-semibold whitespace-nowrap',
                    column.align === 'right' ? 'text-right' : 'text-left',
                    column.width ?? '',
                    column.secondary ? 'hidden md:table-cell' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {error !== null ? (
              <ErrorState
                colSpan={colCount}
                message={error}
                hint={errorHint}
                action={errorAction}
              />
            ) : loading ? (
              <LoadingState columns={columns} rowCount={loadingRows} />
            ) : rows.length === 0 ? (
              <EmptyState colSpan={colCount} message={emptyMessage} action={emptyAction} />
            ) : (
              rows.map((row, index) => (
                <tr
                  key={rowKey(row, index)}
                  className={[
                    'border-b border-hairline/70 last:border-b-0 hover:bg-surface2/50',
                    TONE_CLASS[rowTone?.(row) ?? 'default'],
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {columns.map((column) => {
                    const content = column.cell(row, index)
                    return (
                      <td
                        key={column.key}
                        className={[
                          'px-3 py-2 align-middle',
                          column.align === 'right' ? 'text-right' : 'text-left',
                          column.secondary ? 'hidden md:table-cell' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {content === null || content === undefined || content === '' ? (
                          <span className="text-faint">—</span>
                        ) : (
                          content
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error === null && !loading && rows.length > 0 ? (
        <div className="border-t border-hairline px-3 py-1.5 text-[11px] text-faint">
          {messages.table.rowCount(rows.length, total ?? rows.length)}
        </div>
      ) : null}
    </div>
  )
}

function ErrorState({
  colSpan,
  message,
  hint,
  action,
}: {
  colSpan: number
  message: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10">
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-1 text-center">
          <span
            aria-hidden="true"
            className="mb-1 flex size-7 items-center justify-center rounded-full bg-critical-soft text-critical-text"
          >
            !
          </span>
          <p className="font-semibold text-critical-text">{messages.table.errorTitle}</p>
          <p className="text-muted">{message}</p>
          {hint ? <p className="text-[12px] text-faint">{hint}</p> : null}
          {action ? <div className="mt-2">{action}</div> : null}
        </div>
      </td>
    </tr>
  )
}

function EmptyState({
  colSpan,
  message,
  action,
}: {
  colSpan: number
  message: string
  action?: ReactNode
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10">
        <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
          <p className="text-muted">{message}</p>
          {action ? <div>{action}</div> : null}
        </div>
      </td>
    </tr>
  )
}

function LoadingState<Row>({
  columns,
  rowCount,
}: {
  columns: readonly Column<Row>[]
  rowCount: number
}) {
  return (
    <>
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <tr key={`skeleton-${rowIndex}`} className="border-b border-hairline/70 last:border-b-0">
          {columns.map((column, columnIndex) => (
            <td key={column.key} className="px-3 py-2">
              <span
                className="bo-skeleton block h-3"
                style={{ width: columnIndex === 0 ? '60%' : '40%' }}
              >
                <span className="sr-only">{messages.table.loading}</span>
              </span>
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** Monospaced cell for ids, codes and error tokens. */
export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px] text-muted">{children}</span>
}

/** Numeric cell: right-aligned figures line up when they are tabular. */
export function Num({ children }: { children: ReactNode }) {
  return <span className="tabular-nums">{children}</span>
}
