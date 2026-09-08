import { CardError } from '@/components/ui'
import { formatDuration, formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { DurationSummary, SampledDuration } from '@/lib/queries/approvals'
import { approvalMessages } from './messages'

/**
 * How long each leg of an approval's life takes.
 *
 * Two of the three are exact. `bo_approvals` exposes `decision_seconds` and
 * `execution_seconds` as columns, so Postgres can order by them and hand back
 * the single row at the median's rank — no averaging, no sampling, one row over
 * the wire. The third, proposal→rejection, has no column: the view computes a
 * decision duration only for approvals. It is derived here from the two
 * timestamps that are exposed, which means it cannot be ordered in the database,
 * so it says on screen how many rows it actually measured.
 *
 * Saying which is which matters more than hiding the difference. An operator who
 * is told a number is a sample can decide whether to trust it; one who is not
 * told cannot.
 */

export interface TimingPanelProps {
  decision: DurationSummary | null
  execution: DurationSummary | null
  rejection: SampledDuration | null
  error: string | null
}

export function TimingPanel({ decision, execution, rejection, error }: TimingPanelProps) {
  if (error !== null) {
    return <CardError message={error} hint={messages.errors.queryFailedHint} />
  }

  const anyMeasured =
    (decision?.count ?? 0) > 0 || (execution?.count ?? 0) > 0 || (rejection?.total ?? 0) > 0

  if (!anyMeasured) {
    return <p className="py-6 text-center text-muted">{approvalMessages.timing.empty}</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TimingBlock
        label={approvalMessages.timing.decision}
        medianSeconds={decision?.medianSeconds ?? null}
        p90Seconds={decision?.p90Seconds ?? null}
        sampleLabel={
          decision === null
            ? approvalMessages.timing.empty
            : `${formatNumber(decision.count)} · ${approvalMessages.timing.exact}`
        }
      />
      <TimingBlock
        label={approvalMessages.timing.rejection}
        medianSeconds={rejection?.medianSeconds ?? null}
        p90Seconds={rejection?.p90Seconds ?? null}
        sampleLabel={
          rejection === null
            ? approvalMessages.timing.empty
            : rejection.truncated
              ? approvalMessages.timing.sampled(rejection.sampled, rejection.total)
              : `${formatNumber(rejection.total)} · ${approvalMessages.timing.exact}`
        }
        note={rejection?.truncated === true ? approvalMessages.timing.sampledNote : undefined}
      />
      <TimingBlock
        label={approvalMessages.timing.execution}
        medianSeconds={execution?.medianSeconds ?? null}
        p90Seconds={execution?.p90Seconds ?? null}
        sampleLabel={
          execution === null
            ? approvalMessages.timing.empty
            : `${formatNumber(execution.count)} · ${approvalMessages.timing.exact}`
        }
      />
    </div>
  )
}

function TimingBlock({
  label,
  medianSeconds,
  p90Seconds,
  sampleLabel,
  note,
}: {
  label: string
  medianSeconds: number | null
  p90Seconds: number | null
  sampleLabel: string
  note?: string
}) {
  return (
    <div className="rounded-md border border-hairline bg-surface2/40 px-3 py-2.5">
      <span className="bo-kicker">{label}</span>
      <span className="mt-1 block text-[22px] leading-7 font-semibold tabular-nums text-ink">
        {formatDuration(medianSeconds)}
      </span>
      <dl className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px] text-muted">
        <div className="flex items-baseline gap-1">
          <dt className="bo-kicker">{approvalMessages.timing.p90}</dt>
          <dd className="tabular-nums">{formatDuration(p90Seconds)}</dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="bo-kicker">{approvalMessages.timing.sampleSize}</dt>
          <dd className="tabular-nums">{sampleLabel}</dd>
        </div>
      </dl>
      {note ? <p className="mt-1 text-[11px] leading-snug text-faint">{note}</p> : null}
    </div>
  )
}
