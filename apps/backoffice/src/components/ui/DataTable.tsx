import {
  createTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { messages } from '@/lib/messages'
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu.tsx'
import { EmptyState, ErrorState } from './states.tsx'
import {
  ALL_COLUMNS_VISIBLE,
  TABLE_PARAMS,
  encodeHiddenColumns,
  encodeSort,
  nextSort,
  pageWindow,
  withParams,
  type TableLocation,
  type TableSort,
} from './table-url.ts'
import { cn } from './utils.ts'

/**
 * The table every list in this console renders.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A SERVER COMPONENT WITH TANSTACK INSIDE IT
 * ---------------------------------------------------------------------------
 *
 * TanStack Table is normally reached through `useReactTable`, which makes the
 * table a Client Component. That does not work here, and not for a stylistic
 * reason: a column is declared as `cell: (row) => <Link href={…}>…</Link>`, and
 * a function prop cannot cross the server/client boundary. A client table would
 * force every column to become a serialisable descriptor and every page to give
 * up JSX in its cells.
 *
 * So the table model is built with `createTable()` — the same core the React
 * adapter wraps, minus the hook — during the server render. TanStack resolves
 * column visibility, header groups and cell contexts; `flexRender` renders
 * them. `manualPagination`, `manualSorting` and `manualFiltering` are all on,
 * because those three questions are answered by Postgres, not by JavaScript:
 * the browser is never handed a whole table to slice.
 *
 * The only client code in here is the column-visibility menu, which needs a
 * popup. Sorting and paging are ordinary links, so they work with JavaScript
 * disabled, they can be opened in a new tab, and a screen reader announces them
 * as what they are.
 *
 * ---------------------------------------------------------------------------
 * STATE LIVES IN THE URL
 * ---------------------------------------------------------------------------
 *
 * Page, sort and hidden columns are query parameters. A view an operator
 * reached by clicking is the same URL as one they were sent, which is what
 * makes "look at row 40 of this filtered list" a link rather than a paragraph
 * of instructions. `location` carries the page's path and its current query so
 * a table link never drops a filter it does not know about.
 *
 * ---------------------------------------------------------------------------
 * FOUR STATES, ALWAYS
 * ---------------------------------------------------------------------------
 *
 * Loading, error, empty, populated. A page cannot render three of them: a
 * failed query that falls through to the empty state tells an operator that
 * nothing is wrong, which is the most expensive lie an operations tool can
 * tell. `error` takes precedence over everything.
 */

// ===========================================================================
// Column
// ===========================================================================

export interface Column<Row> {
  /** Stable identity. The React key, the visibility token, the header id. */
  key: string
  header: ReactNode
  /** Renders the cell. `null`, `undefined` and `''` render an em dash. */
  cell: (row: Row, index: number) => ReactNode
  align?: 'left' | 'right'
  /** Tailwind width utility, e.g. `w-40`. */
  width?: string
  /** Hidden below `md`: context rather than content. */
  secondary?: boolean
  /** Header tooltip, for a column whose name has to be short. */
  title?: string
  /**
   * The database column to order by. Present means sortable: the header
   * becomes a link that rewrites `?sort=`. Absent means the column is not
   * sortable, and no control is rendered — a sort arrow that does nothing is
   * exactly the dead affordance this console does not ship.
   */
  sortKey?: string
  /**
   * May an operator hide this column? Defaults to true. Set false for the
   * column that identifies the row: a table whose every column can be hidden
   * can be reduced to nothing.
   */
  hideable?: boolean
  /** Start hidden, and appear in the column menu unchecked. */
  defaultHidden?: boolean
}

// ===========================================================================
// Feature configuration
// ===========================================================================

export interface DataTableSorting {
  /** The sort currently applied, already parsed by the page. */
  current: TableSort | null
  /** Query parameter to write. Defaults to `sort`. */
  param?: string
}

export interface DataTablePagination {
  /** 1-based. */
  page: number
  pageSize: number
  /** Exact count from Postgres — never `rows.length`. */
  total: number
  pageParam?: string
  /** Present means the page-size picker renders. */
  pageSizeParam?: string
  pageSizeOptions?: readonly number[]
}

export interface DataTableColumnVisibility {
  /**
   * Column keys the operator has hidden, from the query string — or `null`
   * when the parameter is absent, meaning they have not chosen and each
   * column's own `defaultHidden` applies. Use `parseColumnVisibility()`, which
   * returns exactly that.
   */
  hidden: readonly string[] | null
  param?: string
}

export interface DataTableProps<Row> {
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row, index: number) => string

  /**
   * The table's accessible name, rendered as a visually hidden `<caption>`.
   * Always give one: it is how a screen-reader user knows which of the four
   * tables on a page they have landed in.
   */
  caption?: string

  /** Error message from `messages.errors`, never a raw exception string. */
  error?: string | null
  errorHint?: string
  errorAction?: ReactNode

  loading?: boolean
  loadingRows?: number

  emptyMessage?: string
  emptyHint?: string
  emptyAction?: ReactNode
  /** True when filters are applied: changes the empty wording and the advice. */
  filtered?: boolean

  /**
   * Where this table lives. Required for sorting, paging and column
   * visibility — those render links, and a link needs a path.
   */
  location?: TableLocation
  sorting?: DataTableSorting
  pagination?: DataTablePagination
  columnVisibility?: DataTableColumnVisibility

  /** Exact total behind the rows when there is no pagination block. */
  total?: number
  /** Highlights rows that need attention. */
  rowTone?: (row: Row) => 'default' | 'critical' | 'warning'
  /** Rendered above the table, left of the column menu. */
  toolbar?: ReactNode
  /**
   * Caps the body height and pins the header while it scrolls. Give a CSS
   * length; omit for a table that scrolls with the page.
   */
  maxBodyHeight?: string
  className?: string
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
  caption,
  error = null,
  errorHint,
  errorAction,
  loading = false,
  loadingRows = 6,
  emptyMessage,
  emptyHint,
  emptyAction,
  filtered = false,
  location,
  sorting,
  pagination,
  columnVisibility,
  total,
  rowTone,
  toolbar,
  maxBodyHeight,
  className,
}: DataTableProps<Row>) {
  const byKey = new Map(columns.map((column) => [column.key, column]))

  // Visibility resolves in one place: an explicit choice in the URL wins, and
  // in its absence each column's own `defaultHidden` applies. TanStack then
  // owns the resolution, so the header row and the body can never disagree
  // about which columns exist.
  const hidden = effectiveHidden(columns, columnVisibility)
  const visibilityState: VisibilityState = {}
  for (const column of columns) {
    if (hidden.has(column.key)) visibilityState[column.key] = false
  }

  const columnDefs: ColumnDef<Row>[] = columns.map((column) => ({
    id: column.key,
    header: () => column.header,
    // The em-dash substitution happens *inside* the column definition, not at
    // the `<td>`. `flexRender` turns a function definition into an element, so
    // a `null` returned by a cell is invisible by the time the row renders and
    // a check out there would never fire — leaving a blank box where a page
    // meant to say "no value". Dozens of columns return `null` deliberately.
    cell: (context) => {
      const content = column.cell(context.row.original, context.row.index)
      return content === null || content === undefined || content === '' ? (
        <span className="text-faint">—</span>
      ) : (
        content
      )
    },
    enableHiding: column.hideable !== false,
  }))

  const table = createTable<Row>({
    data: rows as Row[],
    columns: columnDefs,
    // Replaced immediately below. `createTable` returns `options.state` from
    // `getState()` *verbatim* — it does not merge it with the initial state
    // the features built — so handing it a partial object here would leave
    // `columnPinning`, `rowSelection` and the rest undefined and crash the
    // first `getHeaderGroups()` call. The React adapter solves this the same
    // way, by merging against `table.initialState` after construction.
    state: {},
    // Fully controlled and rendered once: there is no client instance to push
    // state into, so the setter is a no-op by construction rather than by
    // omission. Every state change is a navigation.
    onStateChange: () => undefined,
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  })

  table.setOptions((previous) => ({
    ...previous,
    state: { ...table.initialState, columnVisibility: visibilityState },
  }))

  const headerGroups = table.getHeaderGroups()
  const bodyRows = table.getRowModel().rows
  const visibleCount = table.getVisibleLeafColumns().length
  const columnMenu = renderColumnMenu(columns, columnVisibility, location, hidden)

  const pageInfo =
    pagination === undefined
      ? null
      : pageWindow(pagination.page, pagination.pageSize, pagination.total)

  return (
    <div className={cn('bo-panel overflow-hidden', className)}>
      {toolbar !== undefined || columnMenu !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-3 py-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbar}</div>
          {columnMenu}
        </div>
      ) : null}

      {loading ? (
        <span role="status" className="sr-only">
          {messages.states.loading}
        </span>
      ) : null}

      <div
        className={cn('bo-scroll', maxBodyHeight === undefined ? 'overflow-x-auto' : '')}
        style={maxBodyHeight === undefined ? undefined : { maxHeight: maxBodyHeight }}
      >
        <table className="w-full border-collapse text-left">
          {caption ? <caption className="sr-only">{caption}</caption> : null}

          <thead
            className={cn(
              maxBodyHeight === undefined ? '' : 'sticky top-0 z-10',
              'bg-surface2/80 backdrop-blur-[2px]',
            )}
          >
            {headerGroups.map((group) => (
              <tr key={group.id} className="border-b border-hairline">
                {group.headers.map((header) => {
                  const column = byKey.get(header.column.id)
                  const content = flexRender(header.column.columnDef.header, header.getContext())
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      title={column?.title}
                      aria-sort={ariaSortFor(column, sorting)}
                      className={cn(
                        'bo-kicker px-3 py-2 font-semibold whitespace-nowrap',
                        column?.align === 'right' ? 'text-right' : 'text-left',
                        column?.width,
                        column?.secondary === true ? 'hidden md:table-cell' : '',
                      )}
                    >
                      {renderHeader(content, column, sorting, location)}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {error !== null ? (
              <tr>
                <td colSpan={visibleCount} className="p-0">
                  <ErrorState message={error} hint={errorHint} action={errorAction} />
                </td>
              </tr>
            ) : loading ? (
              <LoadingRows columnCount={visibleCount} rowCount={loadingRows} />
            ) : bodyRows.length === 0 ? (
              <tr>
                <td colSpan={visibleCount} className="p-0">
                  <EmptyState
                    message={emptyMessage}
                    hint={emptyHint}
                    action={emptyAction}
                    filtered={filtered}
                  />
                </td>
              </tr>
            ) : (
              bodyRows.map((row) => (
                <tr
                  key={rowKey(row.original, row.index)}
                  className={cn(
                    'border-b border-hairline/70 last:border-b-0 hover:bg-surface2/50',
                    TONE_CLASS[rowTone?.(row.original) ?? 'default'],
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const column = byKey.get(cell.column.id)
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-3 py-2 align-middle',
                          column?.align === 'right' ? 'text-right' : 'text-left',
                          column?.secondary === true ? 'hidden md:table-cell' : '',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error === null && !loading ? (
        <TableFooter
          pageInfo={pageInfo}
          pagination={pagination}
          location={location}
          shown={bodyRows.length}
          total={total}
        />
      ) : null}
    </div>
  )
}

// ===========================================================================
// Header
// ===========================================================================

function ariaSortFor<Row>(
  column: Column<Row> | undefined,
  sorting: DataTableSorting | undefined,
): 'ascending' | 'descending' | 'none' | undefined {
  if (column?.sortKey === undefined || sorting === undefined) return undefined
  if (sorting.current?.key !== column.sortKey) return 'none'
  return sorting.current.direction === 'asc' ? 'ascending' : 'descending'
}

function renderHeader<Row>(
  content: ReactNode,
  column: Column<Row> | undefined,
  sorting: DataTableSorting | undefined,
  location: TableLocation | undefined,
): ReactNode {
  if (column?.sortKey === undefined || sorting === undefined || location === undefined) {
    return content
  }

  const param = sorting.param ?? TABLE_PARAMS.sort
  const active = sorting.current?.key === column.sortKey ? sorting.current : null
  const target = nextSort(sorting.current, column.sortKey)
  // Changing the order changes which rows are on page one, so the cursor goes.
  const href = withParams(location, {
    [param]: target === null ? null : encodeSort(target),
    [TABLE_PARAMS.page]: null,
  })

  const Icon = active === null ? ChevronsUpDown : active.direction === 'asc' ? ArrowUp : ArrowDown
  const actionLabel =
    target === null
      ? messages.table.sortNone
      : target.direction === 'asc'
        ? messages.table.sortAscending
        : messages.table.sortDescending

  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        'group inline-flex items-center gap-1 rounded transition-colors hover:text-ink',
        active === null ? '' : 'text-ink',
      )}
    >
      {content}
      <Icon
        aria-hidden="true"
        className={cn('size-3', active === null ? 'opacity-40 group-hover:opacity-80' : '')}
      />
      <span className="sr-only">{actionLabel}</span>
    </Link>
  )
}

/**
 * Which columns are hidden right now: the URL when the operator has chosen,
 * each column's `defaultHidden` when they have not. A column marked
 * `hideable: false` is never hidden, whatever the parameter says — otherwise a
 * hand-edited URL could reduce a table to no columns at all.
 */
function effectiveHidden<Row>(
  columns: readonly Column<Row>[],
  visibility: DataTableColumnVisibility | undefined,
): ReadonlySet<string> {
  const chosen = visibility?.hidden ?? null
  const hideable = new Set(
    columns.filter((column) => column.hideable !== false).map((column) => column.key),
  )
  const source =
    chosen === null
      ? columns.filter((column) => column.defaultHidden === true).map((column) => column.key)
      : chosen
  return new Set(source.filter((key) => hideable.has(key)))
}

function renderColumnMenu<Row>(
  columns: readonly Column<Row>[],
  visibility: DataTableColumnVisibility | undefined,
  location: TableLocation | undefined,
  hidden: ReadonlySet<string>,
): ReactNode {
  if (visibility === undefined || location === undefined) return null

  const param = visibility.param ?? TABLE_PARAMS.columns
  const hideable = columns.filter((column) => column.hideable !== false)
  if (hideable.length === 0) return null

  const options = hideable.map((column) => {
    const next = new Set(hidden)
    if (next.has(column.key)) next.delete(column.key)
    else next.add(column.key)
    return {
      key: column.key,
      // The menu is a Client Component, so the label crosses the boundary as a
      // rendered node — which React serialises — and the href as a string.
      label: column.header,
      visible: !hidden.has(column.key),
      href: withParams(location, {
        [param]: encodeHiddenColumns([...next]) ?? ALL_COLUMNS_VISIBLE,
      }),
    }
  })

  return (
    <ColumnVisibilityMenu
      options={options}
      resetHref={withParams(location, { [param]: null })}
      canReset={visibility.hidden !== null}
    />
  )
}

// ===========================================================================
// Body states and footer
// ===========================================================================

function LoadingRows({ columnCount, rowCount }: { columnCount: number; rowCount: number }) {
  return (
    <>
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <tr key={`skeleton-${rowIndex}`} className="border-b border-hairline/70 last:border-b-0">
          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <td key={columnIndex} className="px-3 py-2">
              <span
                aria-hidden="true"
                className="bo-skeleton block h-3"
                style={{ width: columnIndex === 0 ? '60%' : '40%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function TableFooter({
  pageInfo,
  pagination,
  location,
  shown,
  total,
}: {
  pageInfo: ReturnType<typeof pageWindow> | null
  pagination: DataTablePagination | undefined
  location: TableLocation | undefined
  shown: number
  total: number | undefined
}) {
  if (pageInfo === null || pagination === undefined || location === undefined) {
    if (shown === 0) return null
    return (
      <div className="border-t border-hairline px-3 py-1.5 text-[11px] text-faint">
        {messages.table.rowCount(shown, total ?? shown)}
      </div>
    )
  }

  const pageParam = pagination.pageParam ?? TABLE_PARAMS.page
  const previousHref = withParams(location, {
    [pageParam]: pageInfo.page - 1 <= 1 ? null : String(pageInfo.page - 1),
  })
  const nextHref = withParams(location, { [pageParam]: String(pageInfo.page + 1) })

  return (
    <nav
      aria-label={messages.table.pagination}
      className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-3 py-1.5"
    >
      <p className="text-[11px] text-faint">
        {pageInfo.total === 0
          ? messages.states.empty
          : messages.table.range(pageInfo.firstRow, pageInfo.lastRow, pageInfo.total)}
      </p>

      <div className="flex items-center gap-2">
        {pagination.pageSizeParam !== undefined && pagination.pageSizeOptions !== undefined ? (
          <PageSizeLinks
            location={location}
            param={pagination.pageSizeParam}
            pageParam={pageParam}
            options={pagination.pageSizeOptions}
            current={pageInfo.pageSize}
          />
        ) : null}

        <span aria-live="polite" className="text-[11px] text-faint">
          {messages.table.page(pageInfo.page, pageInfo.lastPage)}
        </span>

        <PageLink href={previousHref} enabled={pageInfo.hasPrevious}>
          {messages.table.previous}
        </PageLink>
        <PageLink href={nextHref} enabled={pageInfo.hasNext}>
          {messages.table.next}
        </PageLink>
      </div>
    </nav>
  )
}

function PageLink({
  href,
  enabled,
  children,
}: {
  href: string
  enabled: boolean
  children: ReactNode
}) {
  const className =
    'inline-flex h-6 items-center rounded border border-hairline px-2 text-[11px] font-medium'

  // A disabled page control is a `<span>`, not a dead `<a>`: an anchor that
  // goes nowhere is still in the tab order and still announces as a link.
  if (!enabled) {
    return (
      <span aria-disabled="true" className={cn(className, 'text-disabled')}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} scroll={false} className={cn(className, 'text-muted hover:text-ink')}>
      {children}
    </Link>
  )
}

function PageSizeLinks({
  location,
  param,
  pageParam,
  options,
  current,
}: {
  location: TableLocation
  param: string
  pageParam: string
  options: readonly number[]
  current: number
}) {
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{messages.table.pageSize}</legend>
      {options.map((size) => {
        const active = size === current
        const href = withParams(location, {
          [param]: String(size),
          // A different page size means a different page one.
          [pageParam]: null,
        })
        return active ? (
          <span
            key={size}
            aria-current="true"
            className="inline-flex h-6 items-center rounded bg-surface2 px-1.5 text-[11px] font-semibold text-ink"
          >
            {size}
          </span>
        ) : (
          <Link
            key={size}
            href={href}
            scroll={false}
            className="inline-flex h-6 items-center rounded px-1.5 text-[11px] text-faint hover:text-ink"
          >
            <span aria-hidden="true">{size}</span>
            <span className="sr-only">{messages.table.perPage(size)}</span>
          </Link>
        )
      })}
    </fieldset>
  )
}

// ===========================================================================
// Cell helpers
// ===========================================================================

/** Monospaced cell for ids, codes and error tokens. */
export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px] text-muted">{children}</span>
}

/** Numeric cell: right-aligned figures line up when they are tabular. */
export function Num({ children }: { children: ReactNode }) {
  return <span className="tabular-nums">{children}</span>
}
