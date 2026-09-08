import { Badge, DataTable, Mono, Num, type BadgeTone, type Column } from '@/components/ui'
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import type { RetentionTableHealth, SweepRun } from '@/lib/queries/privacy'
import { privacyMessages } from './messages'

/**
 * Retention sweep health.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PAGE CAN AND CANNOT SEE, AND WHY THAT IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * The sweep's own summary — how many rows it deleted from each table — is
 * returned by `cleanup_expired_retention()` to whoever called it and is never
 * written into the audit row's metadata; `bo_audit` exposes metadata key *names*
 * and no values at all. So "how many rows did it remove" is not a question this
 * tool can answer, and inventing a number for it would be worse than saying so.
 *
 * What it can answer is the question that actually matters for compliance: is
 * anything still here that should have been deleted. That is measured directly —
 * a `count(*)` of rows past each table's horizon — and it is a stronger check
 * than a self-reported deletion count, because it looks at the database rather
 * than at the job's opinion of itself.
 *
 * For seven of the twelve swept tables even that is impossible, because there is
 * no `bo_*` view over them. That is not a gap in this page: `email_messages`,
 * `memory_chunks` and `assistant_messages` have no view precisely so that no
 * operator can count, sample or read them. The table says "Ölçülemez" and means
 * "the guarantee is working".
 */

// ---------------------------------------------------------------------------
// The sweep's run history
// ---------------------------------------------------------------------------

export interface SweepRunTableProps {
  runs: readonly SweepRun[]
  error: string | null
}

export function SweepRunTable({ runs, error }: SweepRunTableProps) {
  const columns: readonly Column<SweepRun>[] = [
    {
      key: 'ranAt',
      header: privacyMessages.retention.columnRunAt,
      cell: (row) => (
        <div className="flex flex-col leading-tight">
          <span className="text-ink">{formatDateTime(row.ranAt)}</span>
          <span className="text-[11px] text-faint">{formatRelative(row.ranAt)}</span>
        </div>
      ),
    },
    {
      key: 'gap',
      header: privacyMessages.retention.columnGap,
      cell: (row) =>
        row.gapHours === null ? (
          <span className="text-faint">{privacyMessages.retention.gapFirst}</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <Num>{`${Math.round(row.gapHours)} sa`}</Num>
            {row.late ? <Badge tone="warning">{privacyMessages.retention.gapLate}</Badge> : null}
          </div>
        ),
    },
    {
      key: 'keys',
      header: privacyMessages.retention.columnKeys,
      secondary: true,
      cell: (row) =>
        row.metadataKeys.length === 0 ? null : (
          <span className="font-mono text-[11px] text-muted">{row.metadataKeys.join(', ')}</span>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={runs}
      rowKey={(row) => row.auditId}
      error={error}
      emptyMessage={privacyMessages.retention.runsEmpty}
      rowTone={(row) => (row.late ? 'warning' : 'default')}
      caption={privacyMessages.retention.runsSection}
    />
  )
}

// ---------------------------------------------------------------------------
// The policy, measured
// ---------------------------------------------------------------------------

interface TableState {
  label: string
  tone: BadgeTone
  hint?: string
}

function stateOf(row: RetentionTableHealth): TableState {
  if (row.observer === null || row.arrears === null) {
    return {
      label: privacyMessages.retention.stateBlind,
      tone: 'neutral',
      hint: privacyMessages.retention.blindNote,
    }
  }
  if (row.arrears === 0) {
    return { label: privacyMessages.retention.stateClean, tone: 'success' }
  }
  if (!row.conclusive) {
    return {
      label: privacyMessages.retention.stateInconclusive,
      tone: 'info',
      hint: privacyMessages.retention.stateInconclusiveHint,
    }
  }
  return { label: privacyMessages.retention.stateArrears, tone: 'critical' }
}

export interface RetentionTableProps {
  tables: readonly RetentionTableHealth[]
  error: string | null
}

export function RetentionTable({ tables, error }: RetentionTableProps) {
  const columns: readonly Column<RetentionTableHealth>[] = [
    {
      key: 'table',
      header: privacyMessages.retention.columnTable,
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Mono>{row.table}</Mono>
          {row.anonymises ? (
            <Badge tone="info" title={privacyMessages.retention.anonymisedHint}>
              {privacyMessages.retention.anonymisedTag}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'window',
      header: privacyMessages.retention.columnWindow,
      cell: (row) => (
        <div className="flex flex-col leading-tight">
          <span className="text-ink">
            {row.fixedDays === null
              ? privacyMessages.retention.windowUser
              : privacyMessages.retention.windowFixed(row.fixedDays)}
          </span>
          {row.fixedDays === null ? (
            <span className="text-[11px] text-faint">
              {privacyMessages.retention.windowUserHint}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'basis',
      header: privacyMessages.retention.columnBasis,
      secondary: true,
      cell: (row) => <Mono>{row.column}</Mono>,
    },
    {
      key: 'observer',
      header: privacyMessages.retention.columnObserver,
      cell: (row) =>
        row.observer === null ? (
          <span className="text-faint">{privacyMessages.retention.observerNone}</span>
        ) : (
          <Mono>{row.observer}</Mono>
        ),
    },
    {
      key: 'arrears',
      header: privacyMessages.retention.columnArrears,
      align: 'right',
      cell: (row) =>
        row.arrears === null ? null : (
          <div
            className="flex flex-col items-end leading-tight"
            title={privacyMessages.retention.horizonLabel(row.horizonDays)}
          >
            <Num>{formatNumber(row.arrears)}</Num>
            <span className="text-[11px] text-faint">
              {row.unit === 'dayGroups'
                ? privacyMessages.retention.unitDayGroups
                : privacyMessages.retention.unitRows}
            </span>
          </div>
        ),
    },
    {
      key: 'oldest',
      header: privacyMessages.retention.columnOldest,
      secondary: true,
      cell: (row) => (row.oldestRemaining === null ? null : formatDate(row.oldestRemaining)),
    },
    {
      key: 'state',
      header: privacyMessages.retention.columnState,
      cell: (row) => {
        const state = stateOf(row)
        return (
          <Badge tone={state.tone} title={state.hint}>
            {state.label}
          </Badge>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={tables}
      rowKey={(row) => row.table}
      error={error}
      emptyMessage={privacyMessages.retention.runsEmpty}
      rowTone={(row) => (row.conclusive && (row.arrears ?? 0) > 0 ? 'critical' : 'default')}
      caption={privacyMessages.retention.tablesSection}
    />
  )
}
