import Link from 'next/link'
import type { ReactNode } from 'react'
import { MAX_APPROVAL_ATTEMPTS } from '@da/domain'
import { Badge, DataTable, Mono, type Column } from '@/components/ui'
import type { BoApprovalRow } from '@/lib/db'
import { formatDateTime, formatRelative, shortId } from '@/lib/format'
import { messages } from '@/lib/messages'
import { userDetailHref } from './contract'
import { approvalMessages, actionTypeLabels, sourceTypeLabels } from './messages'

/**
 * Approvals whose execution failed, most-attempted first.
 *
 * The retry state is the point of this table. `MAX_APPROVAL_ATTEMPTS` comes from
 * `@da/domain`, the same constant the executor enforces, so "hakkı bitti" here
 * means exactly what it means in the backend: this approval will not be tried
 * again, and the user has been told it failed.
 *
 * There is no retry button. Re-running one of these sends the mail the user
 * drafted, and `approval-retry` requires that user's own token by design —
 * a credential this application does not have and should not want. Staff can see
 * that it failed and why in code; only the user can ask for it again.
 */

export interface FailedApprovalTableProps {
  rows: readonly BoApprovalRow[]
  total?: number
  error: string | null
  /** Turns a code into a link to the queue filtered by it. */
  codeHref?: (code: string) => string
  emptyMessage: string
  emptyAction?: ReactNode
}

export function FailedApprovalTable({
  rows,
  total,
  error,
  codeHref,
  emptyMessage,
  emptyAction,
}: FailedApprovalTableProps) {
  const columns: readonly Column<BoApprovalRow>[] = [
    {
      key: 'approval',
      header: approvalMessages.failureQueue.columnApproval,
      cell: (row) => <Mono>{shortId(row.approval_id)}</Mono>,
    },
    {
      key: 'user',
      header: approvalMessages.failureQueue.columnUser,
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
      header: approvalMessages.failureQueue.columnType,
      cell: (row) => <span className="text-ink">{actionTypeLabels[row.type] ?? row.type}</span>,
    },
    {
      key: 'source',
      header: approvalMessages.failureQueue.columnSource,
      secondary: true,
      cell: (row) =>
        row.source_type === null ? null : (
          <span className="text-muted">{sourceTypeLabels[row.source_type] ?? row.source_type}</span>
        ),
    },
    {
      key: 'code',
      header: approvalMessages.failureQueue.columnCode,
      cell: (row) => {
        if (row.failure_code === null) return null
        if (codeHref === undefined) return <Mono>{row.failure_code}</Mono>
        return (
          <Link
            href={codeHref(row.failure_code)}
            className="font-mono text-[12px] text-primary-on-soft underline underline-offset-2 hover:text-primary"
          >
            {row.failure_code}
          </Link>
        )
      },
    },
    {
      key: 'attempts',
      header: approvalMessages.failureQueue.columnAttempts,
      align: 'right',
      cell: (row) => {
        const exhausted = row.attempt_count >= MAX_APPROVAL_ATTEMPTS
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="tabular-nums">
              {approvalMessages.failureQueue.attemptsOf(row.attempt_count, MAX_APPROVAL_ATTEMPTS)}
            </span>
            {exhausted ? (
              <Badge tone="critical">{approvalMessages.failureQueue.exhausted}</Badge>
            ) : null}
          </span>
        )
      },
    },
    {
      key: 'next',
      header: approvalMessages.failureQueue.columnNextAttempt,
      secondary: true,
      cell: (row) =>
        row.next_attempt_at === null ? (
          <span className="text-faint">{approvalMessages.failureQueue.noRetry}</span>
        ) : (
          <span
            className="whitespace-nowrap text-muted"
            title={formatDateTime(row.next_attempt_at)}
          >
            {formatRelative(row.next_attempt_at)}
          </span>
        ),
    },
    {
      key: 'updated',
      header: approvalMessages.failureQueue.columnUpdated,
      align: 'right',
      cell: (row) => (
        <span className="whitespace-nowrap text-muted" title={formatDateTime(row.updated_at)}>
          {formatRelative(row.updated_at)}
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
      rowTone={(row) => (row.attempt_count >= MAX_APPROVAL_ATTEMPTS ? 'critical' : 'default')}
      caption={approvalMessages.failureQueue.description}
    />
  )
}
