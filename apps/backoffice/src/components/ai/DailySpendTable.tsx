import { type Column, DataTable, Num } from '@/components/ui'
import { formatCompact, formatCostMicros, formatDate, formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { DailySpend } from '@/lib/queries/ai'
import { Bar } from './Bar'
import { formatCostPerEvent } from './format'
import { aiMessages } from './messages'

/**
 * One row per Istanbul day in the window, newest first.
 *
 * Days with no model call are still rows: a gap in a cost series is a fact
 * about the pipeline — a stalled cron, a provider outage — and dropping the row
 * would hide it behind a table that simply looks shorter.
 *
 * The bar under each cost is scaled to the busiest day in the same window, so
 * the shape of the week is readable without reading six figures.
 */
export function DailySpendTable({
  rows,
  error,
}: {
  rows: readonly DailySpend[]
  error: string | null
}) {
  const maxCost = rows.reduce((max, row) => Math.max(max, row.costMicros), 0)

  const columns: readonly Column<DailySpend>[] = [
    {
      key: 'day',
      header: aiMessages.fields.day,
      width: 'w-28',
      cell: (row) => formatDate(row.day),
    },
    {
      key: 'events',
      header: aiMessages.fields.events,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.events)}</Num>,
    },
    {
      key: 'tokensIn',
      header: aiMessages.fields.tokensIn,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatCompact(row.tokensIn)}</Num>,
    },
    {
      key: 'tokensOut',
      header: aiMessages.fields.tokensOut,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatCompact(row.tokensOut)}</Num>,
    },
    {
      key: 'perEvent',
      header: aiMessages.fields.costPerEvent,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatCostPerEvent(row.costMicros, row.events)}</Num>,
    },
    {
      key: 'cost',
      header: aiMessages.fields.cost,
      align: 'right',
      width: 'w-32',
      cell: (row) => (
        <div className="flex flex-col items-end">
          <Num>{formatCostMicros(row.costMicros)}</Num>
          <Bar value={row.costMicros} max={maxCost} block />
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.day}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={aiMessages.spend.dailyEmpty}
      caption={aiMessages.spend.dailySection}
    />
  )
}
