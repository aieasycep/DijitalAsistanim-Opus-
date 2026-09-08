import Link from 'next/link'
import { type Column, DataTable, Mono, Num } from '@/components/ui'
import {
  formatCostMicros,
  formatDateTime,
  formatNumber,
  formatRelative,
  shortId,
} from '@/lib/format'
import { messages } from '@/lib/messages'
import type { TopSpender } from '@/lib/queries/ai'
import { Bar } from './Bar'
import { AI_CEILING_PATH } from './contract'
import { aiMessages } from './messages'

/**
 * The head of the per-user cost distribution.
 *
 * A user is a uuid and a masked address here, and nowhere in this table is
 * there a column that could be widened into one: `bo_ai_spend` has no subject,
 * no body, no contact — it is `ai_usage_events` summed per user, and
 * `ai_usage_events` never held any of those in the first place.
 *
 * The row links to the ceiling page rather than to a user detail, because the
 * question a spike here raises is "is this account near its budget", and that
 * is the page that answers it.
 */
export function TopSpenderTable({
  rows,
  windowLabel,
  error,
}: {
  rows: readonly TopSpender[]
  windowLabel: string
  error: string | null
}) {
  const maxCost = rows.reduce((max, row) => Math.max(max, row.costMicros), 0)

  const columns: readonly Column<TopSpender>[] = [
    {
      key: 'user',
      header: aiMessages.fields.user,
      cell: (row) => (
        <div className="flex flex-col">
          <Mono>{shortId(row.userId)}</Mono>
          {row.emailRedacted ? (
            <span className="text-[11px] text-faint">{row.emailRedacted}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'window',
      header: windowLabel,
      align: 'right',
      width: 'w-32',
      cell: (row) => (
        <div className="flex flex-col items-end">
          <Num>{formatCostMicros(row.costMicros)}</Num>
          <Bar value={row.costMicros} max={maxCost} block />
        </div>
      ),
    },
    {
      key: 'cost24h',
      header: aiMessages.fields.cost24h,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatCostMicros(row.costMicros24h)}</Num>,
    },
    {
      key: 'events30d',
      header: aiMessages.fields.events30d,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.eventCount30d)}</Num>,
    },
    {
      key: 'models',
      header: aiMessages.fields.modelCount,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.modelCount)}</Num>,
    },
    {
      key: 'last',
      header: aiMessages.fields.lastEvent,
      align: 'right',
      cell: (row) => (
        <span title={formatDateTime(row.lastEventAt)}>{formatRelative(row.lastEventAt)}</span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.userId}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={aiMessages.spend.topEmpty}
      caption={aiMessages.spend.topSection}
      emptyAction={
        <Link
          href={AI_CEILING_PATH}
          className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2"
        >
          {aiMessages.spend.topAction}
        </Link>
      }
    />
  )
}
