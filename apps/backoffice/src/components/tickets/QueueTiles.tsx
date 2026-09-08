import { Badge, StatGrid, StatTile } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import { ticketMessages } from '@/lib/messages/tickets'
import type { FirstResponseSummary, QueueStats } from '@/lib/queries/tickets'
import {
  ASSIGNEE_UNASSIGNED,
  DUE_FILTER_OVERDUE,
  STATUS_FILTER_ACTIVE,
  SUPPORT_PATH,
  TICKET_PARAMS,
} from './contract'
import { formatMinutes } from './presentation'

/**
 * The four numbers a shift starts from.
 *
 * Three are exact `count(*)`s over the whole queue; the fourth is a median
 * measured over a bounded sample and it says so underneath, because a summary
 * statistic that hides how it was computed is a summary statistic somebody will
 * quote in a review.
 *
 * The first three tiles link to the list filtered to exactly what they counted,
 * so the number and the rows behind it can never disagree — clicking "12
 * gecikmiş" produces twelve rows or the tile was wrong.
 *
 * Every tile renders in all four states. A failed count shows an em dash and
 * the panel above it carries the error; it never shows a zero, because zero is
 * the single most dangerous wrong answer an operations tile can give.
 */

function href(params: Readonly<Record<string, string>>): string {
  const query = new URLSearchParams(params)
  return `${SUPPORT_PATH}?${query.toString()}`
}

const OPEN_HREF = href({ [TICKET_PARAMS.status]: 'open' })
const UNASSIGNED_HREF = href({
  [TICKET_PARAMS.status]: STATUS_FILTER_ACTIVE,
  [TICKET_PARAMS.assignee]: ASSIGNEE_UNASSIGNED,
})
const OVERDUE_HREF = href({
  [TICKET_PARAMS.status]: STATUS_FILTER_ACTIVE,
  [TICKET_PARAMS.due]: DUE_FILTER_OVERDUE,
})

export interface QueueTilesProps {
  stats: QueueStats | null
  statsError: string | null
  firstResponse: FirstResponseSummary | null
  firstResponseError: string | null
}

export function QueueTiles({
  stats,
  statsError,
  firstResponse,
  firstResponseError,
}: QueueTilesProps) {
  const failed = statsError !== null
  const value = (count: number | undefined): string =>
    failed || count === undefined ? '—' : formatNumber(count)

  return (
    <section aria-label={ticketMessages.queue.title}>
      <StatGrid>
        <StatTile
          label={ticketMessages.tiles.open}
          value={value(stats?.open)}
          hint={failed ? statsError : ticketMessages.tiles.openHint}
          tone={failed ? 'neutral' : (stats?.open ?? 0) > 0 ? 'warning' : 'success'}
          {...(failed ? {} : { href: OPEN_HREF })}
        />
        <StatTile
          label={ticketMessages.tiles.unassigned}
          value={value(stats?.unassigned)}
          hint={failed ? statsError : ticketMessages.tiles.unassignedHint}
          tone={failed ? 'neutral' : (stats?.unassigned ?? 0) > 0 ? 'warning' : 'success'}
          {...(failed ? {} : { href: UNASSIGNED_HREF })}
        />
        <StatTile
          label={ticketMessages.tiles.overdue}
          value={value(stats?.overdue)}
          hint={failed ? statsError : ticketMessages.tiles.overdueHint}
          tone={failed ? 'neutral' : (stats?.overdue ?? 0) > 0 ? 'critical' : 'success'}
          {...(failed ? {} : { href: OVERDUE_HREF })}
        />
        <FirstResponseTile summary={firstResponse} error={firstResponseError} />
      </StatGrid>

      <p className="mt-1.5 text-[11px] text-faint">{ticketMessages.tiles.scopeNote}</p>
    </section>
  )
}

function FirstResponseTile({
  summary,
  error,
}: {
  summary: FirstResponseSummary | null
  error: string | null
}) {
  if (error !== null || summary === null) {
    return (
      <StatTile
        label={ticketMessages.tiles.firstResponse}
        value="—"
        hint={error ?? messages.errors.queryFailed}
      />
    )
  }

  const hint =
    summary.total === 0
      ? ticketMessages.tiles.firstResponseEmpty(summary.windowDays)
      : ticketMessages.tiles.firstResponseHint(summary.windowDays, summary.sampled, summary.total)

  return (
    <div className="bo-panel px-3 py-2.5">
      <span className="bo-kicker">{ticketMessages.tiles.firstResponse}</span>
      <span className="mt-1 block text-[24px] leading-7 font-semibold tabular-nums text-ink">
        {formatMinutes(summary.medianMinutes)}
      </span>
      <span className="mt-0.5 block text-[12px] text-faint">{hint}</span>
      {summary.p90Minutes === null ? null : (
        <span className="mt-1 inline-block">
          <Badge tone="neutral">
            {ticketMessages.tiles.p90(formatMinutes(summary.p90Minutes))}
          </Badge>
        </span>
      )}
    </div>
  )
}
