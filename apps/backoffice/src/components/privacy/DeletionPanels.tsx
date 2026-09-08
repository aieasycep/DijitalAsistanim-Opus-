import Link from 'next/link'
import { Badge, CardError, DataTable, Mono, Num, type Column } from '@/components/ui'
import type { BoAuditRow, BoUserRow } from '@/lib/db'
import { formatDateTime, formatNumber, formatRelative, shortId } from '@/lib/format'
import type { DeletionCounters } from '@/lib/queries/privacy'
import { userDetailHref } from './contract'
import { privacyMessages } from './messages'

/**
 * Deletion, observed — and deliberately not offered.
 *
 * There is no delete button anywhere in this area, and the panel says why in
 * plain Turkish rather than leaving its absence to be noticed. Erasure runs
 * through `delete-account`, which requires the user's own session and the user
 * typing their own address, and it revokes provider tokens, empties both
 * storage buckets and removes the auth row in one irreversible pass. A staff
 * button for that would hand an operator the power to end an account on a
 * hunch, which is precisely the power this tool exists to demonstrate nobody
 * has.
 *
 * What staff get instead is the count and the timing, which is all an
 * obligation needs: how many erasures happened, when the last one was, and
 * whether any of them failed to finish.
 */

export interface DeletionSummaryProps {
  counters: DeletionCounters | null
  error: string | null
  windowDays: number
}

export function DeletionSummary({ counters, error, windowDays }: DeletionSummaryProps) {
  if (error !== null) {
    return <CardError message={error} hint={privacyMessages.errors.deletionFailed} />
  }
  if (counters === null) {
    return <CardError message={privacyMessages.errors.deletionFailed} />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Figure
          label={privacyMessages.deletion.accountDeleted}
          hint={privacyMessages.deletion.last24h}
          value={formatNumber(counters.accountLast24h)}
        />
        <Figure
          label={privacyMessages.deletion.accountDeleted}
          hint={privacyMessages.deletion.windowLabel(windowDays)}
          value={formatNumber(counters.accountInWindow)}
        />
        <Figure
          label={privacyMessages.deletion.accountDeleted}
          hint={privacyMessages.deletion.total}
          value={formatNumber(counters.accountTotal)}
        />
        <Figure
          label={privacyMessages.deletion.historyDeleted}
          hint={privacyMessages.deletion.windowLabel(windowDays)}
          value={formatNumber(counters.historyInWindow)}
        />
        <Figure
          label={privacyMessages.deletion.historyDeleted}
          hint={privacyMessages.deletion.total}
          value={formatNumber(counters.historyTotal)}
        />
        <Figure
          label={privacyMessages.deletion.marksSection}
          hint={privacyMessages.deletion.total}
          value={formatNumber(counters.markedTotal)}
          tone={counters.markedTotal > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <p className="rounded-md bg-surface2/70 p-3 text-[12px] leading-relaxed text-muted">
        {privacyMessages.deletion.staffNote}
      </p>
    </div>
  )
}

function Figure({
  label,
  hint,
  value,
  tone = 'neutral',
}: {
  label: string
  hint: string
  value: string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-md border border-hairline px-3 py-2">
      <span className="bo-kicker block truncate" title={label}>
        {label}
      </span>
      <span
        className={[
          'mt-0.5 block text-[18px] leading-6 font-semibold tabular-nums',
          tone === 'warning' ? 'text-warning-text' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </span>
      <span className="block text-[11px] text-faint">{hint}</span>
    </div>
  )
}

/**
 * The erasure events themselves.
 *
 * `subject_user_id` is null on every row here and that is correct: the audit
 * row for a deletion is written with a null user id so it outlives the account
 * it describes. The trail proves an erasure happened without keeping a pointer
 * to the person erased, which is the only shape a record of erasure can honestly
 * take.
 */
export interface DeletionEventTableProps {
  rows: readonly BoAuditRow[]
  error: string | null
}

export function DeletionEventTable({ rows, error }: DeletionEventTableProps) {
  const columns: readonly Column<BoAuditRow>[] = [
    {
      key: 'action',
      header: privacyMessages.deletion.columnAction,
      cell: (row) => (
        <span className="text-ink">
          {row.action === null
            ? '—'
            : (privacyMessages.deletion.actionLabels[row.action] ?? row.action)}
        </span>
      ),
    },
    {
      key: 'when',
      header: privacyMessages.deletion.columnWhen,
      cell: (row) => (
        <span title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</span>
      ),
    },
    {
      key: 'entity',
      header: privacyMessages.deletion.columnEntity,
      secondary: true,
      cell: (row) => (row.entity_type === null ? null : <Mono>{row.entity_type}</Mono>),
    },
    {
      key: 'keys',
      header: privacyMessages.deletion.columnKeys,
      align: 'right',
      secondary: true,
      cell: (row) => (
        <Num>
          <span title={(row.metadata_keys ?? []).join(', ')}>
            {formatNumber(row.metadata_keys?.length ?? 0)}
          </span>
        </Num>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.audit_id}
      error={error}
      emptyMessage={privacyMessages.deletion.eventsEmpty}
      caption={privacyMessages.deletion.eventsSection}
    />
  )
}

/**
 * Accounts still carrying a deletion mark.
 *
 * `delete-account` removes the auth user and lets the cascade clear the
 * profile, so a row that is still here with `deleted_at` set is a deletion that
 * started and did not finish. It is the one deletion signal that needs a human.
 */
export interface DeletionMarkTableProps {
  rows: readonly BoUserRow[]
  total?: number
  error: string | null
}

export function DeletionMarkTable({ rows, total, error }: DeletionMarkTableProps) {
  const columns: readonly Column<BoUserRow>[] = [
    {
      key: 'user',
      header: privacyMessages.deletion.columnUser,
      cell: (row) => (
        <div className="flex flex-col leading-tight">
          <Link
            href={userDetailHref(row.user_id)}
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
      key: 'marked',
      header: privacyMessages.deletion.columnMarkedAt,
      cell: (row) => (
        <span title={formatDateTime(row.deleted_at)}>{formatRelative(row.deleted_at)}</span>
      ),
    },
    {
      key: 'accounts',
      header: privacyMessages.deletion.columnAccounts,
      align: 'right',
      secondary: true,
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Num>{formatNumber(row.account_count)}</Num>
          {row.account_connected_count > 0 ? (
            <Badge tone="warning">{formatNumber(row.account_connected_count)}</Badge>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.user_id}
      total={total}
      error={error}
      emptyMessage={privacyMessages.deletion.marksEmpty}
      rowTone={() => 'warning'}
      caption={privacyMessages.deletion.marksSection}
    />
  )
}
