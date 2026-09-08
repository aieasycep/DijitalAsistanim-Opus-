import Link from 'next/link'
import type { ReactNode } from 'react'
import { DataTable, Mono, Num, type Column, type TableLocation } from '@/components/ui'
import type { BoFeatureFlagRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { flagMessages } from '@/lib/messages/flags'
import type { Clock } from '@da/domain'
import type { FlagAdmin } from '@/lib/queries/flags'
import { FLAGS_PAGE_SIZE, flagPath, type FlagSort } from './contract'
import { StateBadge } from './StateBadge'
import { adminLabel, describeAudience } from './presentation'

/**
 * Every flag, with its real state on the row.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STATE IS THREE COLUMNS AND NOT A DOT
 * ---------------------------------------------------------------------------
 *
 * A flag enabled at 25% for iOS on Pro is not "on". The row therefore carries
 * the state pill (from the view's own `effective_state`, computed the way the
 * evaluator computes it), the percentage as a number, and the platform / plan /
 * version conditions written out — so an operator reading the list already
 * knows who is affected without opening anything.
 *
 * The override column is the other half of the same honesty: a flag can read
 * "Kapalı" and still be on for four people, and that is exactly the situation
 * an incident review needs to see from the list.
 *
 * Paging and sorting are server-side — `queryViewPage` returns the exact total
 * beside a bounded page and the sort is an `order by` in Postgres — so the
 * browser is never handed the flag table to slice.
 */
export function FlagTable({
  rows,
  total,
  page,
  sort,
  admins,
  location,
  hiddenColumns,
  clock,
  error,
  emptyMessage,
  emptyAction,
  filtered,
}: {
  rows: readonly BoFeatureFlagRow[]
  /** Exact count from Postgres, never `rows.length`. */
  total: number
  page: number
  sort: FlagSort
  /** `updated_by` resolved to a staff member, keyed by admin id. */
  admins: ReadonlyMap<string, FlagAdmin>
  location: TableLocation
  /** From `parseColumnVisibility()`: null means the operator has not chosen. */
  hiddenColumns: readonly string[] | null
  clock: Clock
  error: string | null
  emptyMessage: string
  emptyAction?: ReactNode
  filtered: boolean
}) {
  const columns: readonly Column<BoFeatureFlagRow>[] = [
    {
      key: 'key',
      header: flagMessages.columns.key,
      sortKey: 'key',
      hideable: false,
      cell: (row) => (
        <Link href={flagPath(row.flag_id)} className="flex flex-col gap-0.5 hover:underline">
          <Mono>{row.key}</Mono>
          <span className="line-clamp-1 max-w-md text-[11px] text-faint">{row.description}</span>
        </Link>
      ),
    },
    {
      key: 'state',
      header: flagMessages.columns.state,
      width: 'w-32',
      hideable: false,
      cell: (row) => <StateBadge state={row.effective_state} />,
    },
    {
      key: 'rollout',
      header: flagMessages.columns.rollout,
      sortKey: 'rollout_percentage',
      align: 'right',
      width: 'w-24',
      cell: (row) => (
        <Num>
          <span className={row.rollout_percentage > 0 ? 'text-ink' : 'text-faint'}>
            %{row.rollout_percentage}
          </span>
        </Num>
      ),
    },
    {
      key: 'targeting',
      header: flagMessages.columns.targeting,
      cell: (row) => (
        <ul className="flex flex-wrap items-center gap-1">
          {/* The percentage already has its own column; the remaining three
              conditions are platform, plan and version, in evaluation order. */}
          {describeAudience(row)
            .slice(1)
            .map((part) => (
              <li
                key={part}
                className="rounded bg-surface2 px-1.5 py-0.5 text-[11px] text-muted whitespace-nowrap"
              >
                {part}
              </li>
            ))}
        </ul>
      ),
    },
    {
      key: 'overrides',
      header: flagMessages.columns.overrides,
      title: flagMessages.columns.overridesTitle,
      sortKey: 'override_count',
      align: 'right',
      width: 'w-28',
      cell: (row) =>
        row.override_count === 0 ? null : (
          <span className="flex flex-col items-end">
            <Num>
              <span className="font-semibold text-ink">{row.override_count}</span>
            </Num>
            <span className="text-[11px] text-faint">
              {row.override_on_count} / {row.override_off_count}
            </span>
          </span>
        ),
    },
    {
      key: 'updated',
      header: flagMessages.columns.updated,
      sortKey: 'updated_at',
      width: 'w-44',
      secondary: true,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="text-[12px] whitespace-nowrap text-ink">
            {formatRelative(row.updated_at, clock)}
          </span>
          <span className="text-[11px] text-faint">
            {adminLabel(
              row.updated_by_admin_user_id === null
                ? undefined
                : admins.get(row.updated_by_admin_user_id),
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'created',
      header: flagMessages.detail.factCreated,
      width: 'w-32',
      secondary: true,
      defaultHidden: true,
      cell: (row) => (
        <span className="text-[12px] whitespace-nowrap">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: 'detail',
      header: flagMessages.columns.detail,
      align: 'right',
      width: 'w-20',
      hideable: false,
      cell: (row) => (
        <Link
          href={flagPath(row.flag_id)}
          className="text-[12px] font-medium text-primary-on-soft hover:underline"
        >
          {flagMessages.list.detailLink}
        </Link>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.flag_id}
      caption={flagMessages.list.tableCaption}
      error={error}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      filtered={filtered}
      location={location}
      sorting={{ current: sort }}
      columnVisibility={{ hidden: hiddenColumns }}
      pagination={{ page, pageSize: FLAGS_PAGE_SIZE, total }}
      // A pulled kill switch is not an ordinary row: something is off for
      // everybody, and the list should say so before anyone opens anything.
      rowTone={(row) => (row.kill_switch ? 'critical' : 'default')}
    />
  )
}
