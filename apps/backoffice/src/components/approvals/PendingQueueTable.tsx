import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, DataTable, Mono, approvalTone, type Column } from '@/components/ui'
import type { BoApprovalRow } from '@/lib/db'
import { formatDateTime, formatRelative, shortId } from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import { userDetailHref } from './contract'
import { approvalMessages, actionTypeLabels, sourceTypeLabels } from './messages'

/**
 * Proposals the user has not answered yet.
 *
 * Every column here is an identifier, a state or a time. There is no column
 * that could hold what the approval would do, and there is no query behind this
 * table that could produce one: `bo_approvals` does not reference `payload`,
 * `what` or `why`, so "what was this draft going to say" is a question the whole
 * application cannot answer.
 *
 * Overdue rows sort first and are toned, because an overdue proposal is not a
 * slow user — it is a proposal the expiry sweep should already have closed, and
 * a queue full of them is a broken cron.
 */

export interface PendingQueueTableProps {
  rows: readonly BoApprovalRow[]
  total?: number
  error: string | null
  emptyMessage?: string
  emptyAction?: ReactNode
}

export function PendingQueueTable({
  rows,
  total,
  error,
  emptyMessage = approvalMessages.queue.empty,
  emptyAction,
}: PendingQueueTableProps) {
  const columns: readonly Column<BoApprovalRow>[] = [
    {
      key: 'approval',
      header: approvalMessages.queue.columnApproval,
      cell: (row) => <Mono>{shortId(row.approval_id)}</Mono>,
    },
    {
      key: 'user',
      header: approvalMessages.queue.columnUser,
      cell: (row) => (
        <Link
          href={userDetailHref(row.user_id)}
          title={approvalMessages.queue.openUser}
          className="font-mono text-[12px] text-primary-on-soft underline underline-offset-2 hover:text-primary"
        >
          {shortId(row.user_id)}
        </Link>
      ),
    },
    {
      key: 'type',
      header: approvalMessages.queue.columnType,
      cell: (row) => <span className="text-ink">{actionTypeLabels[row.type] ?? row.type}</span>,
    },
    {
      key: 'source',
      header: approvalMessages.queue.columnSource,
      secondary: true,
      cell: (row) =>
        row.source_type === null ? null : (
          <span className="text-muted">{sourceTypeLabels[row.source_type] ?? row.source_type}</span>
        ),
    },
    {
      key: 'status',
      header: approvalMessages.queue.columnStatus,
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={approvalTone(row.status)} dot>
            {labelFor(enumLabels.approvalStatus, row.status)}
          </Badge>
          {row.is_overdue ? <Badge tone="critical">{approvalMessages.queue.overdue}</Badge> : null}
        </div>
      ),
    },
    {
      key: 'created',
      header: approvalMessages.queue.columnCreated,
      secondary: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-muted" title={formatDateTime(row.created_at)}>
          {formatRelative(row.created_at)}
        </span>
      ),
    },
    {
      key: 'expires',
      header: approvalMessages.queue.columnExpires,
      align: 'right',
      cell: (row) => (
        <span
          className={[
            'whitespace-nowrap',
            row.is_overdue ? 'text-critical-text' : 'text-muted',
          ].join(' ')}
          title={formatDateTime(row.expires_at)}
        >
          {formatRelative(row.expires_at)}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.approval_id}
      total={total}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      rowTone={(row) => (row.is_overdue ? 'warning' : 'default')}
      caption={approvalMessages.queue.description}
    />
  )
}
