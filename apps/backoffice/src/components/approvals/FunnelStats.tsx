import { Card, CardError, StatGrid, StatTile } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { ApprovalFunnel } from '@/lib/queries/approvals'
import { APPROVALS_FAILURES_PATH } from './contract'
import { formatRate, rejectionRateTone } from './format'
import { approvalMessages } from './messages'

/**
 * The funnel: what the assistant proposed, and what became of it.
 *
 * Eight `count(*)`s over one cohort — everything proposed inside the window —
 * so the tiles can be read against each other rather than as eight unrelated
 * numbers. `approval_status` is a single column with seven mutually exclusive
 * members, which is why "önerilen" is their sum and not a ninth query that could
 * disagree with them.
 *
 * Only two tiles carry a tone. A rejection rate and a failure count are claims
 * about health; a count of approvals that executed successfully is not something
 * to colour, however large it is.
 */

export interface FunnelStatsProps {
  funnel: ApprovalFunnel | null
  error: string | null
  /** How many days the cohort covers, for the tile hints. */
  days: number
  /** Where the failures tile links to, carrying the current filters. */
  failuresHref?: string
}

export function FunnelStats({ funnel, error, days, failuresHref }: FunnelStatsProps) {
  if (error !== null) {
    return (
      <Card title={approvalMessages.funnel.section}>
        <CardError message={error} hint={messages.errors.queryFailedHint} />
      </Card>
    )
  }

  const value = funnel ?? emptyFunnel()
  const accepted = value.approved + value.executing

  return (
    <StatGrid>
      <StatTile
        label={approvalMessages.funnel.proposed}
        value={formatNumber(value.proposed)}
        hint={approvalMessages.overview.cohortNote(days)}
      />
      <StatTile
        label={approvalMessages.funnel.pending}
        value={formatNumber(value.pending)}
        hint={
          value.overdue > 0
            ? approvalMessages.funnel.overdueCount(formatNumber(value.overdue))
            : approvalMessages.funnel.pendingHint
        }
        tone={value.overdue > 0 ? 'warning' : 'neutral'}
      />
      <StatTile
        label={approvalMessages.funnel.approved}
        value={formatNumber(accepted)}
        hint={approvalMessages.funnel.approvedHint}
      />
      <StatTile label={approvalMessages.funnel.rejected} value={formatNumber(value.rejected)} />

      <StatTile
        label={approvalMessages.funnel.rejectionRate}
        value={formatRate(value.rejectionRate)}
        hint={
          value.decided > 0
            ? approvalMessages.funnel.decidedOver(formatNumber(value.decided))
            : approvalMessages.funnel.noDecisions
        }
        tone={rejectionRateTone(value.rejectionRate)}
      />
      <StatTile
        label={approvalMessages.funnel.expired}
        value={formatNumber(value.expired)}
        hint={approvalMessages.funnel.expiredHint}
      />
      <StatTile label={approvalMessages.funnel.executed} value={formatNumber(value.executed)} />
      <StatTile
        label={approvalMessages.funnel.failed}
        value={formatNumber(value.failed)}
        tone={value.failed > 0 ? 'critical' : 'neutral'}
        href={value.failed > 0 ? (failuresHref ?? APPROVALS_FAILURES_PATH) : undefined}
      />
    </StatGrid>
  )
}

/** A cohort with nothing in it still renders eight honest zeroes. */
function emptyFunnel(): ApprovalFunnel {
  return {
    proposed: 0,
    pending: 0,
    overdue: 0,
    approved: 0,
    executing: 0,
    executed: 0,
    failed: 0,
    rejected: 0,
    expired: 0,
    decided: 0,
    rejectionRate: null,
  }
}
