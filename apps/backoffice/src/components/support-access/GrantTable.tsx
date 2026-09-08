import type { Clock } from '@da/domain'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { DataTable, Mono, Num, type Column, type TableLocation } from '@/components/ui'
import type { BoSupportAccessGrantRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { ROLE_LABELS_TR } from '@/lib/permissions'
import { shortId } from '@/lib/redact'
import { GRANTS_PAGE_SIZE, grantHref, userHref } from './contract'
import { GrantStatusBadge } from './GrantStatusBadge'
import { ScopeChips } from './ScopeList'

/**
 * Every Support Access request, in one table.
 *
 * Nine columns, and not one of them is content. The subject arrives from the
 * view as `y•••@example.com` because `bo_support_access_grants` passes
 * `profiles.email` through `bo_redact_email()`; the reason is the requester's
 * own sentence, which is the thing this record exists to preserve.
 *
 * Paging is server side — `queryViewPage` returns the exact total beside a
 * bounded page — so the browser is never handed the grant history to slice.
 */
export function GrantTable({
  rows,
  total,
  page,
  location,
  hiddenColumns,
  clock,
  viewerAdminUserId,
  error,
  emptyMessage,
  emptyAction,
  filtered,
}: {
  rows: readonly BoSupportAccessGrantRow[]
  /** Exact count from Postgres, never `rows.length`. */
  total: number
  page: number
  location: TableLocation
  /** From `parseColumnVisibility()`: null means the operator has not chosen. */
  hiddenColumns: readonly string[] | null
  clock: Clock
  /** Marks the signed-in operator's own requests. */
  viewerAdminUserId: string
  error: string | null
  emptyMessage: string
  emptyAction?: ReactNode
  filtered: boolean
}) {
  // One instant for the whole render, so two rows cannot disagree about whether
  // a grant lapsed between them.
  const now = clock.now()

  const columns: readonly Column<BoSupportAccessGrantRow>[] = [
    {
      key: 'requested_at',
      header: supportAccessMessages.columns.requestedAt,
      width: 'w-36',
      hideable: false,
      cell: (row) => (
        <Link href={grantHref(row.grant_id)} className="text-ink hover:underline">
          <span className="block whitespace-nowrap">{formatDateTime(row.requested_at)}</span>
          <span className="block text-[11px] text-faint">
            {formatRelative(row.requested_at, clock)}
          </span>
        </Link>
      ),
    },
    {
      key: 'holder',
      header: supportAccessMessages.columns.holder,
      width: 'w-48',
      cell: (row) => (
        <span className="flex flex-col">
          <span className="text-[12px] text-ink">{row.admin_email_redacted}</span>
          <span className="text-[11px] text-faint">
            {ROLE_LABELS_TR[row.admin_role]}
            {row.admin_user_id === viewerAdminUserId
              ? ` · ${supportAccessMessages.filters.holderMine}`
              : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'subject',
      header: supportAccessMessages.columns.subject,
      width: 'w-48',
      cell: (row) => (
        <Link href={userHref(row.subject_user_id)} className="flex flex-col hover:underline">
          <span className="text-[12px] text-ink">{row.subject_email_redacted}</span>
          <Mono>{shortId(row.subject_user_id)}</Mono>
        </Link>
      ),
    },
    {
      key: 'scopes',
      header: supportAccessMessages.columns.scopes,
      cell: (row) => <ScopeChips scopes={row.scopes} />,
    },
    {
      key: 'reason',
      header: supportAccessMessages.columns.reason,
      secondary: true,
      defaultHidden: true,
      cell: (row) => <span className="line-clamp-2 text-[12px] text-muted">{row.reason}</span>,
    },
    {
      key: 'status',
      header: supportAccessMessages.columns.status,
      width: 'w-40',
      hideable: false,
      cell: (row) => (
        <GrantStatusBadge row={row} now={now} minutesRemaining={row.minutes_remaining} />
      ),
    },
    {
      key: 'expires_at',
      header: supportAccessMessages.columns.expires,
      width: 'w-36',
      secondary: true,
      cell: (row) => (
        <span className="block whitespace-nowrap text-[12px]">
          {formatDateTime(row.expires_at)}
        </span>
      ),
    },
    {
      key: 'reveals',
      header: supportAccessMessages.columns.reveals,
      title: supportAccessMessages.columns.revealsTitle,
      align: 'right',
      width: 'w-24',
      cell: (row) => (
        <Num>
          <span className={row.reveal_count > 0 ? 'font-semibold text-ink' : 'text-faint'}>
            {row.reveal_count}
          </span>
        </Num>
      ),
    },
    {
      key: 'approver',
      header: supportAccessMessages.columns.approver,
      secondary: true,
      defaultHidden: true,
      cell: (row) =>
        row.approved_by_admin_user_id === null ? null : (
          <Mono>{shortId(row.approved_by_admin_user_id)}</Mono>
        ),
    },
    {
      key: 'detail',
      header: supportAccessMessages.columns.detail,
      align: 'right',
      width: 'w-20',
      hideable: false,
      cell: (row) => (
        <Link
          href={grantHref(row.grant_id)}
          className="text-[12px] font-medium text-primary-on-soft hover:underline"
        >
          {supportAccessMessages.list.detailLink}
        </Link>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.grant_id}
      caption={supportAccessMessages.list.tableCaption}
      error={error}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      filtered={filtered}
      location={location}
      columnVisibility={{ hidden: hiddenColumns }}
      pagination={{ page, pageSize: GRANTS_PAGE_SIZE, total }}
      // A live grant is somebody currently able to read another person's
      // mailbox. It is not a healthy row and it is not an ordinary one.
      rowTone={(row) => (row.is_live ? 'warning' : 'default')}
    />
  )
}
