import { DataTable, Mono, type Column } from '@/components/ui'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { messages } from '@/lib/messages'
import { healthMessages } from '@/lib/messages/health'
import type { ScheduledJobEvidence } from '@/lib/queries/health'
import { SCHEDULED_JOBS, type ScheduledJob } from './contract'

/**
 * The six jobs migration 0014 schedules, and the traces each one leaves.
 *
 * ---------------------------------------------------------------------------
 * THIS TABLE DOES NOT KNOW WHEN A JOB RAN, AND SAYS SO
 * ---------------------------------------------------------------------------
 *
 * pg_cron keeps its schedule in `cron.job` and its history in
 * `cron.job_run_details`, both in the `cron` schema. No `bo_*` view exposes
 * either, and `queryView` accepts only `BoViewName` — so the console genuinely
 * cannot read them, and inventing a "last run" from a guess would be exactly
 * the fake green this page exists to avoid.
 *
 * What it can read is what a job leaves behind, and that is what the "son iz"
 * column holds: the newest sync run, the newest approval the expiry job closed,
 * the newest export the cleanup expired, the most recent day of briefings and
 * notifications. Each is an `ORDER BY … LIMIT 1` or a `count(*)` in Postgres.
 *
 * Two of the six leave nothing any content-blind view records —
 * `da_follow_up_detection` and `da_retention_cleanup` — and their rows say
 * "ölçülemiyor". That is a worse answer than a timestamp and a much better one
 * than a number nobody measured.
 *
 * ---------------------------------------------------------------------------
 * THE WARNING COLUMN IS THE ONE TO READ FIRST
 * ---------------------------------------------------------------------------
 *
 * "No briefing went out" is usually a cron question, and the way it shows up in
 * the data is not a missing timestamp — it is work piling up that a job should
 * have cleared: approvals past their deadline still sitting in `pending`,
 * exports past their window still reading `ready`, sync states the view marks
 * stalled. Those counts are in the last column, and a non-zero one is the
 * evidence that a schedule has stopped.
 */

export interface ScheduledJobTableProps {
  evidence: ScheduledJobEvidence | null
  /** A message from the module's string table, never a raw exception. */
  error: string | null
}

interface JobRow {
  readonly job: ScheduledJob
  /** The newest timestamp the job's effect left, when a view records one. */
  readonly traceAt: string | null
  /** An Istanbul calendar date, for the two daily aggregates. */
  readonly traceDay: string | null
  readonly traceLabel: string
  readonly signals: readonly string[]
  readonly alarming: boolean
  readonly measurable: boolean
}

function rowsFor(evidence: ScheduledJobEvidence | null): readonly JobRow[] {
  return SCHEDULED_JOBS.map((job): JobRow => {
    const base = {
      job,
      traceAt: null,
      traceDay: null,
      traceLabel: healthMessages.evidence[job.evidence],
      signals: [] as readonly string[],
      alarming: false,
      measurable: job.evidence !== 'none',
    }

    if (evidence === null || job.evidence === 'none') return base

    switch (job.evidence) {
      case 'sync':
        return {
          ...base,
          traceAt: evidence.sync.lastRunAt,
          signals:
            evidence.sync.stalled > 0
              ? [healthMessages.signals.stalledSync(evidence.sync.stalled)]
              : [],
          alarming: evidence.sync.stalled > 0,
        }
      case 'briefing':
        return {
          ...base,
          traceDay: evidence.briefing.briefingDate ?? evidence.briefing.notificationDate,
          signals: [
            healthMessages.signals.briefingsToday(
              evidence.briefing.briefingReady,
              evidence.briefing.briefingFailed,
            ),
            healthMessages.signals.notificationsToday(
              evidence.briefing.notificationSent,
              evidence.briefing.notificationFailed,
            ),
          ],
          alarming:
            evidence.briefing.briefingFailed > 0 || evidence.briefing.notificationFailed > 0,
        }
      case 'approval':
        return {
          ...base,
          traceAt: evidence.approval.lastExpiredAt,
          signals:
            evidence.approval.overdue > 0
              ? [healthMessages.signals.overdueApprovals(evidence.approval.overdue)]
              : [],
          alarming: evidence.approval.overdue > 0,
        }
      case 'export':
        return {
          ...base,
          traceAt: evidence.export.lastExpiredAt,
          signals:
            evidence.export.staleReady > 0
              ? [healthMessages.signals.staleExports(evidence.export.staleReady)]
              : [],
          alarming: evidence.export.staleReady > 0,
        }
      default:
        return base
    }
  })
}

function TraceCell({ row }: { row: JobRow }) {
  if (!row.measurable) {
    return (
      <span className="block">
        <span className="block text-[12px] text-faint">{healthMessages.jobs.notMeasurable}</span>
        <span className="mt-0.5 block max-w-56 text-[11px] text-faint">
          {healthMessages.jobs.notMeasurableHint}
        </span>
      </span>
    )
  }

  if (row.traceAt !== null) {
    return (
      <span className="block">
        <span className="block text-[12px] text-ink tabular-nums">
          {formatDateTime(row.traceAt)}
        </span>
        <span className="mt-0.5 block text-[11px] text-faint">
          {formatRelative(row.traceAt)} · {row.traceLabel}
        </span>
      </span>
    )
  }

  if (row.traceDay !== null) {
    return (
      <span className="block">
        <span className="block text-[12px] text-ink tabular-nums">{formatDate(row.traceDay)}</span>
        <span className="mt-0.5 block text-[11px] text-faint">{row.traceLabel}</span>
      </span>
    )
  }

  return <span className="text-[12px] text-faint">{healthMessages.evidence.none}</span>
}

export function ScheduledJobTable({ evidence, error }: ScheduledJobTableProps) {
  const rows = rowsFor(evidence)

  const columns: Column<JobRow>[] = [
    {
      key: 'job',
      header: healthMessages.jobs.columnJob,
      hideable: false,
      cell: (row) => <Mono>{row.job.id}</Mono>,
    },
    {
      key: 'schedule',
      header: healthMessages.jobs.columnSchedule,
      width: 'w-32',
      cell: (row) => <Mono>{row.job.cron}</Mono>,
    },
    {
      key: 'runs',
      header: healthMessages.jobs.columnRuns,
      cell: (row) => (
        <span className="block max-w-64">
          <span className="block text-[12px] text-ink">
            {row.job.edgeFunction === null ? healthMessages.jobs.pureSql : row.job.edgeFunction}
          </span>
          <span className="mt-0.5 block text-[11px] text-faint">
            {row.job.sqlFallback === null
              ? healthMessages.jobs.noFallback
              : healthMessages.jobs.sqlFallback(row.job.sqlFallback)}
          </span>
        </span>
      ),
    },
    {
      key: 'evidence',
      header: healthMessages.jobs.columnEvidence,
      width: 'w-48',
      cell: (row) => <TraceCell row={row} />,
    },
    {
      key: 'signal',
      header: healthMessages.jobs.columnSignal,
      width: 'w-56',
      cell: (row) =>
        row.signals.length === 0 ? (
          // An em dash for a job whose output nothing records, and a plain
          // "nothing pending" for one that was measured and had nothing to
          // report. Those are different answers and must not share a cell.
          row.measurable ? (
            <span className="text-[11px] text-faint">{healthMessages.signals.clear}</span>
          ) : null
        ) : (
          <span className="block">
            {row.signals.map((signal) => (
              <span
                key={signal}
                className={[
                  'block text-[12px] tabular-nums',
                  row.alarming ? 'font-medium text-warning-text' : 'text-muted',
                ].join(' ')}
              >
                {signal}
              </span>
            ))}
          </span>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.job.id}
      caption={healthMessages.jobs.caption}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={healthMessages.jobs.empty}
      total={rows.length}
      rowTone={(row) => (row.alarming ? 'warning' : 'default')}
    />
  )
}
