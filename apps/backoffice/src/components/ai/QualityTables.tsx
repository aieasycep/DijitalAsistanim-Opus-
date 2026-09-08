import { Badge, type Column, DataTable, Num, StatGrid, StatTile } from '@/components/ui'
import { formatDate, formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type {
  BriefingQuality,
  BriefingQualityDay,
  BriefingQualityRow,
  CaptureQualityRow,
  DraftQualityRow,
  DraftTrendDay,
  Settled,
} from '@/lib/queries/ai'
import { Bar } from './Bar'
import {
  OPEN_RATE_CRITICAL_RATIO,
  OPEN_RATE_WARNING_RATIO,
  REJECTION_CRITICAL_RATIO,
  REJECTION_WARNING_RATIO,
} from './contract'
import { formatRatio, formatSeconds, ratioOf } from './format'
import { aiMessages } from './messages'

/**
 * The quality page's tables.
 *
 * Everything here is a user's verdict on model output, expressed as something
 * they did rather than something they typed: a draft they refused to send, a
 * briefing they never opened, a capture the model could not turn into an
 * intent. None of it requires reading what the model wrote — the tables count
 * states and never touch a payload, a narrative or a note.
 */

/** Of the drafts a user actually decided on, how many they turned down. */
function rejectionRate(row: DraftQualityRow): number | null {
  return ratioOf(row.rejected, row.rejected + row.executed + row.failed)
}

function rejectionTone(rate: number | null): 'neutral' | 'warning' | 'critical' {
  if (rate === null) return 'neutral'
  if (rate >= REJECTION_CRITICAL_RATIO) return 'critical'
  if (rate >= REJECTION_WARNING_RATIO) return 'warning'
  return 'neutral'
}

function openRateTone(rate: number | null): 'neutral' | 'warning' | 'critical' | 'success' {
  if (rate === null) return 'neutral'
  if (rate <= OPEN_RATE_CRITICAL_RATIO) return 'critical'
  if (rate <= OPEN_RATE_WARNING_RATIO) return 'warning'
  return 'success'
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function QualityTiles({
  drafts,
  briefings,
  captures,
}: {
  drafts: Settled<readonly DraftQualityRow[]>
  briefings: Settled<BriefingQuality>
  captures: Settled<readonly CaptureQualityRow[]>
}) {
  const draftTotals = drafts.ok
    ? drafts.value.reduce(
        (sum, row) => ({
          total: sum.total + row.total,
          rejected: sum.rejected + row.rejected,
          executed: sum.executed + row.executed,
          failed: sum.failed + row.failed,
          expired: sum.expired + row.expired,
        }),
        { total: 0, rejected: 0, executed: 0, failed: 0, expired: 0 },
      )
    : null

  const decided =
    draftTotals === null ? 0 : draftTotals.rejected + draftTotals.executed + draftTotals.failed
  const rejection = draftTotals === null ? null : ratioOf(draftTotals.rejected, decided)
  const ignored = draftTotals === null ? null : ratioOf(draftTotals.expired, draftTotals.total)

  const briefingTotals = briefings.ok
    ? briefings.value.byKind.reduce(
        (sum, row) => ({ ready: sum.ready + row.ready, opened: sum.opened + row.opened }),
        { ready: 0, opened: 0 },
      )
    : null
  const openRate =
    briefingTotals === null ? null : ratioOf(briefingTotals.opened, briefingTotals.ready)

  const captureTotals = captures.ok
    ? captures.value.reduce(
        (sum, row) => ({
          ready: sum.ready + row.ready,
          classified: sum.classified + row.classified,
        }),
        { ready: 0, classified: 0 },
      )
    : null
  const classifyRate =
    captureTotals === null ? null : ratioOf(captureTotals.classified, captureTotals.ready)

  return (
    <StatGrid>
      <StatTile
        label={aiMessages.quality.rejectionRate}
        value={drafts.ok ? formatRatio(rejection) : '—'}
        hint={
          drafts.ok
            ? `${aiMessages.quality.rejectionHint} · ${formatNumber(decided)}`
            : drafts.message
        }
        tone={rejectionTone(rejection)}
      />
      <StatTile
        label={aiMessages.quality.ignoreRate}
        value={drafts.ok ? formatRatio(ignored) : '—'}
        hint={
          drafts.ok
            ? `${aiMessages.quality.ignoreHint} · ${formatNumber(draftTotals?.total ?? 0)}`
            : drafts.message
        }
        tone={ignored !== null && ignored >= REJECTION_WARNING_RATIO ? 'warning' : 'neutral'}
      />
      <StatTile
        label={aiMessages.quality.briefingOpenRate}
        value={briefings.ok ? formatRatio(openRate) : '—'}
        hint={
          briefings.ok
            ? `${aiMessages.quality.briefingOpenHint} · ${formatNumber(briefingTotals?.ready ?? 0)}`
            : briefings.message
        }
        tone={openRateTone(openRate)}
      />
      <StatTile
        label={aiMessages.quality.captureClassifiedRate}
        value={captures.ok ? formatRatio(classifyRate) : '—'}
        hint={
          captures.ok
            ? `${aiMessages.quality.captureClassifiedHint} · ${formatNumber(captureTotals?.ready ?? 0)}`
            : captures.message
        }
        tone={openRateTone(classifyRate)}
      />
    </StatGrid>
  )
}

// ---------------------------------------------------------------------------
// Drafts by surface
// ---------------------------------------------------------------------------

export function DraftQualityTable({
  rows,
  error,
}: {
  rows: readonly DraftQualityRow[]
  error: string | null
}) {
  const columns: readonly Column<DraftQualityRow>[] = [
    {
      key: 'type',
      header: aiMessages.fields.type,
      cell: (row) => aiMessages.approvalTypes[row.type] ?? row.type,
    },
    {
      key: 'total',
      header: aiMessages.fields.total,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.total)}</Num>,
    },
    {
      key: 'executed',
      header: aiMessages.fields.executed,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.executed)}</Num>,
    },
    {
      key: 'rejected',
      header: aiMessages.fields.rejected,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.rejected)}</Num>,
    },
    {
      key: 'failed',
      header: aiMessages.fields.failed,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.failed)}</Num>,
    },
    {
      key: 'expired',
      header: aiMessages.fields.expiredApproval,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.expired)}</Num>,
    },
    {
      key: 'open',
      header: aiMessages.fields.open,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.open)}</Num>,
    },
    {
      key: 'rate',
      header: aiMessages.fields.rejectionRate,
      align: 'right',
      width: 'w-28',
      title: aiMessages.quality.rejectionHint,
      cell: (row) => {
        const rate = rejectionRate(row)
        return (
          <div className="flex flex-col items-end">
            <Badge tone={rejectionTone(rate)}>{formatRatio(rate)}</Badge>
            <Bar
              value={row.rejected}
              max={Math.max(1, row.rejected + row.executed + row.failed)}
              tone={rejectionTone(rate) === 'neutral' ? 'primary' : rejectionTone(rate)}
              block
            />
          </div>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.type}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={aiMessages.quality.draftEmpty}
      caption={aiMessages.quality.draftSection}
      rowTone={(row) => {
        const tone = rejectionTone(rejectionRate(row))
        return tone === 'neutral' ? 'default' : tone
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Daily rejection trend
// ---------------------------------------------------------------------------

export function DraftTrendTable({
  rows,
  error,
}: {
  rows: readonly DraftTrendDay[]
  error: string | null
}) {
  const maxCreated = rows.reduce((max, row) => Math.max(max, row.created), 0)

  const columns: readonly Column<DraftTrendDay>[] = [
    {
      key: 'day',
      header: aiMessages.fields.day,
      width: 'w-28',
      cell: (row) => formatDate(row.day),
    },
    {
      key: 'created',
      header: aiMessages.fields.created,
      align: 'right',
      cell: (row) => (
        <div className="flex flex-col items-end">
          <Num>{formatNumber(row.created)}</Num>
          <Bar value={row.created} max={maxCreated} block />
        </div>
      ),
    },
    {
      key: 'rejected',
      header: aiMessages.fields.rejected,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.rejected)}</Num>,
    },
    {
      key: 'rate',
      header: aiMessages.fields.rejectionRate,
      align: 'right',
      width: 'w-24',
      cell: (row) => {
        const rate = ratioOf(row.rejected, row.created)
        return <Badge tone={rejectionTone(rate)}>{formatRatio(rate)}</Badge>
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.day}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={aiMessages.quality.trendEmpty}
      caption={aiMessages.quality.trendSection}
    />
  )
}

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

export function BriefingQualityTable({
  rows,
  error,
}: {
  rows: readonly BriefingQualityRow[]
  error: string | null
}) {
  const columns: readonly Column<BriefingQualityRow>[] = [
    {
      key: 'kind',
      header: aiMessages.fields.kind,
      cell: (row) => aiMessages.briefingKinds[row.kind] ?? row.kind,
    },
    {
      key: 'total',
      header: aiMessages.fields.total,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.total)}</Num>,
    },
    {
      key: 'ready',
      header: aiMessages.fields.ready,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.ready)}</Num>,
    },
    {
      key: 'failed',
      header: aiMessages.fields.failed,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.failed)}</Num>,
    },
    {
      key: 'skipped',
      header: aiMessages.fields.skipped,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.skipped)}</Num>,
    },
    {
      key: 'seconds',
      header: aiMessages.fields.generationSeconds,
      align: 'right',
      secondary: true,
      title: aiMessages.fields.generationSecondsTitle,
      cell: (row) => <Num>{formatSeconds(row.generationSeconds)}</Num>,
    },
    {
      key: 'opened',
      header: aiMessages.fields.opened,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.opened)}</Num>,
    },
    {
      key: 'rate',
      header: aiMessages.fields.openRate,
      align: 'right',
      width: 'w-28',
      title: aiMessages.quality.briefingOpenHint,
      cell: (row) => {
        const rate = ratioOf(row.opened, row.ready)
        const tone = openRateTone(rate)
        return (
          <div className="flex flex-col items-end">
            <Badge tone={tone}>{formatRatio(rate)}</Badge>
            <Bar
              value={row.opened}
              max={Math.max(1, row.ready)}
              tone={tone === 'neutral' ? 'primary' : tone}
              block
            />
          </div>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.kind}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={aiMessages.quality.briefingEmpty}
      caption={aiMessages.quality.briefingSection}
      rowTone={(row) => (row.failed > 0 ? 'warning' : 'default')}
    />
  )
}

// ---------------------------------------------------------------------------
// Captures
// ---------------------------------------------------------------------------

export function CaptureQualityTable({
  rows,
  error,
}: {
  rows: readonly CaptureQualityRow[]
  error: string | null
}) {
  const columns: readonly Column<CaptureQualityRow>[] = [
    {
      key: 'kind',
      header: aiMessages.fields.kind,
      cell: (row) => aiMessages.captureKinds[row.kind] ?? row.kind,
    },
    {
      key: 'total',
      header: aiMessages.fields.total,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.total)}</Num>,
    },
    {
      key: 'ready',
      header: aiMessages.fields.ready,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.ready)}</Num>,
    },
    {
      key: 'failed',
      header: aiMessages.fields.failed,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.failed)}</Num>,
    },
    {
      key: 'seconds',
      header: aiMessages.fields.analysisSeconds,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatSeconds(row.analysisSeconds)}</Num>,
    },
    {
      key: 'classified',
      header: aiMessages.fields.classified,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.classified)}</Num>,
    },
    {
      key: 'rate',
      header: aiMessages.fields.classifyRate,
      align: 'right',
      width: 'w-28',
      title: aiMessages.quality.captureClassifiedHint,
      cell: (row) => {
        const rate = ratioOf(row.classified, row.ready)
        const tone = openRateTone(rate)
        return (
          <div className="flex flex-col items-end">
            <Badge tone={tone}>{formatRatio(rate)}</Badge>
            <Bar
              value={row.classified}
              max={Math.max(1, row.ready)}
              tone={tone === 'neutral' ? 'primary' : tone}
              block
            />
          </div>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.kind}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={aiMessages.quality.captureEmpty}
      caption={aiMessages.quality.captureSection}
      rowTone={(row) => (row.failed > 0 ? 'warning' : 'default')}
    />
  )
}

// ---------------------------------------------------------------------------
// Briefing open rate by day
// ---------------------------------------------------------------------------

export function BriefingTrendTable({
  rows,
  error,
}: {
  rows: readonly BriefingQualityDay[]
  error: string | null
}) {
  const maxReady = rows.reduce((max, row) => Math.max(max, row.ready), 0)

  const columns: readonly Column<BriefingQualityDay>[] = [
    {
      key: 'day',
      header: aiMessages.fields.day,
      width: 'w-28',
      cell: (row) => formatDate(row.day),
    },
    {
      key: 'ready',
      header: aiMessages.fields.ready,
      align: 'right',
      cell: (row) => (
        <div className="flex flex-col items-end">
          <Num>{formatNumber(row.ready)}</Num>
          <Bar value={row.ready} max={maxReady} block />
        </div>
      ),
    },
    {
      key: 'opened',
      header: aiMessages.fields.opened,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.opened)}</Num>,
    },
    {
      key: 'failed',
      header: aiMessages.fields.failed,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.failed)}</Num>,
    },
    {
      key: 'rate',
      header: aiMessages.fields.openRate,
      align: 'right',
      width: 'w-24',
      cell: (row) => {
        const rate = ratioOf(row.opened, row.ready)
        return <Badge tone={openRateTone(rate)}>{formatRatio(rate)}</Badge>
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.day}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={aiMessages.quality.briefingEmpty}
      caption={aiMessages.quality.briefingSection}
    />
  )
}
