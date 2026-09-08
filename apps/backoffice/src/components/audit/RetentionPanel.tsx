import { systemClock, type Clock } from '@da/domain'
import { Badge, Card, CardError } from '@/components/ui'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { SWEEP_HOUR_UTC, SWEEP_MINUTE_UTC } from './contract'
import { auditMessages } from './messages'
import type { RetentionStatus } from '@/lib/queries/audit'

/**
 * The retention rule, and whether it is actually being applied.
 *
 * A privacy page that states a policy is a page that states a policy. This one
 * measures it: the cutoff is computed from the same `RETENTION_SWEEP` entry
 * `cleanup_expired_retention()` implements, the counts either side of it come
 * from Postgres, and the backlog — rows past the cutoff that still carry
 * metadata — is what says whether last night's job ran. A regulator asking
 * "how do you know?" gets a number rather than a paragraph.
 *
 * The two lists underneath are the substantive claim of this whole console,
 * printed where it is being made: what an audit row keeps, and what one can
 * never contain because the view has no column for it.
 */

export interface RetentionPanelProps {
  status: RetentionStatus | null
  error?: string | null
  clock?: Clock
}

function utcTimeLabel(): string {
  return `${String(SWEEP_HOUR_UTC).padStart(2, '0')}:${String(SWEEP_MINUTE_UTC).padStart(2, '0')}`
}

/**
 * The sweep's UTC schedule expressed on Istanbul's clock.
 *
 * Istanbul has been at a fixed +03:00 since 2016 with no DST, so this is a
 * constant offset rather than a conversion that needs an instant to resolve.
 */
const ISTANBUL_OFFSET_HOURS = 3

function localTimeLabel(): string {
  const hour = (SWEEP_HOUR_UTC + ISTANBUL_OFFSET_HOURS) % 24
  return `${String(hour).padStart(2, '0')}:${String(SWEEP_MINUTE_UTC).padStart(2, '0')}`
}

export function RetentionPanel({ status, error = null, clock = systemClock }: RetentionPanelProps) {
  if (error !== null || status === null) {
    return (
      <Card title={auditMessages.retention.title}>
        <CardError
          message={error ?? auditMessages.retention.sweepNever}
          hint={auditMessages.retention.sweepNeverHint}
        />
      </Card>
    )
  }

  const behind = status.pendingCount > 0

  return (
    <Card
      title={auditMessages.retention.title}
      description={auditMessages.retention.description(status.days)}
      action={
        <Badge tone={behind ? 'critical' : 'success'} dot>
          {behind ? auditMessages.retention.pendingBehind : auditMessages.retention.pendingHealthy}
        </Badge>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-4">
          <Figure
            label={auditMessages.retention.cutoff}
            value={formatDateTime(status.cutoff)}
            hint={formatRelative(status.cutoff, clock)}
          />
          <Figure
            label={auditMessages.retention.oldest}
            value={status.oldestAt === null ? '—' : formatDateTime(status.oldestAt)}
            hint={status.oldestAt === null ? undefined : formatRelative(status.oldestAt, clock)}
          />
          <Figure
            label={auditMessages.retention.overdue}
            value={formatNumber(status.overdueTotal)}
            hint={`${auditMessages.retention.anonymised}: ${formatNumber(status.strippedCount)}`}
          />
          <Figure
            label={auditMessages.retention.pending}
            value={formatNumber(status.pendingCount)}
            tone={behind ? 'critical' : 'neutral'}
          />
        </dl>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-4">
          <Figure
            label={auditMessages.retention.lastSweep}
            value={
              status.lastSweepAt === null
                ? auditMessages.retention.sweepNever
                : formatDateTime(status.lastSweepAt)
            }
            hint={
              status.lastSweepAt === null
                ? auditMessages.retention.sweepNeverHint
                : formatRelative(status.lastSweepAt, clock)
            }
            tone={status.lastSweepAt === null ? 'critical' : 'neutral'}
          />
          <Figure
            label={auditMessages.retention.nextSweep}
            value={formatDateTime(status.nextSweepAt)}
            hint={formatRelative(status.nextSweepAt, clock)}
          />
          <div className="col-span-2 text-[12px] text-muted">
            <p>{auditMessages.retention.columnsNote(status.anonymisedColumns.join(', '))}</p>
            <p>{auditMessages.retention.scheduleNote(utcTimeLabel(), localTimeLabel())}</p>
          </div>
        </dl>

        <div className="grid gap-3 rounded-md bg-surface2/60 p-3 lg:grid-cols-2">
          <div>
            <h3 className="bo-kicker mb-1">{auditMessages.retention.whatIsKept}</h3>
            <p className="text-[12px] text-muted">{auditMessages.retention.whatIsKeptBody}</p>
          </div>
          <div>
            <h3 className="bo-kicker mb-1">{auditMessages.retention.whatIsNever}</h3>
            <p className="text-[12px] text-muted">{auditMessages.retention.whatIsNeverBody}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Figure({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'critical'
}) {
  return (
    <div className="min-w-0">
      <dt className="bo-kicker">{label}</dt>
      <dd
        className={[
          'mt-0.5 text-[15px] font-semibold tabular-nums',
          tone === 'critical' ? 'text-critical-text' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </dd>
      {hint ? <dd className="text-[11px] text-faint">{hint}</dd> : null}
    </div>
  )
}
