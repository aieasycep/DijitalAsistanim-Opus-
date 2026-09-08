import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, type Column, DataTable, Mono, Num, connectionTone } from '@/components/ui'
import type { BoSyncHealthRow } from '@/lib/db'
import { formatDateTime, formatNumber, formatRelative, shortId } from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import type { ResyncOutcome } from './contract'
import { opsMessages } from './messages'
import { ResyncForm } from './ResyncForm'

/**
 * The work queue: sync resources that are currently in error, worst first.
 *
 * Everything an operator needs to triage without ever asking what the failure
 * *said*. The provider's message is not omitted by this component — it never
 * left the database. `bo_sync_health` projects `sync_states.last_error` through
 * `bo_error_code()`, which passes only token-shaped labels and collapses
 * anything sentence-shaped to `unstructured`, precisely because a provider
 * error can quote the payload that failed back at us.
 *
 * The last column is the one action this area can take. It is rendered per row
 * rather than as a bulk control on purpose: a resync is an outward call on one
 * person's behalf, and it carries one written reason for one account.
 */

export interface FailingSyncTableProps {
  rows: readonly BoSyncHealthRow[]
  total?: number
  error: string | null
  /** The resync Server Action, threaded down from the page. */
  action: (formData: FormData) => void | Promise<void>
  /** Where the action returns to — this page's own path and query. */
  returnTo: string
  /** Link target for an error code, so a code is a filter rather than a label. */
  codeHref?: (code: string) => string
  /** The account the last action touched, and how it went. */
  resultAccountId?: string | null
  resultOutcome?: ResyncOutcome | null
  emptyMessage: string
  emptyAction?: ReactNode
}

export function FailingSyncTable({
  rows,
  total,
  error,
  action,
  returnTo,
  codeHref,
  resultAccountId = null,
  resultOutcome = null,
  emptyMessage,
  emptyAction,
}: FailingSyncTableProps) {
  const columns: readonly Column<BoSyncHealthRow>[] = [
    {
      key: 'account',
      header: opsMessages.failing.account,
      cell: (row) => (
        <div className="flex flex-col leading-tight">
          <Mono>{shortId(row.connected_account_id)}</Mono>
          <span className="text-[11px] text-faint">
            <span className="bo-kicker mr-1">{messages.fields.userId}</span>
            {shortId(row.user_id)}
          </span>
        </div>
      ),
    },
    {
      key: 'pipeline',
      header: `${messages.fields.provider} · ${messages.fields.resource}`,
      cell: (row) => (
        <div className="flex flex-col leading-tight">
          <span>{labelFor(enumLabels.provider, row.provider)}</span>
          <span className="text-[11px] text-faint">
            {labelFor(enumLabels.accountKind, row.resource)}
          </span>
        </div>
      ),
    },
    {
      key: 'connection',
      header: opsMessages.failing.accountStatus,
      secondary: true,
      cell: (row) => (
        <Badge tone={connectionTone(row.account_status)} dot>
          {labelFor(enumLabels.connectionStatus, row.account_status)}
        </Badge>
      ),
    },
    {
      key: 'failures',
      header: opsMessages.failing.failures,
      title: opsMessages.failing.failuresTitle,
      align: 'right',
      cell: (row) => (
        <Badge tone={row.consecutive_failures >= 5 ? 'critical' : 'warning'}>
          <Num>{formatNumber(row.consecutive_failures)}</Num>
        </Badge>
      ),
    },
    {
      key: 'code',
      header: messages.fields.lastErrorCode,
      cell: (row) => {
        if (row.last_error_code === null) return null
        if (!codeHref) return <Mono>{row.last_error_code}</Mono>
        return (
          <Link
            href={codeHref(row.last_error_code)}
            className="font-mono text-[12px] text-muted underline decoration-hairline underline-offset-2 hover:text-ink hover:decoration-primary"
          >
            {row.last_error_code}
          </Link>
        )
      },
    },
    {
      key: 'lastRun',
      header: opsMessages.failing.lastRun,
      align: 'right',
      cell: (row) => (
        <span title={formatDateTime(row.last_run_at)}>{formatRelative(row.last_run_at)}</span>
      ),
    },
    {
      key: 'nextRun',
      header: opsMessages.failing.nextRun,
      align: 'right',
      secondary: true,
      cell: (row) => (
        <span title={formatDateTime(row.next_run_at)} className="text-muted">
          {formatRelative(row.next_run_at)}
        </span>
      ),
    },
    {
      key: 'action',
      header: opsMessages.failing.action,
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end">
          <ResyncForm
            action={action}
            accountId={row.connected_account_id}
            userId={row.user_id}
            provider={row.provider}
            providerLabel={labelFor(enumLabels.provider, row.provider)}
            resource={row.resource}
            resourceLabel={labelFor(enumLabels.accountKind, row.resource)}
            returnTo={returnTo}
            outcome={resultAccountId === row.connected_account_id ? resultOutcome : null}
          />
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.sync_state_id}
      total={total}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      rowTone={(row) => (row.consecutive_failures >= 5 ? 'critical' : 'warning')}
      caption={opsMessages.failing.section}
    />
  )
}
