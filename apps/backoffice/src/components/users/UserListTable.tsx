import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, type Column, DataTable, Mono, Num, subscriptionTone } from '@/components/ui'
import type { BoUserRow } from '@/lib/db'
import { formatDateTime, formatNumber, formatRelative, shortId } from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import { userMessages } from './messages'

/**
 * The roster table.
 *
 * Six columns, every one of them a fact the tool is allowed to know: an id, a
 * mask, a plan, a connection tally, a staleness and a join date. The identity
 * column is the row's link — a support call starts by opening the account, so
 * the first thing under the cursor should be the way in.
 */

const columns: readonly Column<BoUserRow>[] = [
  {
    key: 'identity',
    header: messages.fields.userId,
    cell: (row) => (
      <Link
        href={`/kullanicilar/${row.user_id}`}
        className="flex flex-col rounded-sm hover:text-primary-on-soft"
        title={userMessages.list.openUser}
      >
        <Mono>{shortId(row.user_id)}</Mono>
        <span className="text-[11px] text-faint">
          {row.email_redacted ?? row.email_domain ?? messages.fields.unknown}
        </span>
      </Link>
    ),
  },
  {
    key: 'plan',
    header: messages.fields.plan,
    cell: (row) => (
      <Badge tone={subscriptionTone(row.subscription_status)}>
        {labelFor(enumLabels.subscriptionStatus, row.subscription_status)}
      </Badge>
    ),
  },
  {
    key: 'onboarding',
    header: userMessages.list.onboardingLabel,
    secondary: true,
    cell: (row) =>
      row.is_onboarded ? (
        <span className="text-[12px] text-muted">{userMessages.detail.onboarded}</span>
      ) : (
        <Badge tone="warning">{userMessages.onboardingFilter.eksik}</Badge>
      ),
  },
  {
    key: 'accounts',
    header: messages.fields.accounts,
    align: 'right',
    cell: (row) => (
      <div className="flex flex-col items-end">
        <Num>
          {formatNumber(row.account_connected_count)}
          <span className="text-faint"> / {formatNumber(row.account_count)}</span>
        </Num>
        {row.account_error_count > 0 ? (
          <span className="text-[11px] text-critical-text">
            {formatNumber(row.account_error_count)} {userMessages.list.accountErrorCount}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'sync',
    header: messages.fields.lastRunAt,
    align: 'right',
    cell: (row) => (
      <div className="flex flex-col items-end">
        <span title={formatDateTime(row.last_synced_at)}>{formatRelative(row.last_synced_at)}</span>
        {row.sync_error_count > 0 ? (
          <span className="text-[11px] text-critical-text">
            {formatNumber(row.sync_error_count)} {userMessages.list.syncErrorCount}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'created',
    header: messages.fields.createdAt,
    align: 'right',
    secondary: true,
    cell: (row) => (
      <span title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</span>
    ),
  },
]

export function UserListTable({
  rows,
  total,
  error,
  emptyMessage,
  emptyAction,
}: {
  rows: readonly BoUserRow[]
  total: number
  error: string | null
  emptyMessage: string
  emptyAction?: ReactNode
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.user_id}
      total={total}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      caption={userMessages.list.caption}
      rowTone={(row) => {
        if (row.is_deleted) return 'default'
        if (row.account_error_count > 0) return 'critical'
        if (row.sync_error_count > 0 || row.account_count === 0) return 'warning'
        return 'default'
      }}
    />
  )
}
