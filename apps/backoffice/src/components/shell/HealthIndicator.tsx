import Link from 'next/link'
import { formatRelative } from '@/lib/format'
import { messages } from '@/lib/messages'
import { cn } from '@/components/ui/utils'
import { loadHealthSummary, type HealthOverall } from './health.ts'

/**
 * The toolbar's health chip.
 *
 * Five states, and four of them are not green. The chip links to the operations
 * dashboard, because a status light an operator cannot click through to is a
 * status light that makes them go and look somewhere else anyway.
 *
 * The colours mean what they mean everywhere else in this console: green is
 * healthy, amber is watch it, red is act now, grey is *we do not know* — which
 * is a different claim from "fine", and the one a stale probe earns.
 */

const DOT_CLASS: Readonly<Record<HealthOverall, string>> = {
  operational: 'bg-success',
  degraded: 'bg-warning',
  down: 'bg-critical',
  unknown: 'bg-faint',
  unavailable: 'bg-faint',
}

const TEXT_CLASS: Readonly<Record<HealthOverall, string>> = {
  operational: 'text-success-text',
  degraded: 'text-warning-text',
  down: 'text-critical-text',
  unknown: 'text-muted',
  unavailable: 'text-muted',
}

export async function HealthIndicator({ href }: { href: string }) {
  const summary = await loadHealthSummary()

  const label = ((): string => {
    switch (summary.overall) {
      case 'operational':
        return messages.topbar.healthOperational
      case 'degraded':
        return messages.topbar.healthDegraded(summary.degraded)
      case 'down':
        return messages.topbar.healthDown(summary.down)
      case 'unknown':
        return summary.stale > 0
          ? messages.topbar.healthStale(summary.stale)
          : messages.topbar.healthUnknown
      case 'unavailable':
        return messages.topbar.healthUnavailable
    }
  })()

  const freshness = summary.lastCheckedAt === null ? null : formatRelative(summary.lastCheckedAt)

  return (
    <Link
      href={href}
      title={
        freshness === null
          ? messages.topbar.healthDetail
          : `${messages.topbar.healthDetail} · ${freshness}`
      }
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2',
        'text-[12px] font-medium transition-colors hover:bg-surface2',
        TEXT_CLASS[summary.overall],
      )}
    >
      {/* The text is hidden on a narrow toolbar but never from a screen
          reader: below `sm` the chip is a coloured dot, and a dot is not a
          status anybody can read. */}
      <span className="sr-only">{`${messages.topbar.healthLabel}: ${label}`}</span>
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASS[summary.overall])}
      />
      <span aria-hidden="true" className="hidden lg:inline">
        {label}
      </span>
    </Link>
  )
}
