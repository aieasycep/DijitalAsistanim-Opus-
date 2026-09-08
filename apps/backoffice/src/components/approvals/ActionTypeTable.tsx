import { Badge, DataTable, Mono, Num, type Column } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { ActionTypeStats } from '@/lib/queries/approvals'
import { RATE_BASIS_POINTS, type ApprovalWindowKey } from './contract'
import { formatRate, formatRateDelta, rejectionRateTone, type RateTone } from './format'
import { approvalMessages, actionTypeLabels } from './messages'
import { CountBar, RateBar } from './RateBar'
import { ReviewForm } from './ReviewForm'

/**
 * Rejection rate per action type — the number this whole area exists to show.
 *
 * A rising rejection rate on `email_send` means the drafts got worse, and it is
 * the only signal in the product that says so without anyone reading a draft.
 * So the rate is the column with the bar, and the period-over-period change sits
 * beside it: a rate of 30% is not news, a rate that was 12% last month is.
 *
 * The denominator is decisions, not proposals. Dividing by proposals would make
 * the rate fall every time the queue filled with items nobody had answered yet,
 * which is precisely when an operator most needs it to hold still.
 */

const BADGE_TONE: Readonly<Record<RateTone, 'success' | 'neutral' | 'warning' | 'critical'>> = {
  success: 'success',
  neutral: 'neutral',
  warning: 'warning',
  critical: 'critical',
}

export interface ActionTypeTableProps {
  rows: readonly ActionTypeStats[]
  error: string | null
  window: ApprovalWindowKey
  /** The Server Action behind the review disclosure on each row. */
  reviewAction: (formData: FormData) => void | Promise<void>
  returnTo: string
  /** The subject whose result banner is showing, so its row reopens. */
  resultSubject: string | null
}

export function ActionTypeTable({
  rows,
  error,
  window,
  reviewAction,
  returnTo,
  resultSubject,
}: ActionTypeTableProps) {
  const maxProposed = rows.reduce((largest, row) => Math.max(largest, row.proposed), 0)

  const columns: readonly Column<ActionTypeStats>[] = [
    {
      key: 'type',
      header: approvalMessages.types.columnType,
      cell: (row) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{actionTypeLabels[row.type] ?? row.type}</div>
          <Mono>{row.type}</Mono>
        </div>
      ),
    },
    {
      key: 'proposed',
      header: approvalMessages.types.columnProposed,
      align: 'right',
      cell: (row) => (
        <div className="min-w-16">
          <Num>{formatNumber(row.proposed)}</Num>
          <CountBar value={row.proposed} max={maxProposed} />
        </div>
      ),
    },
    {
      key: 'pending',
      header: approvalMessages.types.columnPending,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.pending)}</Num>,
    },
    {
      key: 'accepted',
      header: approvalMessages.types.columnApproved,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.accepted)}</Num>,
    },
    {
      key: 'executed',
      header: approvalMessages.types.columnExecuted,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.executed)}</Num>,
    },
    {
      key: 'rejected',
      header: approvalMessages.types.columnRejected,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.rejected)}</Num>,
    },
    {
      key: 'expired',
      header: approvalMessages.types.columnExpired,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.expired)}</Num>,
    },
    {
      key: 'failed',
      header: approvalMessages.types.columnFailed,
      align: 'right',
      cell: (row) =>
        row.failed === 0 ? (
          <span className="text-faint">0</span>
        ) : (
          <Badge tone="critical">{formatNumber(row.failed)}</Badge>
        ),
    },
    {
      key: 'rate',
      header: approvalMessages.types.columnRate,
      title: approvalMessages.types.rateTitle,
      align: 'right',
      width: 'w-28',
      cell: (row) => {
        const tone = rejectionRateTone(row.rejectionRate)
        return (
          <div className="min-w-20">
            <span className="font-semibold tabular-nums">{formatRate(row.rejectionRate)}</span>
            <RateBar value={row.rejectionRate} tone={tone} />
            <span className="mt-0.5 block text-[11px] text-faint">
              {row.decided > 0 ? formatNumber(row.decided) : approvalMessages.types.noDecisions}
            </span>
          </div>
        )
      },
    },
    {
      key: 'trend',
      header: approvalMessages.types.columnTrend,
      title: approvalMessages.types.trendTitle,
      secondary: true,
      cell: (row) => {
        const delta = formatRateDelta(row.rejectionRateDelta, row.previousDecided)
        return (
          <div className="min-w-0">
            <Badge tone={BADGE_TONE[delta.tone]}>{delta.label}</Badge>
            {row.previousDecided > 0 ? (
              <span className="mt-0.5 block text-[11px] text-faint">
                {formatRate(row.previousRejectionRate)}
              </span>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'review',
      header: approvalMessages.types.columnReview,
      cell: (row) => (
        <ReviewForm
          action={reviewAction}
          scope="type"
          subject={row.type}
          subjectLabel={actionTypeLabels[row.type] ?? row.type}
          window={window}
          // Basis points: an integer survives a URL and an audit row without a
          // locale deciding where the decimal separator goes.
          measure={Math.round((row.rejectionRate ?? 0) * RATE_BASIS_POINTS)}
          sample={row.decided}
          measureLabel={approvalMessages.types.measureCaption(
            formatRate(row.rejectionRate),
            formatNumber(row.decided),
          )}
          returnTo={returnTo}
          reopen={resultSubject === row.type}
        />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.type}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={approvalMessages.types.empty}
      rowTone={(row) =>
        rejectionRateTone(row.rejectionRate) === 'critical' ? 'critical' : 'default'
      }
      caption={approvalMessages.types.description}
    />
  )
}
