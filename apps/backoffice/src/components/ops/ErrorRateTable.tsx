import { Badge, type Column, DataTable, Num } from '@/components/ui'
import { formatNumber, formatPercent } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { FunctionErrorRate } from '@/lib/queries/ops'
import { opsMessages } from './messages'

/**
 * Failure share per pipeline surface, in the 24-hour and 7-day windows.
 *
 * The "Ölçüm" column exists because a rate without its denominator is a rumour.
 * Each surface counts something different — sync counts resources that ran,
 * approvals count rows the window touched — and the column says which, in
 * words, next to the number it produced.
 *
 * A rate over an empty denominator renders as an em dash rather than 0%: no
 * traffic is not the same as no failures, and colouring an idle hour green is
 * how a stopped pipeline stays unnoticed until morning.
 */

/** Above this share, an operator should be looking at it now. */
const CRITICAL_RATE = 0.1
const WARNING_RATE = 0.02

function rateTone(failed: number, total: number): 'neutral' | 'success' | 'warning' | 'critical' {
  if (total <= 0) return 'neutral'
  const rate = failed / total
  if (rate >= CRITICAL_RATE) return 'critical'
  if (rate >= WARNING_RATE) return 'warning'
  return failed === 0 ? 'success' : 'neutral'
}

function RateCell({ failed, total }: { failed: number; total: number }) {
  if (total <= 0) {
    return <span className="text-faint">—</span>
  }
  return <Badge tone={rateTone(failed, total)}>{formatPercent(failed, total)}</Badge>
}

const columns: readonly Column<FunctionErrorRate>[] = [
  {
    key: 'fn',
    header: opsMessages.errorRates.fn,
    cell: (row) => (
      <span className="font-mono text-[12px] font-medium text-ink">
        {opsMessages.errorRates.functions[row.key] ?? row.key}
      </span>
    ),
  },
  {
    key: 'measure',
    header: opsMessages.errorRates.measure,
    secondary: true,
    cell: (row) => (
      <span className="text-[11px] text-faint">
        {opsMessages.errorRates.measures[row.key] ?? ''}
      </span>
    ),
  },
  {
    key: 'failed24h',
    header: opsMessages.errorRates.failed24h,
    align: 'right',
    cell: (row) => (
      <span className={row.failed24h > 0 ? 'text-critical-text' : 'text-faint'}>
        <Num>{formatNumber(row.failed24h)}</Num>
      </span>
    ),
  },
  {
    key: 'total24h',
    header: opsMessages.errorRates.total24h,
    align: 'right',
    secondary: true,
    cell: (row) => (
      <span className="text-muted">
        <Num>{formatNumber(row.total24h)}</Num>
      </span>
    ),
  },
  {
    key: 'rate24h',
    header: opsMessages.errorRates.rate24h,
    align: 'right',
    cell: (row) => <RateCell failed={row.failed24h} total={row.total24h} />,
  },
  {
    key: 'failed7d',
    header: opsMessages.errorRates.failed7d,
    align: 'right',
    secondary: true,
    cell: (row) => (
      <span className={row.failed7d > 0 ? 'text-critical-text' : 'text-faint'}>
        <Num>{formatNumber(row.failed7d)}</Num>
      </span>
    ),
  },
  {
    key: 'total7d',
    header: opsMessages.errorRates.total7d,
    align: 'right',
    secondary: true,
    cell: (row) => (
      <span className="text-muted">
        <Num>{formatNumber(row.total7d)}</Num>
      </span>
    ),
  },
  {
    key: 'rate7d',
    header: opsMessages.errorRates.rate7d,
    align: 'right',
    cell: (row) => <RateCell failed={row.failed7d} total={row.total7d} />,
  },
]

export function ErrorRateTable({
  rows,
  error,
}: {
  rows: readonly FunctionErrorRate[]
  error: string | null
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={opsMessages.errorRates.empty}
      rowTone={(row) =>
        rateTone(row.failed24h, row.total24h) === 'critical' ? 'critical' : 'default'
      }
      caption={opsMessages.errorRates.section}
    />
  )
}
