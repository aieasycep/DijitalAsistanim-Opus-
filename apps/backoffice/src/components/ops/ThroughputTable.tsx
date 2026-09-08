import { type Column, DataTable, Num } from '@/components/ui'
import { formatCostMicros, formatDate, formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { ThroughputDay } from '@/lib/queries/ops'
import { opsMessages } from './messages'
import { SparkBar } from './SparkBar'

/**
 * Seven Istanbul days of pipeline volume.
 *
 * What is *not* here matters as much as what is. There is no "messages
 * ingested" column and there cannot be one: no `bo_*` view counts
 * `email_messages` or `calendar_events`, because how much mail a platform read
 * yesterday is only ever the sum of how much mail individual people received.
 * Throughput is therefore measured at the steps after ingestion — model calls,
 * briefings, notifications, captures — which are the steps that actually break.
 *
 * Failure counts sit under their totals rather than in separate columns: an
 * operator scanning this wants "were there any?" before "how many?".
 */

const WEEKDAY = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  weekday: 'short',
})

function weekdayOf(day: string): string {
  const instant = new Date(`${day}T12:00:00Z`)
  return Number.isNaN(instant.getTime()) ? '' : WEEKDAY.format(instant)
}

function VolumeCell({
  total,
  failed,
  max,
  tone = 'primary',
}: {
  total: number
  failed: number
  max: number
  tone?: 'primary' | 'info'
}) {
  return (
    <div className="flex min-w-20 flex-col items-end">
      <span className="tabular-nums">{formatNumber(total)}</span>
      {failed > 0 ? (
        <span className="text-[11px] text-critical-text">
          {formatNumber(failed)} {opsMessages.throughput.failedSuffix}
        </span>
      ) : null}
      <SparkBar value={total} max={max} tone={failed > 0 ? 'critical' : tone} />
    </div>
  )
}

export function ThroughputTable({
  rows,
  error,
}: {
  rows: readonly ThroughputDay[]
  error: string | null
}) {
  // Each column scales against its own busiest day, so a column of small
  // numbers still shows its shape instead of flattening against a bigger one.
  const maxAi = Math.max(0, ...rows.map((row) => row.aiEvents))
  const maxBriefing = Math.max(0, ...rows.map((row) => row.briefingTotal))
  const maxNotification = Math.max(0, ...rows.map((row) => row.notificationTotal))
  const maxCapture = Math.max(0, ...rows.map((row) => row.captureTotal))

  const columns: readonly Column<ThroughputDay>[] = [
    {
      key: 'day',
      header: opsMessages.throughput.day,
      cell: (row) => (
        <div className="flex flex-col leading-tight">
          <span className="font-medium text-ink">{formatDate(row.day)}</span>
          <span className="text-[11px] text-faint">{weekdayOf(row.day)}</span>
        </div>
      ),
    },
    {
      key: 'ai',
      header: opsMessages.throughput.aiEvents,
      align: 'right',
      cell: (row) => (
        <div className="flex min-w-20 flex-col items-end">
          <span className="tabular-nums">{formatNumber(row.aiEvents)}</span>
          <span className="text-[11px] text-faint">{formatCostMicros(row.aiCostMicros)}</span>
          <SparkBar value={row.aiEvents} max={maxAi} />
        </div>
      ),
    },
    {
      key: 'briefing',
      header: opsMessages.throughput.briefing,
      align: 'right',
      cell: (row) => (
        <VolumeCell total={row.briefingTotal} failed={row.briefingFailed} max={maxBriefing} />
      ),
    },
    {
      key: 'notification',
      header: opsMessages.throughput.notification,
      align: 'right',
      cell: (row) => (
        <VolumeCell
          total={row.notificationTotal}
          failed={row.notificationFailed}
          max={maxNotification}
          tone="info"
        />
      ),
    },
    {
      key: 'capture',
      header: opsMessages.throughput.capture,
      align: 'right',
      secondary: true,
      cell: (row) => (
        <VolumeCell total={row.captureTotal} failed={row.captureFailed} max={maxCapture} />
      ),
    },
    {
      key: 'signups',
      header: opsMessages.throughput.signups,
      align: 'right',
      secondary: true,
      cell: (row) => (
        <span className="text-muted">
          <Num>{formatNumber(row.signups)}</Num>
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.day}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={opsMessages.throughput.empty}
      caption={opsMessages.throughput.section}
    />
  )
}
