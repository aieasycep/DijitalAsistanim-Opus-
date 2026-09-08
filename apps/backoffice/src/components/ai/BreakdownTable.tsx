import type { ReactNode } from 'react'
import { type Column, DataTable, Num } from '@/components/ui'
import { formatCompact, formatCostMicros, formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { SpendBreakdownRow } from '@/lib/queries/ai'
import { Bar } from './Bar'
import { formatCostPerEvent, formatRatio, ratioOf } from './format'
import { aiMessages } from './messages'

/**
 * Spend split by one dimension — model, or the `operation` label the pipeline
 * writes with every call.
 *
 * One component serves both because the question is identical either way: which
 * bucket is the money in, and is it expensive because it runs often or because
 * each run costs a lot. Those are different problems with different fixes, so
 * the table always shows the call count and the per-call cost beside the share.
 */
export function BreakdownTable({
  rows,
  totalCostMicros,
  labelFor,
  headerLabel,
  emptyMessage,
  caption,
  error,
}: {
  rows: readonly SpendBreakdownRow[]
  /** Window total, so every share divides by the same denominator. */
  totalCostMicros: number
  labelFor: (key: string) => ReactNode
  headerLabel: string
  emptyMessage: string
  caption: string
  error: string | null
}) {
  const maxCost = rows.reduce((max, row) => Math.max(max, row.costMicros), 0)

  const columns: readonly Column<SpendBreakdownRow>[] = [
    {
      key: 'label',
      header: headerLabel,
      cell: (row) => labelFor(row.key),
    },
    {
      key: 'events',
      header: aiMessages.fields.events,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.events)}</Num>,
    },
    {
      key: 'tokens',
      header: aiMessages.fields.tokensIn,
      align: 'right',
      secondary: true,
      cell: (row) => (
        <Num>
          {formatCompact(row.tokensIn)} / {formatCompact(row.tokensOut)}
        </Num>
      ),
      title: `${aiMessages.fields.tokensIn} / ${aiMessages.fields.tokensOut}`,
    },
    {
      key: 'perEvent',
      header: aiMessages.fields.costPerEvent,
      align: 'right',
      cell: (row) => <Num>{formatCostPerEvent(row.costMicros, row.events)}</Num>,
    },
    {
      key: 'cost',
      header: aiMessages.fields.cost,
      align: 'right',
      cell: (row) => <Num>{formatCostMicros(row.costMicros)}</Num>,
    },
    {
      key: 'share',
      header: aiMessages.fields.share,
      align: 'right',
      width: 'w-28',
      cell: (row) => (
        <div className="flex flex-col items-end">
          <Num>{formatRatio(ratioOf(row.costMicros, totalCostMicros))}</Num>
          <Bar value={row.costMicros} max={maxCost} block />
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={emptyMessage}
      caption={caption}
    />
  )
}
