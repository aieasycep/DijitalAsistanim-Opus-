import { Badge, DataTable, Num, exportTone, type Column } from '@/components/ui'
import { formatNumber, formatPercent } from '@/lib/format'
import { enumLabels, labelFor } from '@/lib/messages'
import type { StatusCount, StatusBreakdown } from '@/lib/queries/privacy'
import { privacyMessages } from './messages'

/**
 * Where the window's requests ended up, one exact `count(*)` per status.
 *
 * `export_status` has five mutually exclusive members, so these five counts are
 * one cohort and their shares add to 100% — which is why the bar can be read as
 * a proportion rather than as decoration.
 */

export interface StatusBreakdownTableProps {
  breakdown: StatusBreakdown | null
  error: string | null
}

export function StatusBreakdownTable({ breakdown, error }: StatusBreakdownTableProps) {
  const rows = breakdown === null || breakdown.total === 0 ? [] : breakdown.rows

  const columns: readonly Column<StatusCount>[] = [
    {
      key: 'status',
      header: privacyMessages.breakdown.columnStatus,
      cell: (row) => (
        <Badge tone={exportTone(row.status)} dot>
          {labelFor(enumLabels.exportStatus, row.status)}
        </Badge>
      ),
    },
    {
      key: 'count',
      header: privacyMessages.breakdown.columnCount,
      align: 'right',
      width: 'w-20',
      cell: (row) => <Num>{formatNumber(row.count)}</Num>,
    },
    {
      key: 'share',
      header: privacyMessages.breakdown.columnShare,
      cell: (row) => (
        <ShareBar
          share={row.share}
          label={
            breakdown === null || breakdown.total === 0
              ? '—'
              : formatPercent(row.count, breakdown.total)
          }
        />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.status}
      error={error}
      emptyMessage={privacyMessages.breakdown.empty}
      caption={privacyMessages.breakdown.section}
    />
  )
}

/** A proportion of the cohort, drawn to scale and stated in figures beside it. */
function ShareBar({ share, label }: { share: number | null; label: string }) {
  const width = share === null ? 0 : Math.max(share > 0 ? 2 : 0, Math.round(share * 100))
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-surface2"
      >
        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${width}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-muted">{label}</span>
    </div>
  )
}
