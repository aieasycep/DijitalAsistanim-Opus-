import { healthMessages } from '@/lib/messages/health'
import { windowOf, type HealthWindow } from './presentation'

/**
 * The last 24 hours of one dependency, as a strip.
 *
 * ---------------------------------------------------------------------------
 * WHY A SINGLE STATUS LIGHT IS NOT ENOUGH
 * ---------------------------------------------------------------------------
 *
 * A dependency that failed eleven times this morning and answered on the twelfth
 * attempt renders, in the status column, as a green tick — and that green tick
 * is the reason somebody closes the incident. The three counts
 * `bo_system_health` carries over the same window (`sample_count_24h`,
 * `degraded_count_24h`, `down_count_24h`) are what make the flap visible, so
 * they are drawn next to the verdict rather than hidden behind a hover.
 *
 * Every segment is a real count. The healthy segment is the remainder — samples
 * minus degraded minus down — and a window with no samples draws no bar at all
 * and says so, because an empty bar and a full green one must never be the same
 * picture.
 *
 * The bar is `aria-hidden`; the counts are text underneath it, so the panel is
 * readable without colour and by a screen reader.
 */

const SEGMENTS = [
  { key: 'healthy', className: 'bg-success' },
  { key: 'degraded', className: 'bg-warning' },
  { key: 'down', className: 'bg-critical' },
] as const

function share(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0
  // A non-zero segment never rounds to invisible: a failure that disappears
  // from the bar is exactly the failure this component exists to show.
  return Math.max(2, Math.round((count / total) * 100))
}

export function HistoryStrip({
  row,
}: {
  row: {
    sample_count_24h: number
    degraded_count_24h: number
    down_count_24h: number
    avg_latency_ms_24h: number | null
    max_latency_ms_24h: number | null
  } | null
}) {
  if (row === null || row.sample_count_24h <= 0) {
    return <span className="text-[11px] text-faint">{healthMessages.window.noSamples}</span>
  }

  const measured: HealthWindow = windowOf(row)
  const counts: Readonly<Record<(typeof SEGMENTS)[number]['key'], number>> = {
    healthy: measured.healthy,
    degraded: measured.degraded,
    down: measured.down,
  }

  return (
    <span className="block min-w-32">
      <span
        aria-hidden="true"
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface2"
      >
        {SEGMENTS.map((segment) => {
          const percent = share(counts[segment.key], measured.samples)
          if (percent === 0) return null
          return (
            <span
              key={segment.key}
              className={`block h-1.5 ${segment.className}`}
              style={{ width: `${percent}%` }}
            />
          )
        })}
      </span>

      <span className="mt-1 block text-[11px] text-faint tabular-nums">
        {healthMessages.window.breakdown(measured.healthy, measured.degraded, measured.down)}
      </span>

      {measured.flapping ? (
        <span className="mt-0.5 block text-[11px] font-medium text-warning-text">
          {healthMessages.window.flapping}
        </span>
      ) : null}

      {row.avg_latency_ms_24h === null ? null : (
        <span className="mt-0.5 block text-[11px] text-faint tabular-nums">
          {healthMessages.window.averageLatency(row.avg_latency_ms_24h)}
          {row.max_latency_ms_24h === null
            ? ''
            : ` · ${healthMessages.window.maxLatency(row.max_latency_ms_24h)}`}
        </span>
      )}
    </span>
  )
}
