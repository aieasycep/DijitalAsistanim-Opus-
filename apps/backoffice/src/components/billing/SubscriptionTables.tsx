import {
  Badge,
  DataTable,
  Num,
  subscriptionTone,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { formatNumber, formatPercent } from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import type { CohortRow, StatusCount, TrialFunnel } from '@/lib/queries/billing'
import { MeterBar } from './MeterBar'
import { billingMessages } from './messages'

/**
 * The three tables on the subscriptions page.
 *
 * They share a file because they share a shape: a small, fully-aggregated
 * result set where every figure is a `count(*)` Postgres already ran, rendered
 * with a bar so the distribution is readable without arithmetic. None of them
 * receives rows to tally — the numbers arrive counted.
 */

// ---------------------------------------------------------------------------
// Status mix
// ---------------------------------------------------------------------------

export function SubscriptionMixTable({
  rows,
  total,
  error,
}: {
  rows: readonly StatusCount[]
  total: number
  error: string | null
}) {
  const columns: readonly Column<StatusCount>[] = [
    {
      key: 'status',
      header: billingMessages.subscriptions.mixStatus,
      cell: (row) => (
        <Badge tone={subscriptionTone(row.status)} dot>
          {labelFor(enumLabels.subscriptionStatus, row.status)}
        </Badge>
      ),
    },
    {
      key: 'count',
      header: billingMessages.subscriptions.mixCount,
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>{formatNumber(row.count)}</Num>,
    },
    {
      key: 'share',
      header: billingMessages.subscriptions.mixShare,
      align: 'right',
      width: 'w-44',
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-2">
          <MeterBar value={row.count} max={total} tone={subscriptionTone(row.status)} />
          <span className="w-10 tabular-nums text-muted">{formatPercent(row.count, total)}</span>
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.status}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={billingMessages.subscriptions.mixEmpty}
      caption={billingMessages.subscriptions.mixTitle}
    />
  )
}

// ---------------------------------------------------------------------------
// Trial outcomes
// ---------------------------------------------------------------------------

interface TrialOutcome {
  key: string
  label: string
  hint?: string
  count: number
  tone: BadgeTone
}

/**
 * Where ended trials landed.
 *
 * The four rows partition the ended set exactly — the statuses are mutually
 * exclusive — so the shares add to one hundred and `lapsed` can be the
 * remainder rather than another round trip.
 */
export function TrialOutcomeTable({
  funnel,
  error,
}: {
  funnel: TrialFunnel | null
  error: string | null
}) {
  const outcomes: readonly TrialOutcome[] = funnel
    ? [
        {
          key: 'converted',
          label: billingMessages.subscriptions.trialConverted,
          count: funnel.converted,
          tone: 'success',
        },
        {
          key: 'lapsed',
          label: billingMessages.subscriptions.trialLapsed,
          count: funnel.lapsed,
          tone: 'neutral',
        },
        {
          key: 'billing_issue',
          label: billingMessages.subscriptions.trialBillingIssue,
          count: funnel.billingIssue,
          tone: 'critical',
        },
        {
          key: 'stuck',
          label: billingMessages.subscriptions.trialStuck,
          hint: billingMessages.subscriptions.trialStuckHint,
          count: funnel.stuck,
          tone: 'warning',
        },
      ]
    : []

  const ended = funnel?.ended ?? 0

  const columns: readonly Column<TrialOutcome>[] = [
    {
      key: 'label',
      header: messages.fields.status,
      cell: (row) => (
        <div className="flex flex-col">
          <span>{row.label}</span>
          {row.hint ? <span className="text-[11px] text-faint">{row.hint}</span> : null}
        </div>
      ),
    },
    {
      key: 'count',
      header: messages.fields.count,
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>{formatNumber(row.count)}</Num>,
    },
    {
      key: 'share',
      header: billingMessages.subscriptions.mixShare,
      align: 'right',
      width: 'w-44',
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-2">
          <MeterBar value={row.count} max={ended} tone={row.tone} />
          <span className="w-10 tabular-nums text-muted">{formatPercent(row.count, ended)}</span>
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={outcomes}
      rowKey={(row) => row.key}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={billingMessages.subscriptions.trialEmpty}
      rowTone={(row) => (row.key === 'stuck' && row.count > 0 ? 'warning' : 'default')}
      caption={billingMessages.subscriptions.trialTitle}
    />
  )
}

// ---------------------------------------------------------------------------
// Signup cohorts
// ---------------------------------------------------------------------------

export function CohortTable({ rows, error }: { rows: readonly CohortRow[]; error: string | null }) {
  const largest = rows.reduce((max, row) => Math.max(max, row.total), 0)

  const columns: readonly Column<CohortRow>[] = [
    {
      key: 'bucket',
      header: billingMessages.subscriptions.cohortBucket,
      cell: (row) => row.bucket.label,
    },
    {
      key: 'total',
      header: billingMessages.subscriptions.cohortTotal,
      align: 'right',
      width: 'w-40',
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-2">
          <MeterBar value={row.total} max={largest} tone="info" width="w-16" />
          <span className="w-12 tabular-nums">{formatNumber(row.total)}</span>
        </span>
      ),
    },
    {
      key: 'paying',
      header: billingMessages.subscriptions.cohortPaying,
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>{formatNumber(row.paying)}</Num>,
    },
    {
      key: 'rate',
      header: billingMessages.subscriptions.cohortRate,
      align: 'right',
      width: 'w-40',
      cell: (row) =>
        row.rate === null ? null : (
          <span className="inline-flex items-center justify-end gap-2">
            <MeterBar value={row.paying} max={row.total} tone="success" width="w-16" />
            <span className="w-10 tabular-nums text-muted">
              {formatPercent(row.paying, row.total)}
            </span>
          </span>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.bucket.key}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={billingMessages.subscriptions.cohortEmpty}
      caption={billingMessages.subscriptions.cohortTitle}
    />
  )
}
