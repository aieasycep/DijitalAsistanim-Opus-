import Link from 'next/link'
import { Badge, Card, DataTable, Mono, Num, type Column } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import {
  ACTION_GROUP_ORDER,
  LOG_PARAMS,
  actionGroup,
  isStaffAction,
  type ActorBucket,
  type OutcomeBucket,
} from './contract'
import { actorTone, outcomeTone } from './format'
import { filterHref, type ParamValues } from './href'
import {
  ACTOR_LABEL,
  OUTCOME_LABEL,
  actionGroupLabel,
  actionLabel,
  auditMessages,
} from './messages'
import { ShareBar } from './ShareBar'
import type { ActionBreakdown, ActorBreakdown, OutcomeBreakdown } from '@/lib/queries/audit'

/**
 * The distribution panels.
 *
 * Every number in them is an exact `count(*)` from Postgres over the same range
 * and filters the log is showing; the only arithmetic done here is summing
 * exact counts into their subsystem groups and subtracting to get remainders,
 * which is exact too.
 *
 * Every row that can be turned into a filter is a link to the log with that
 * filter applied, so a spike in the distribution is one click from the rows
 * that caused it. The rows that cannot be — a subsystem group, whose filter
 * would need a prefix match the query layer deliberately does not expose, and
 * the "other actor" remainder, which is defined by exclusion — are rendered as
 * plain text rather than as links that would go somewhere wrong.
 */

// ---------------------------------------------------------------------------
// By action
// ---------------------------------------------------------------------------

interface ActionRow {
  action: string
  count: number
  group: string
}

export interface ActionBreakdownPanelProps {
  breakdown: ActionBreakdown | null
  error?: string | null
  params: ParamValues
  discoveryLimit: number
  countLimit: number
}

export function ActionBreakdownPanel({
  breakdown,
  error = null,
  params,
  discoveryLimit,
  countLimit,
}: ActionBreakdownPanelProps) {
  const rows: ActionRow[] = (breakdown?.rows ?? []).map((row) => ({
    action: row.key,
    count: row.count,
    group: actionGroup(row.key),
  }))
  const total = breakdown?.total ?? 0
  const peak = rows[0]?.count ?? 0

  const columns: readonly Column<ActionRow>[] = [
    {
      key: 'group',
      header: auditMessages.breakdown.groupColumn,
      width: 'w-40',
      secondary: true,
      cell: (row) => <span className="text-[12px] text-muted">{actionGroupLabel(row.group)}</span>,
    },
    {
      key: 'action',
      header: auditMessages.columns.action,
      cell: (row) => (
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-ink">{actionLabel(row.action)}</span>
            {isStaffAction(row.action) ? (
              <Badge tone="primary">{auditMessages.actor.ekip}</Badge>
            ) : null}
          </div>
          <Mono>{row.action}</Mono>
        </div>
      ),
    },
    {
      key: 'count',
      header: auditMessages.columns.count,
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>{formatNumber(row.count)}</Num>,
    },
    {
      key: 'share',
      header: auditMessages.columns.share,
      align: 'right',
      width: 'w-40',
      cell: (row) => (
        <ShareBar
          value={row.count}
          total={total}
          peak={peak}
          label={actionLabel(row.action)}
          tone={isStaffAction(row.action) ? 'primary' : 'neutral'}
        />
      ),
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      width: 'w-28',
      cell: (row) => (
        <Link
          href={filterHref(params, LOG_PARAMS.action, row.action)}
          className="text-[11px] font-medium text-primary-on-soft underline-offset-2 hover:underline"
        >
          {auditMessages.breakdown.openInLog}
        </Link>
      ),
    },
  ]

  return (
    <Card
      title={auditMessages.breakdown.section}
      description={auditMessages.breakdown.discoveryNote(discoveryLimit)}
      flush
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.action}
        error={error}
        errorHint={auditMessages.log.backToLog}
        emptyMessage={auditMessages.log.empty}
        total={rows.length}
      />

      {error === null && breakdown !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-3 py-2 text-[11px] text-faint">
          <span>
            {auditMessages.breakdown.totalRow}: {formatNumber(breakdown.total)} ·{' '}
            {auditMessages.breakdown.othersNote(breakdown.counted)}
            {breakdown.truncated ? ` · ${auditMessages.breakdown.truncated(countLimit)}` : ''}
          </span>
          <span
            className={breakdown.remainder > 0 ? 'font-semibold text-warning-text' : undefined}
            title={auditMessages.breakdown.remainderHint}
          >
            {auditMessages.breakdown.remainder}: {formatNumber(breakdown.remainder)}
          </span>
        </div>
      ) : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// By subsystem
// ---------------------------------------------------------------------------

interface GroupRow {
  group: string
  count: number
}

/** Group totals are sums of exact counts, so they are exact. */
export function groupTotals(breakdown: ActionBreakdown | null): readonly GroupRow[] {
  if (breakdown === null) return []
  const totals = new Map<string, number>()
  for (const row of breakdown.rows) {
    const group = actionGroup(row.key)
    totals.set(group, (totals.get(group) ?? 0) + row.count)
  }
  return [...totals.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((left, right) => {
      const leftRank = ACTION_GROUP_ORDER.indexOf(left.group)
      const rightRank = ACTION_GROUP_ORDER.indexOf(right.group)
      return (
        (leftRank === -1 ? ACTION_GROUP_ORDER.length : leftRank) -
        (rightRank === -1 ? ACTION_GROUP_ORDER.length : rightRank)
      )
    })
}

export function GroupBreakdownPanel({
  rows,
  total,
  error = null,
}: {
  rows: readonly GroupRow[]
  total: number
  error?: string | null
}) {
  const peak = rows.reduce((max, row) => Math.max(max, row.count), 0)

  const columns: readonly Column<GroupRow>[] = [
    {
      key: 'group',
      header: auditMessages.breakdown.groupColumn,
      cell: (row) => <span className="text-[12px] text-ink">{actionGroupLabel(row.group)}</span>,
    },
    {
      key: 'count',
      header: auditMessages.columns.count,
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>{formatNumber(row.count)}</Num>,
    },
    {
      key: 'share',
      header: auditMessages.columns.share,
      align: 'right',
      width: 'w-40',
      cell: (row) => (
        <ShareBar
          value={row.count}
          total={total}
          peak={peak}
          label={actionGroupLabel(row.group)}
          tone="neutral"
        />
      ),
    },
  ]

  return (
    <Card title={auditMessages.breakdown.groupColumn} flush>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.group}
        error={error}
        emptyMessage={auditMessages.log.empty}
        total={rows.length}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// By actor
// ---------------------------------------------------------------------------

interface ActorRow {
  bucket: ActorBucket | 'diger'
  count: number
  linkable: boolean
}

export function ActorBreakdownPanel({
  breakdown,
  error = null,
  params,
}: {
  breakdown: ActorBreakdown | null
  error?: string | null
  params: ParamValues
}) {
  const rows: ActorRow[] = breakdown
    ? [
        ...breakdown.buckets.map((bucket) => ({
          bucket: bucket.key,
          count: bucket.count,
          linkable: true,
        })),
        { bucket: 'diger' as const, count: breakdown.other, linkable: false },
      ]
    : []
  const total = breakdown?.total ?? 0

  const columns: readonly Column<ActorRow>[] = [
    {
      key: 'actor',
      header: auditMessages.actor.filterLabel,
      cell: (row) => <Badge tone={actorTone(row.bucket)}>{ACTOR_LABEL[row.bucket]}</Badge>,
    },
    {
      key: 'count',
      header: auditMessages.columns.count,
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>{formatNumber(row.count)}</Num>,
    },
    {
      key: 'share',
      header: auditMessages.columns.share,
      align: 'right',
      width: 'w-40',
      cell: (row) => (
        <ShareBar
          value={row.count}
          total={total}
          label={ACTOR_LABEL[row.bucket]}
          tone={row.bucket === 'ekip' ? 'primary' : 'neutral'}
        />
      ),
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      width: 'w-28',
      cell: (row) =>
        row.linkable && row.bucket !== 'diger' ? (
          <Link
            href={filterHref(params, LOG_PARAMS.actor, row.bucket)}
            className="text-[11px] font-medium text-primary-on-soft underline-offset-2 hover:underline"
          >
            {auditMessages.breakdown.openInLog}
          </Link>
        ) : null,
    },
  ]

  return (
    <Card
      title={auditMessages.breakdown.actorSection}
      description={auditMessages.actor.unmarkedNote}
      flush
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.bucket}
        error={error}
        emptyMessage={auditMessages.log.empty}
        total={rows.length}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// By outcome
// ---------------------------------------------------------------------------

interface OutcomeRow {
  bucket: OutcomeBucket
  count: number
}

export function OutcomeBreakdownPanel({
  breakdown,
  error = null,
  params,
}: {
  breakdown: OutcomeBreakdown | null
  error?: string | null
  params: ParamValues
}) {
  const rows: OutcomeRow[] = (breakdown?.buckets ?? []).map((bucket) => ({
    bucket: bucket.key,
    count: bucket.count,
  }))
  const total = breakdown?.total ?? 0

  const columns: readonly Column<OutcomeRow>[] = [
    {
      key: 'outcome',
      header: auditMessages.outcome.filterLabel,
      cell: (row) => <Badge tone={outcomeTone(row.bucket)}>{OUTCOME_LABEL[row.bucket]}</Badge>,
    },
    {
      key: 'count',
      header: auditMessages.columns.count,
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>{formatNumber(row.count)}</Num>,
    },
    {
      key: 'share',
      header: auditMessages.columns.share,
      align: 'right',
      width: 'w-40',
      cell: (row) => (
        <ShareBar
          value={row.count}
          total={total}
          label={OUTCOME_LABEL[row.bucket]}
          tone={row.bucket === 'hata' ? 'critical' : 'neutral'}
        />
      ),
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      width: 'w-28',
      cell: (row) => (
        <Link
          href={filterHref(params, LOG_PARAMS.outcome, row.bucket)}
          className="text-[11px] font-medium text-primary-on-soft underline-offset-2 hover:underline"
        >
          {auditMessages.breakdown.openInLog}
        </Link>
      ),
    },
  ]

  return (
    <Card
      title={auditMessages.breakdown.outcomeSection}
      description={auditMessages.outcome.note}
      flush
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.bucket}
        error={error}
        emptyMessage={auditMessages.log.empty}
        total={rows.length}
      />
    </Card>
  )
}
