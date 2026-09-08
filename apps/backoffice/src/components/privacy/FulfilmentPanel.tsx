import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, CardError } from '@/components/ui'
import { formatDuration, formatNumber } from '@/lib/format'
import type { FulfilmentSummary } from '@/lib/queries/privacy'
import { privacyMessages } from './messages'

/**
 * How long fulfilment takes, and what happens to the archive afterwards.
 *
 * The two durations are real rows' values chosen by `ORDER BY … OFFSET n`, not
 * averages, so "ortanca" means the middle request actually took that long.
 *
 * `Süresi dolmuş ama hazır görünen` is the panel's real point. Those rows are a
 * cron failure, not an export failure: `da_export_cleanup` runs at 03:45 UTC to
 * flip a `ready` row whose link has lapsed to `expired`, and a number here means
 * the product is still offering a download it can no longer honour.
 */

export interface FulfilmentPanelProps {
  fulfilment: FulfilmentSummary | null
  error: string | null
  /** Queue address filtered to ready requests, for the stale-artifact row. */
  readyHref: string
}

export function FulfilmentPanel({ fulfilment, error, readyHref }: FulfilmentPanelProps) {
  if (error !== null) {
    return <CardError message={error} hint={privacyMessages.errors.fulfilmentFailed} />
  }

  if (fulfilment === null) {
    return <CardError message={privacyMessages.errors.fulfilmentFailed} />
  }

  return (
    <dl className="flex flex-col gap-2">
      <Row
        term={privacyMessages.fulfilment.median}
        value={
          fulfilment.medianMinutes === null ? '—' : formatDuration(fulfilment.medianMinutes * 60)
        }
      />
      <Row
        term={privacyMessages.fulfilment.p90}
        value={fulfilment.p90Minutes === null ? '—' : formatDuration(fulfilment.p90Minutes * 60)}
      />
      <Row
        term={privacyMessages.fulfilment.completed}
        value={formatNumber(fulfilment.completed)}
        hint={fulfilment.completed === 0 ? privacyMessages.fulfilment.noData : undefined}
      />

      <div className="my-1 border-t border-hairline" />

      <Row
        term={privacyMessages.fulfilment.staleReady}
        value={formatNumber(fulfilment.staleReady)}
        hint={privacyMessages.fulfilment.staleReadyHint}
        badge={
          fulfilment.staleReady > 0 ? (
            <Link href={readyHref} className="underline underline-offset-2">
              <Badge tone="warning">{formatNumber(fulfilment.staleReady)}</Badge>
            </Link>
          ) : null
        }
      />
      <Row
        term={privacyMessages.fulfilment.expiredTotal}
        value={formatNumber(fulfilment.expiredTotal)}
        hint={privacyMessages.fulfilment.expiredHint}
      />
    </dl>
  )
}

function Row({
  term,
  value,
  hint,
  badge,
}: {
  term: string
  value: string
  hint?: string
  badge?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-[13px] text-ink">{term}</dt>
        {hint ? <p className="text-[11px] text-faint">{hint}</p> : null}
      </div>
      <dd className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{badge ?? value}</dd>
    </div>
  )
}
