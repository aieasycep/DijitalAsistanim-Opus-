import type { ReactNode } from 'react'
import {
  Badge,
  type BadgeTone,
  type Column,
  DataTable,
  Mono,
  Num,
  StatGrid,
  StatTile,
  subscriptionTone,
} from '@/components/ui'
import {
  formatCostMicros,
  formatDateTime,
  formatNumber,
  formatRelative,
  shortId,
} from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import type { CeilingEntry, CeilingSummary } from '@/lib/queries/ai'
import { Bar } from './Bar'
import {
  CAP_CRITICAL_RATIO,
  CAP_WARNING_RATIO,
  DAILY_EVENT_CAP,
  type SpendWindowKey,
} from './contract'
import { formatAverage, formatRatio } from './format'
import { aiMessages } from './messages'
import { QuotaReviewForm } from './QuotaReviewForm'

/**
 * The cost ceiling: who is close to the budget their plan actually enforces.
 *
 * Every cost column is a real pre-summed window from `bo_ai_spend`. The one
 * derived column is the daily average, and its header says what it divides —
 * the enforced cap counts calls in a rolling 24 hours per user and no
 * content-blind view exposes that, so the average is the 30-day call count over
 * the days the account has been calling. It is the honest approximation, and
 * naming it as one is the difference between a useful screen and a misleading
 * one.
 */

function capTone(ratio: number): BadgeTone {
  if (ratio >= CAP_CRITICAL_RATIO) return 'critical'
  if (ratio >= CAP_WARNING_RATIO) return 'warning'
  return 'neutral'
}

export function isNearCap(entry: CeilingEntry): boolean {
  return entry.capRatio >= CAP_WARNING_RATIO
}

export function CeilingTiles({
  summary,
  entries,
  windowLabel,
  thresholdLabel,
}: {
  summary: CeilingSummary
  entries: readonly CeilingEntry[]
  windowLabel: string
  /** The active spend floor, when one is set — the count is filtered by it. */
  thresholdLabel: string | null
}) {
  const nearCap = entries.filter(isNearCap).length

  return (
    <StatGrid>
      <StatTile
        label={aiMessages.ceiling.spendersInWindow}
        value={formatNumber(summary.spendersInWindow)}
        hint={thresholdLabel === null ? windowLabel : `${windowLabel} · ${thresholdLabel}`}
      />
      <StatTile
        label={aiMessages.ceiling.topUserCost}
        value={formatCostMicros(summary.topUserCostMicros)}
        hint={windowLabel}
      />
      <StatTile
        label={aiMessages.ceiling.nearCap}
        value={formatNumber(nearCap)}
        hint={aiMessages.ceiling.nearCapHint}
        tone={nearCap > 0 ? 'warning' : 'neutral'}
      />
      <StatTile
        label={aiMessages.ceiling.platformCost24h}
        value={formatCostMicros(summary.platformCost24hMicros)}
        hint={`${aiMessages.ceiling.platformCost30d}: ${formatCostMicros(summary.platformCost30dMicros)}`}
      />
    </StatGrid>
  )
}

export interface CeilingTableProps {
  entries: readonly CeilingEntry[]
  total: number
  windowKey: SpendWindowKey
  windowLabel: string
  /** Path (with query) the review action returns to. */
  returnTo: string
  reviewAction: (formData: FormData) => void | Promise<void>
  /** The user whose last review attempt failed, so its form reopens. */
  reopenUserId: string | null
  error: string | null
  emptyAction?: ReactNode
}

export function CeilingTable({
  entries,
  total,
  windowKey,
  windowLabel,
  returnTo,
  reviewAction,
  reopenUserId,
  error,
  emptyAction,
}: CeilingTableProps) {
  const maxWindowCost = entries.reduce((max, entry) => Math.max(max, entry.costMicrosWindow), 0)

  const columns: readonly Column<CeilingEntry>[] = [
    {
      key: 'user',
      header: aiMessages.fields.user,
      cell: (entry) => (
        <div className="flex flex-col">
          <Mono>{shortId(entry.userId)}</Mono>
          <span className="text-[11px] text-faint">
            {entry.emailRedacted ?? messages.fields.unknown}
          </span>
        </div>
      ),
    },
    {
      key: 'plan',
      header: aiMessages.fields.plan,
      cell: (entry) => (
        <div className="flex flex-col items-start gap-0.5">
          <Badge tone={subscriptionTone(entry.subscriptionStatus ?? '')}>
            {labelFor(enumLabels.subscriptionStatus, entry.subscriptionStatus)}
          </Badge>
          <span className="text-[11px] text-faint">
            {aiMessages.plans[entry.tier] ?? entry.tier} · {formatNumber(entry.capPerDay)}
          </span>
        </div>
      ),
    },
    {
      key: 'window',
      header: windowLabel,
      align: 'right',
      width: 'w-32',
      cell: (entry) => (
        <div className="flex flex-col items-end">
          <Num>{formatCostMicros(entry.costMicrosWindow)}</Num>
          <Bar value={entry.costMicrosWindow} max={maxWindowCost} block />
        </div>
      ),
    },
    {
      key: 'cost30d',
      header: aiMessages.fields.cost30d,
      align: 'right',
      secondary: true,
      cell: (entry) => <Num>{formatCostMicros(entry.costMicros30d)}</Num>,
    },
    {
      key: 'events',
      header: aiMessages.fields.events30d,
      align: 'right',
      secondary: true,
      cell: (entry) => <Num>{formatNumber(entry.eventCount30d)}</Num>,
    },
    {
      key: 'average',
      header: aiMessages.fields.dailyAverage,
      align: 'right',
      title: aiMessages.fields.dailyAverageTitle,
      cell: (entry) => (
        <div className="flex flex-col items-end">
          <Num>{formatAverage(entry.dailyAverageEvents)}</Num>
          <span className="text-[11px] text-faint">
            {formatNumber(entry.activeDays)} {messages.units.days}
          </span>
        </div>
      ),
    },
    {
      key: 'cap',
      header: aiMessages.fields.capShare,
      align: 'right',
      width: 'w-28',
      title: aiMessages.fields.capShareTitle,
      cell: (entry) => (
        <div className="flex flex-col items-end">
          <Badge tone={capTone(entry.capRatio)}>{formatRatio(entry.capRatio)}</Badge>
          <Bar
            value={entry.dailyAverageEvents}
            max={entry.capPerDay}
            tone={capTone(entry.capRatio) === 'neutral' ? 'primary' : capTone(entry.capRatio)}
            block
          />
        </div>
      ),
    },
    {
      key: 'last',
      header: aiMessages.fields.lastEvent,
      align: 'right',
      secondary: true,
      cell: (entry) => (
        <span title={formatDateTime(entry.lastEventAt)}>{formatRelative(entry.lastEventAt)}</span>
      ),
    },
    {
      key: 'review',
      header: aiMessages.fields.lastReview,
      cell: (entry) =>
        entry.lastReview === null ? (
          <span className="text-[11px] text-faint">{aiMessages.ceiling.reviewNever}</span>
        ) : (
          <div className="flex flex-col" title={entry.lastReview.reason ?? undefined}>
            <span className="text-[12px]">
              {entry.lastReview.decision === null
                ? messages.fields.unknown
                : (aiMessages.ceiling.decisions[entry.lastReview.decision] ??
                  entry.lastReview.decision)}
            </span>
            <span className="text-[11px] text-faint">
              {formatRelative(entry.lastReview.at)}
              {entry.lastReview.staffUserId ? ` · ${shortId(entry.lastReview.staffUserId)}` : ''}
            </span>
          </div>
        ),
    },
    {
      key: 'action',
      header: aiMessages.fields.review,
      align: 'right',
      cell: (entry) => (
        <QuotaReviewForm
          action={reviewAction}
          userId={entry.userId}
          windowKey={windowKey}
          returnTo={returnTo}
          reopen={reopenUserId === entry.userId}
        />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={entries}
      rowKey={(entry) => entry.userId}
      total={total}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={aiMessages.ceiling.tableEmpty}
      emptyAction={emptyAction}
      caption={aiMessages.ceiling.tableSection}
      rowTone={(entry) => {
        const tone = capTone(entry.capRatio)
        return tone === 'critical' ? 'critical' : tone === 'warning' ? 'warning' : 'default'
      }}
    />
  )
}

/** The enforced ceilings, rendered as a sentence under the table. */
export function CapNote() {
  return (
    <p className="text-[12px] leading-snug text-faint">
      {aiMessages.ceiling.capNote(
        formatNumber(DAILY_EVENT_CAP.free),
        formatNumber(DAILY_EVENT_CAP.pro),
      )}{' '}
      {aiMessages.ceiling.referralNote}
    </p>
  )
}
