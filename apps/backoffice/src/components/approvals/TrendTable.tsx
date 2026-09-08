import { Badge, DataTable, Num, type Column } from '@/components/ui'
import { formatDate, formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { ApprovalTrendBucket } from '@/lib/queries/approvals'
import { formatRate, rejectionRateTone } from './format'
import { approvalMessages } from './messages'
import { CountBar, RateBar } from './RateBar'

/**
 * The window cut into equal slices, so a rate that moved is visible as movement
 * rather than as a single number an operator has to remember from last week.
 *
 * Every slice is two real `count(*)`s with its own `created_at >= … < …` range,
 * which is why the last slice is marked: it is still filling, and its share will
 * only ever go up as its pending proposals are answered.
 */

export interface TrendTableProps {
  buckets: readonly ApprovalTrendBucket[]
  error: string | null
}

export function TrendTable({ buckets, error }: TrendTableProps) {
  const maxProposed = buckets.reduce((largest, bucket) => Math.max(largest, bucket.proposed), 0)
  const hasVolume = buckets.some((bucket) => bucket.proposed > 0)

  const columns: readonly Column<ApprovalTrendBucket>[] = [
    {
      key: 'period',
      header: approvalMessages.trend.columnPeriod,
      cell: (bucket) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-ink">{formatDate(bucket.startIso)}</span>
          <span className="text-faint">→</span>
          <span className="text-muted">{formatDate(bucket.endIso)}</span>
          {bucket.open ? <Badge tone="info">{approvalMessages.trend.open}</Badge> : null}
        </div>
      ),
    },
    {
      key: 'proposed',
      header: approvalMessages.trend.columnProposed,
      align: 'right',
      cell: (bucket) => (
        <div className="min-w-20">
          <Num>{formatNumber(bucket.proposed)}</Num>
          <CountBar value={bucket.proposed} max={maxProposed} />
        </div>
      ),
    },
    {
      key: 'rejected',
      header: approvalMessages.trend.columnRejected,
      align: 'right',
      cell: (bucket) => <Num>{formatNumber(bucket.rejected)}</Num>,
    },
    {
      key: 'share',
      header: approvalMessages.trend.columnShare,
      title: approvalMessages.trend.shareTitle,
      align: 'right',
      width: 'w-28',
      cell: (bucket) => (
        <div className="min-w-20">
          <span className="font-semibold tabular-nums">{formatRate(bucket.rejectedShare)}</span>
          <RateBar value={bucket.rejectedShare} tone={rejectionRateTone(bucket.rejectedShare)} />
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      // A run of empty slices is not an empty table — it is the answer that
      // nothing was proposed — so the rows are only withheld when every slice is
      // zero, which is when the empty state actually says something.
      rows={hasVolume ? buckets : []}
      rowKey={(bucket) => bucket.startIso}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={approvalMessages.trend.empty}
      caption={approvalMessages.trend.description}
    />
  )
}
