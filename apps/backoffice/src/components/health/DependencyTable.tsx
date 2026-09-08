import { Badge, DataTable, Mono, Num, type Column } from '@/components/ui'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { messages } from '@/lib/messages'
import {
  EXTERNAL_TARGET_NOTE,
  healthMessages,
  healthStatusHints,
  healthTargetLabels,
  probeDescriptions,
  probeKindLabels,
} from '@/lib/messages/health'
import type { DependencyStatus } from '@/lib/queries/health'
import { CheckForm } from './CheckForm'
import { HistoryStrip } from './HistoryStrip'
import { isHealthTarget } from './contract'
import { healthLabel, healthTone, observerLabel } from './presentation'

/**
 * Every dependency, with the measurement it is claiming and the window that
 * measurement came out of.
 *
 * ---------------------------------------------------------------------------
 * THE ROWS WITH NO MEASUREMENT ARE THE POINT
 * ---------------------------------------------------------------------------
 *
 * A target the console knows about but that nothing has ever checked still gets
 * a row, and that row says "hiç ölçülmedi". The alternative — showing only what
 * `bo_system_health` has rows for — would mean a probe that was never deployed
 * simply vanishes from the page, and a dependency nobody is watching looks
 * exactly like a dependency with nothing wrong.
 *
 * A stale row is treated the same way. `bo_system_health.is_stale` is true when
 * the last measurement is more than fifteen minutes old, and `effective` has
 * already collapsed that to `unmeasured` upstream, so the status column reads
 * "bilinmiyor" and the row says how long ago the last reading was. The last
 * green answer of a dead probe is never rendered as the current state.
 *
 * ---------------------------------------------------------------------------
 * EVERY ROW SAYS WHAT WAS MEASURED
 * ---------------------------------------------------------------------------
 *
 * Under each name is the probe's own description and its declared threshold.
 * "Sağlıklı" on the Google row means the console's server reached Google's
 * OAuth endpoint inside 1500 ms — a real signal, and not the same claim as
 * "mailbox sync is working". The sentence is on the row so nobody has to
 * remember the difference at two in the morning.
 */

export interface DependencyTableProps {
  rows: readonly DependencyStatus[]
  /** A message from the module's string table, never a raw exception. */
  error: string | null
  action: (formData: FormData) => void | Promise<void>
  returnTo: string
  /**
   * The session's CSRF field, or null when this operator may not start a
   * measurement — in which case no per-row control is rendered at all, rather
   * than a disabled one that would still be a dead affordance.
   */
  csrf: { name: string; value: string } | null
}

function TargetCell({ status }: { status: DependencyStatus }) {
  const target = status.target
  const known = isHealthTarget(target)
  return (
    <span className="block min-w-48">
      <span className="block text-[13px] font-medium text-ink">
        {known ? healthTargetLabels[target] : target}
      </span>
      <span className="mt-0.5 block text-[11px] text-faint">
        {known ? probeDescriptions[target] : EXTERNAL_TARGET_NOTE}
      </span>
      {status.spec === null ? null : (
        <span className="mt-0.5 block text-[11px] text-faint">
          {probeKindLabels[status.spec.probe]} ·{' '}
          {healthMessages.table.thresholdNote(status.spec.degradedMs)}
        </span>
      )}
    </span>
  )
}

function StatusCell({ status }: { status: DependencyStatus }) {
  const hint =
    status.effective === 'unmeasured'
      ? status.measurement === null
        ? healthMessages.table.neverChecked
        : healthMessages.table.staleNote(status.measurement.minutes_since_check)
      : healthStatusHints[status.effective]

  return (
    <span className="block">
      <Badge tone={healthTone[status.effective]} dot>
        {healthLabel(status.effective)}
      </Badge>
      <span className="mt-1 block max-w-56 text-[11px] text-faint">{hint}</span>
    </span>
  )
}

export function DependencyTable({ rows, error, action, returnTo, csrf }: DependencyTableProps) {
  const columns: Column<DependencyStatus>[] = [
    {
      key: 'target',
      header: healthMessages.table.columnTarget,
      hideable: false,
      cell: (status) => <TargetCell status={status} />,
    },
    {
      key: 'status',
      header: healthMessages.table.columnStatus,
      width: 'w-44',
      hideable: false,
      cell: (status) => <StatusCell status={status} />,
    },
    {
      key: 'latency',
      header: healthMessages.table.columnLatency,
      align: 'right',
      width: 'w-24',
      cell: (status) => {
        const latency = status.measurement?.latency_ms ?? null
        // Null is the honest answer for a target recorded as `unknown`: the
        // schema allows a verdict with no measurement only in that one case,
        // and the cell renders an em dash rather than a zero.
        return latency === null ? null : (
          <Num>
            {formatNumber(latency)} {healthMessages.table.latencyUnit}
          </Num>
        )
      },
    },
    {
      key: 'checked',
      header: healthMessages.table.columnChecked,
      width: 'w-44',
      cell: (status) =>
        status.measurement === null ? (
          <span className="text-[12px] text-faint">{healthMessages.table.neverChecked}</span>
        ) : (
          <span className="block">
            <span className="block text-[12px] text-ink tabular-nums">
              {formatDateTime(status.measurement.checked_at)}
            </span>
            <span className="mt-0.5 block text-[11px] text-faint">
              {formatRelative(status.measurement.checked_at)}
            </span>
          </span>
        ),
    },
    {
      key: 'observer',
      header: healthMessages.table.columnObserver,
      width: 'w-28',
      secondary: true,
      cell: (status) =>
        status.measurement === null ? null : observerLabel(status.measurement.observed_by),
    },
    {
      key: 'error',
      header: healthMessages.table.columnError,
      width: 'w-40',
      cell: (status) => {
        const code = status.measurement?.error_code ?? null
        return code === null ? null : <Mono>{code}</Mono>
      },
    },
    {
      key: 'window',
      header: healthMessages.table.columnWindow,
      title: healthMessages.window.label,
      width: 'w-56',
      secondary: true,
      cell: (status) => <HistoryStrip row={status.measurement} />,
    },
  ]

  // The action column exists only when there is an action. A control that would
  // be refused is not rendered disabled here — it is not rendered at all, and
  // the Server Action refuses it anyway if somebody posts the form by hand.
  if (csrf !== null) {
    columns.push({
      key: 'action',
      header: healthMessages.table.columnAction,
      align: 'right',
      width: 'w-28',
      hideable: false,
      cell: (status) =>
        status.declared ? (
          <CheckForm
            action={action}
            target={status.target}
            returnTo={returnTo}
            csrf={csrf}
            label={healthMessages.check.one}
            pendingLabel={healthMessages.check.onePending}
            variant="quiet"
          />
        ) : null,
    })
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(status) => status.target}
      caption={healthMessages.table.caption}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={healthMessages.table.empty}
      emptyHint={healthMessages.table.emptyHint}
      total={rows.length}
      rowTone={(status) =>
        status.effective === 'down'
          ? 'critical'
          : status.effective === 'degraded'
            ? 'warning'
            : 'default'
      }
    />
  )
}
