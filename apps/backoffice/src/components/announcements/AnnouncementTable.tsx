import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, DataTable, type Column, type TableLocation, type TableSort } from '@/components/ui'
import { formatDateTime, formatRelative } from '@/lib/format'
import {
  AUDIENCE_LABELS_TR,
  PLATFORM_LABELS_TR,
  announcementMessages,
  localeLabel,
} from '@/lib/messages/announcements'
import { announcementState, type AnnouncementListRow } from '@/lib/queries/announcements'
import { StateBadge } from './StateBadge'
import { ANNOUNCEMENT_PAGE_SIZES, announcementPath } from './contract'

/**
 * The announcement list, as a table.
 *
 * Server-rendered on the shared `DataTable`, so sorting, paging and column
 * visibility are links the server answers rather than work the browser does on
 * rows it should never have been handed. Every sortable header names a real
 * `announcements` column.
 *
 * The state column is the only derived one, and it is derived from the same
 * `announcementState` the filter above the table is built from, against the
 * same instant — so a row selected as "yayında" can never be badged "süresi
 * doldu" two pixels to the right.
 *
 * `body` is not a column and cannot be: `AnnouncementListRow` is a `Pick` over
 * what the query selected, and the body is not among them. A list of twenty-five
 * announcements does not need twenty-five announcement bodies.
 */

export interface AnnouncementTableProps {
  rows: readonly AnnouncementListRow[]
  total: number
  page: number
  pageSize: number
  sort: TableSort | null
  hiddenColumns: readonly string[] | null
  location: TableLocation
  /** From `messages.errors`, never a raw exception string. */
  error: string | null
  filtered: boolean
  emptyAction?: ReactNode
  /** The instant every state on this page is computed against. */
  now: Date
}

export function AnnouncementTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  hiddenColumns,
  location,
  error,
  filtered,
  emptyAction,
  now,
}: AnnouncementTableProps) {
  const columns: readonly Column<AnnouncementListRow>[] = [
    {
      key: 'title',
      header: announcementMessages.columns.title,
      sortKey: 'title',
      hideable: false,
      // A draft's title is muted rather than brand-coloured, so a row that
      // reaches nobody reads as inactive before the badge beside it is read at
      // all. The badge is the statement; this is the glance.
      cell: (row) => (
        <Link
          href={announcementPath(row.id)}
          className={`block max-w-[26rem] truncate text-[13px] font-medium hover:underline ${
            row.published_at === null ? 'text-muted' : 'text-primary-on-soft'
          }`}
          title={row.title}
        >
          {row.title}
        </Link>
      ),
    },
    {
      key: 'state',
      header: announcementMessages.columns.state,
      // Not sortable: the state is a function of two columns and the clock, and
      // a header arrow that ordered by only one of them would be a control that
      // lies about what it did.
      width: 'w-40',
      hideable: false,
      cell: (row) => <StateBadge state={announcementState(row, now)} />,
    },
    {
      key: 'audience',
      header: announcementMessages.columns.audience,
      sortKey: 'audience',
      width: 'w-44',
      cell: (row) => <Badge tone="primary">{AUDIENCE_LABELS_TR[row.audience]}</Badge>,
    },
    {
      key: 'platforms',
      header: announcementMessages.columns.platforms,
      secondary: true,
      width: 'w-36',
      cell: (row) =>
        row.platforms.length === 0 ? (
          <span className="text-[12px] text-muted">{announcementMessages.values.allPlatforms}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.platforms.map((platform) => (
              <Badge key={platform}>{PLATFORM_LABELS_TR[platform]}</Badge>
            ))}
          </span>
        ),
    },
    {
      key: 'locale',
      header: announcementMessages.columns.locale,
      sortKey: 'locale',
      secondary: true,
      width: 'w-28',
      cell: (row) => <span className="text-[12px] text-muted">{localeLabel(row.locale)}</span>,
    },
    {
      key: 'minVersion',
      header: announcementMessages.columns.minVersion,
      secondary: true,
      defaultHidden: true,
      width: 'w-32',
      cell: (row) =>
        row.min_app_version === null ? (
          <span className="text-[12px] text-faint">{announcementMessages.values.noMinVersion}</span>
        ) : (
          <span className="font-mono text-[12px] text-muted">{row.min_app_version}</span>
        ),
    },
    {
      key: 'starts',
      header: announcementMessages.columns.starts,
      sortKey: 'starts_at',
      align: 'right',
      width: 'w-40',
      cell: (row) => (
        <span className="tabular-nums text-[12px] text-muted" title={formatDateTime(row.starts_at)}>
          {formatDateTime(row.starts_at)}
        </span>
      ),
    },
    {
      key: 'ends',
      header: announcementMessages.columns.ends,
      sortKey: 'ends_at',
      secondary: true,
      align: 'right',
      width: 'w-40',
      cell: (row) =>
        row.ends_at === null ? (
          <Badge tone="warning">{announcementMessages.values.noEnd}</Badge>
        ) : (
          <span className="tabular-nums text-[12px] text-muted">{formatDateTime(row.ends_at)}</span>
        ),
    },
    {
      key: 'dismissible',
      header: announcementMessages.columns.dismissible,
      secondary: true,
      defaultHidden: true,
      width: 'w-36',
      cell: (row) =>
        row.dismissible ? (
          <span className="text-[12px] text-muted">
            {announcementMessages.values.dismissibleYes}
          </span>
        ) : (
          <Badge tone="warning">{announcementMessages.values.dismissibleNo}</Badge>
        ),
    },
    {
      key: 'published',
      header: announcementMessages.columns.published,
      sortKey: 'published_at',
      secondary: true,
      align: 'right',
      width: 'w-40',
      cell: (row) =>
        row.published_at === null ? (
          <span className="text-[12px] text-faint">
            {announcementMessages.values.neverPublished}
          </span>
        ) : (
          <span
            className="tabular-nums text-[12px] text-muted"
            title={formatDateTime(row.published_at)}
          >
            {formatRelative(row.published_at)}
          </span>
        ),
    },
    {
      key: 'updated',
      header: announcementMessages.columns.updated,
      sortKey: 'updated_at',
      secondary: true,
      defaultHidden: true,
      align: 'right',
      width: 'w-36',
      cell: (row) => (
        <span
          className="tabular-nums text-[12px] text-muted"
          title={formatDateTime(row.updated_at)}
        >
          {formatRelative(row.updated_at)}
        </span>
      ),
    },
  ]

  return (
    <DataTable<AnnouncementListRow>
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      caption={announcementMessages.list.caption}
      error={error}
      errorHint={announcementMessages.list.errorHint}
      emptyMessage={
        filtered ? announcementMessages.list.emptyFiltered : announcementMessages.list.empty
      }
      {...(filtered ? { emptyHint: announcementMessages.list.emptyHint } : {})}
      {...(emptyAction === undefined ? {} : { emptyAction })}
      filtered={filtered}
      location={location}
      sorting={{ current: sort }}
      pagination={{
        page,
        pageSize,
        total,
        pageSizeParam: 'size',
        pageSizeOptions: ANNOUNCEMENT_PAGE_SIZES,
      }}
      columnVisibility={{ hidden: hiddenColumns }}
      // A published notice with no end date is the one nobody will remember to
      // take down, so it is the one row this table paints.
      rowTone={(row) => (row.published_at !== null && row.ends_at === null ? 'warning' : 'default')}
      {...(sort === null
        ? {
            toolbar: (
              <span className="text-[11px] text-faint">
                {announcementMessages.list.defaultOrder}
              </span>
            ),
          }
        : {})}
    />
  )
}
