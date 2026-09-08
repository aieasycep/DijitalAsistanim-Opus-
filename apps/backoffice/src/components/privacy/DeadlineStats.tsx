import { StatGrid } from '@/components/ui'
import { formatCompact, formatDuration, formatNumber, formatRelative } from '@/lib/format'
import type {
  DeadlineCounters,
  DeletionCounters,
  FulfilmentSummary,
  StatusBreakdown,
  SweepHealth,
} from '@/lib/queries/privacy'
import { DUE_SOON_DAYS, STATUTORY_DAYS, STUCK_HOURS } from './contract'
import { privacyMessages } from './messages'
import { StatCell as Tile } from './StatCell'

/**
 * The eight numbers an operator needs before they read anything else.
 *
 * Each tile comes from a different settled query, so a group that failed shows
 * an error in its own tiles and the other six still carry their numbers — a
 * dashboard that blanks because one view is missing is a dashboard nobody trusts
 * during an incident.
 *
 * A tile is coloured only when the number is not where it should be. `Açık
 * talep` is a fact and stays neutral however large it is; `Süre aşımı` is a
 * breach and is critical the moment it is not zero.
 */

export interface DeadlineStatsProps {
  counters: DeadlineCounters | null
  countersError: string | null
  breakdown: StatusBreakdown | null
  breakdownError: string | null
  fulfilment: FulfilmentSummary | null
  fulfilmentError: string | null
  deletion: DeletionCounters | null
  deletionError: string | null
  sweep: SweepHealth | null
  sweepError: string | null
  windowDays: number
  /** Queue address for a status filter. */
  statusHref: (status: string) => string
  /** Queue address for a deadline bucket. */
  deadlineHref: (bucket: string) => string
  queueHref: string
  retentionHref: string
}

export function DeadlineStats({
  counters,
  countersError,
  breakdown,
  breakdownError,
  fulfilment,
  fulfilmentError,
  deletion,
  deletionError,
  sweep,
  sweepError,
  windowDays,
  statusHref,
  deadlineHref,
  queueHref,
  retentionHref,
}: DeadlineStatsProps) {
  return (
    <StatGrid>
      <Tile
        label={privacyMessages.stats.open}
        hint={privacyMessages.stats.openHint}
        error={countersError}
        value={counters === null ? null : formatCompact(counters.open)}
        href={queueHref}
      />
      <Tile
        label={privacyMessages.stats.overdue}
        hint={privacyMessages.stats.overdueHint(STATUTORY_DAYS)}
        error={countersError}
        value={counters === null ? null : formatCompact(counters.overdue)}
        tone={counters !== null && counters.overdue > 0 ? 'critical' : 'neutral'}
        href={deadlineHref('gecikmis')}
      />
      <Tile
        label={privacyMessages.stats.dueSoon}
        hint={privacyMessages.stats.dueSoonHint(DUE_SOON_DAYS)}
        error={countersError}
        value={counters === null ? null : formatCompact(counters.dueSoon)}
        tone={counters !== null && counters.dueSoon > 0 ? 'warning' : 'neutral'}
        href={deadlineHref('yaklasan')}
      />
      <Tile
        label={privacyMessages.stats.stuck}
        hint={privacyMessages.stats.stuckHint(STUCK_HOURS)}
        error={countersError}
        value={counters === null ? null : formatCompact(counters.stuck)}
        tone={counters !== null && counters.stuck > 0 ? 'critical' : 'neutral'}
      />

      <Tile
        label={privacyMessages.stats.failed}
        hint={privacyMessages.stats.failedHint(windowDays)}
        error={breakdownError}
        value={breakdown === null ? null : formatCompact(breakdown.failed)}
        tone={breakdown !== null && breakdown.failed > 0 ? 'critical' : 'neutral'}
        href={statusHref('failed')}
      />
      <Tile
        label={privacyMessages.stats.fulfilment}
        hint={
          fulfilment === null
            ? undefined
            : privacyMessages.stats.fulfilmentHint(fulfilment.completed)
        }
        error={fulfilmentError}
        value={
          fulfilment === null
            ? null
            : fulfilment.medianMinutes === null
              ? '—'
              : formatDuration(fulfilment.medianMinutes * 60)
        }
      />
      <Tile
        label={privacyMessages.stats.deletion}
        hint={privacyMessages.stats.deletionHint(windowDays)}
        error={deletionError}
        value={deletion === null ? null : formatNumber(deletion.accountInWindow)}
      />
      <Tile
        label={privacyMessages.stats.lastSweep}
        hint={privacyMessages.stats.lastSweepHint}
        error={sweepError}
        value={
          sweep === null
            ? null
            : sweep.lastRunAt === null
              ? privacyMessages.stats.noSweep
              : formatRelative(sweep.lastRunAt)
        }
        tone={sweep !== null && sweep.late ? 'warning' : 'neutral'}
        href={retentionHref}
      />
    </StatGrid>
  )
}
