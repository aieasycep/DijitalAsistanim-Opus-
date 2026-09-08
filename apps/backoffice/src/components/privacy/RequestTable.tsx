import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, DataTable, Mono, exportTone, type Column } from '@/components/ui'
import type { BoPrivacyRequestRow } from '@/lib/db'
import type { RerunOrder } from '@/lib/queries/privacy'
import { formatBytes, formatDateTime, formatRelative, shortId } from '@/lib/format'
import { enumLabels, labelFor } from '@/lib/messages'
import { isRerunnableStatus, userDetailHref, type RerunOutcome } from './contract'
import {
  deadlineBucketOf,
  deadlineTone,
  formatRemaining,
  isOpenRequest,
  isStuckRequest,
  requestRowTone,
} from './deadline'
import { privacyMessages } from './messages'
import { RerunForm } from './RerunForm'

/**
 * The table both the deadline board and the full queue render.
 *
 * Every column is an identifier, a state, a size or a time. There is no column
 * that could hold what is inside the archive, and no query behind this table
 * that could produce one: `bo_privacy_requests` does not reference
 * `storage_path`, so "what is in this export" is a question the whole
 * application cannot answer — only "was it built, how big, and how late is it".
 *
 * Rows are toned by urgency rather than sorted into separate tables, because an
 * operator working a deadline reads one list in one order: oldest first, which
 * is also closest-to-breach first.
 */

export interface RequestTableProps {
  rows: readonly BoPrivacyRequestRow[]
  /** The standing re-run order per request id, read back from `bo_audit`. */
  orders: ReadonlyMap<string, RerunOrder>
  error: string | null
  total?: number
  emptyMessage?: string
  emptyAction?: ReactNode
  /** `queue` adds the archive columns; `board` stays narrow for the dashboard. */
  variant?: 'board' | 'queue'
  /** The Server Action, threaded through as a prop. */
  rerunAction: (formData: FormData) => void | Promise<void>
  returnTo: string
  resultRequestId?: string | null
  resultOutcome?: RerunOutcome | null
}

export function RequestTable({
  rows,
  orders,
  error,
  total,
  emptyMessage = privacyMessages.deadline.empty,
  emptyAction,
  variant = 'board',
  rerunAction,
  returnTo,
  resultRequestId = null,
  resultOutcome = null,
}: RequestTableProps) {
  const columns: Column<BoPrivacyRequestRow>[] = [
    {
      key: 'request',
      header: privacyMessages.deadline.columnRequest,
      cell: (row) => <Mono>{shortId(row.request_id)}</Mono>,
    },
    {
      key: 'user',
      header: privacyMessages.deadline.columnUser,
      cell: (row) => (
        <div className="flex flex-col leading-tight">
          <Link
            href={userDetailHref(row.user_id)}
            title={privacyMessages.deadline.openUser}
            className="font-mono text-[12px] text-primary-on-soft underline underline-offset-2 hover:text-primary"
          >
            {shortId(row.user_id)}
          </Link>
          {row.email_redacted === null ? null : (
            <span className="font-mono text-[11px] text-faint">{row.email_redacted}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: privacyMessages.deadline.columnStatus,
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={exportTone(row.status)} dot>
            {labelFor(enumLabels.exportStatus, row.status)}
          </Badge>
          {isStuckRequest(row) ? (
            <Badge tone="critical">{privacyMessages.deadline.stuckBadge}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'age',
      header: privacyMessages.deadline.columnAge,
      cell: (row) => (
        <span title={formatDateTime(row.requested_at)}>{formatRelative(row.requested_at)}</span>
      ),
    },
    {
      key: 'remaining',
      header: privacyMessages.deadline.columnRemaining,
      // The statutory clock stops when the request is answered, so a closed row
      // shows no countdown at all rather than a number that is no longer owed.
      cell: (row) =>
        isOpenRequest(row) ? (
          <Badge tone={deadlineTone(deadlineBucketOf(row.requested_at))}>
            {formatRemaining(row.requested_at)}
          </Badge>
        ) : (
          <span className="text-[11px] text-faint" title={privacyMessages.deadline.closedHint}>
            {privacyMessages.deadline.closed}
          </span>
        ),
    },
  ]

  if (variant === 'queue') {
    columns.push(
      {
        key: 'size',
        header: privacyMessages.queue.columnSize,
        align: 'right',
        secondary: true,
        cell: (row) =>
          row.has_artifact ? (
            <span className="tabular-nums">{formatBytes(row.size_bytes)}</span>
          ) : (
            <span className="text-faint">{privacyMessages.queue.artifactNo}</span>
          ),
      },
      {
        key: 'failure',
        header: privacyMessages.queue.columnFailure,
        secondary: true,
        cell: (row) => (row.failure_code === null ? null : <Mono>{row.failure_code}</Mono>),
      },
      {
        key: 'ready',
        header: privacyMessages.queue.columnReady,
        secondary: true,
        cell: (row) =>
          row.ready_at === null ? null : (
            <span title={formatDateTime(row.ready_at)}>{formatRelative(row.ready_at)}</span>
          ),
      },
      {
        key: 'expires',
        header: privacyMessages.queue.columnExpires,
        secondary: true,
        cell: (row) =>
          row.expires_at === null ? null : (
            <span
              title={formatDateTime(row.expires_at)}
              className={row.is_expired ? 'text-warning-text' : undefined}
            >
              {formatRelative(row.expires_at)}
            </span>
          ),
      },
    )
  } else {
    columns.push({
      key: 'updated',
      header: privacyMessages.deadline.columnUpdated,
      secondary: true,
      cell: (row) => (
        <span title={formatDateTime(row.updated_at)}>{formatRelative(row.updated_at)}</span>
      ),
    })
  }

  columns.push(
    {
      key: 'order',
      header: privacyMessages.deadline.columnOrder,
      cell: (row) => {
        const order = orders.get(row.request_id)
        if (order === undefined) return <span className="text-faint">—</span>
        return (
          <div className="flex flex-col leading-tight">
            <span title={formatDateTime(order.orderedAt)} className="text-[12px] text-ink">
              {formatRelative(order.orderedAt)}
            </span>
            <span className="font-mono text-[11px] text-faint" title={order.reason ?? undefined}>
              {shortId(order.staffUserId)}
            </span>
          </div>
        )
      },
    },
    {
      key: 'action',
      header: privacyMessages.deadline.columnAction,
      width: 'w-44',
      cell: (row) =>
        isRerunnableStatus(row.status) ? (
          <RerunForm
            action={rerunAction}
            requestId={row.request_id}
            statusLabel={labelFor(enumLabels.exportStatus, row.status)}
            returnTo={returnTo}
            outcome={resultRequestId === row.request_id ? resultOutcome : null}
          />
        ) : (
          <span className="text-[11px] text-faint" title={privacyMessages.rerun.ineligibleHint}>
            {privacyMessages.rerun.ineligible}
          </span>
        ),
    },
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.request_id}
      error={error}
      total={total}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      rowTone={(row) => requestRowTone(row)}
      caption={privacyMessages.deadline.section}
    />
  )
}
