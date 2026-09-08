import Link from 'next/link'
import { Badge, DataTable, Mono, subscriptionTone, type Column } from '@/components/ui'
import { formatDateTime, formatRelative, shortId } from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import type { ReconciledUser } from '@/lib/queries/billing'
import { billingMessages } from './messages'

/**
 * Accounts whose stored subscription row and computed entitlement disagree.
 *
 * Every row prints both answers side by side — what the status column claims,
 * and what `resolveEntitlements` in @da/domain returns for the same row — so
 * the divergence is visible rather than asserted. The dates that produced it are
 * in the next columns, coloured when they are the reason.
 *
 * The user is a uuid and a redacted address, and the only link out of the row
 * goes to the backoffice's own user page. Nothing here can identify a person or
 * reach anything they wrote.
 */

export function ReconciliationTable({
  rows,
  total,
  error,
  emptyMessage,
  nowMs,
}: {
  rows: readonly ReconciledUser[]
  total: number
  error: string | null
  emptyMessage: string
  /** The request's instant, so "already passed" is decided once for the page. */
  nowMs: number
}) {
  function isPast(value: string | null): boolean {
    if (value === null) return false
    const instant = new Date(value).getTime()
    return Number.isFinite(instant) && instant < nowMs
  }

  const columns: readonly Column<ReconciledUser>[] = [
    {
      key: 'user',
      header: billingMessages.reconciliation.columnUser,
      cell: (entry) => (
        <Link
          href={`/kullanicilar/${entry.row.user_id}`}
          className="flex flex-col hover:text-primary-on-soft"
        >
          <Mono>{shortId(entry.row.user_id)}</Mono>
          <span className="text-[11px] text-faint">
            {entry.row.email_redacted ?? entry.row.email_domain}
          </span>
        </Link>
      ),
    },
    {
      key: 'status',
      header: billingMessages.reconciliation.columnStatus,
      cell: (entry) => (
        <Badge tone={subscriptionTone(entry.row.subscription_status)} dot>
          {labelFor(enumLabels.subscriptionStatus, entry.row.subscription_status)}
        </Badge>
      ),
    },
    {
      key: 'stored',
      header: billingMessages.reconciliation.columnStored,
      cell: (entry) => (
        <Badge tone={entry.storedPlan === 'pro' ? 'primary' : 'neutral'}>
          {entry.storedPlan === 'pro'
            ? billingMessages.reconciliation.planPro
            : billingMessages.reconciliation.planFree}
        </Badge>
      ),
    },
    {
      key: 'computed',
      header: billingMessages.reconciliation.columnComputed,
      cell: (entry) => (
        <div className="flex flex-col gap-0.5">
          <Badge tone={entry.agrees ? 'neutral' : 'critical'}>
            {entry.computed.plan === 'pro'
              ? billingMessages.reconciliation.planPro
              : billingMessages.reconciliation.planFree}
          </Badge>
          <span className="text-[11px] text-faint">
            {labelFor(billingMessages.reconciliation.sourceLabels, entry.computed.source)}
          </span>
        </div>
      ),
    },
    {
      key: 'store',
      header: billingMessages.reconciliation.columnStore,
      secondary: true,
      cell: (entry) =>
        entry.row.subscription_store === null ? (
          <span className="text-warning-text">{billingMessages.reconciliation.storeNone}</span>
        ) : (
          <Mono>{entry.row.subscription_store}</Mono>
        ),
    },
    {
      key: 'period',
      header: billingMessages.reconciliation.columnPeriodEnd,
      align: 'right',
      cell: (entry) =>
        entry.row.subscription_period_end === null ? null : (
          <span
            title={formatDateTime(entry.row.subscription_period_end)}
            className={isPast(entry.row.subscription_period_end) ? 'text-critical-text' : undefined}
          >
            {formatRelative(entry.row.subscription_period_end)}
          </span>
        ),
    },
    {
      key: 'trial',
      header: billingMessages.reconciliation.columnTrialEnd,
      align: 'right',
      secondary: true,
      cell: (entry) =>
        entry.row.trial_ends_at === null ? null : (
          <span
            title={formatDateTime(entry.row.trial_ends_at)}
            className={isPast(entry.row.trial_ends_at) ? 'text-critical-text' : undefined}
          >
            {formatRelative(entry.row.trial_ends_at)}
          </span>
        ),
    },
    {
      key: 'updated',
      header: messages.fields.updatedAt,
      align: 'right',
      secondary: true,
      cell: (entry) => (
        <span title={formatDateTime(entry.row.updated_at)} className="text-faint">
          {formatRelative(entry.row.updated_at)}
        </span>
      ),
    },
    {
      key: 'open',
      header: billingMessages.reconciliation.columnOpen,
      align: 'right',
      cell: (entry) => (
        <Link
          href={`/kullanicilar/${entry.row.user_id}`}
          className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:border-primary/40 hover:text-ink"
        >
          {billingMessages.reconciliation.open}
        </Link>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(entry) => entry.row.user_id}
      total={total}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={emptyMessage}
      rowTone={(entry) => (entry.agrees ? 'warning' : 'critical')}
      caption={billingMessages.reconciliation.listTitle}
    />
  )
}
