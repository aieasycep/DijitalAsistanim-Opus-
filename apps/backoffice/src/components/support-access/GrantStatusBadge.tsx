import { Badge } from '@/components/ui/Badge'
import { GRANT_STATUS_LABELS_TR } from '@/lib/messages/support-access'
import { formatMinutesRemainingTr, type SupportAccessStatus } from '@/lib/redact'
import { effectiveStatus, grantStatusTone, type GrantRowShape } from './contract'

/**
 * The state of one grant, as the clock sees it.
 *
 * A grant whose window has closed is shown as expired even while the stored
 * status still says `active` — `admin_cleanup_expired()` sweeps those on a
 * schedule, and `sa_assert_grant()` in Postgres decides from the timestamps, not
 * from the column. Painting a live badge over a permission that can no longer
 * open anything would be exactly the fake green status this console does not
 * ship.
 */
export function GrantStatusBadge({
  row,
  now,
  minutesRemaining,
}: {
  row: GrantRowShape
  now: Date
  /**
   * `bo_support_access_grants.minutes_remaining`, computed in Postgres. Passing
   * it renders the countdown beside the badge for a grant that is genuinely
   * live; omit it in a table where the column has its own cell.
   */
  minutesRemaining?: number
}) {
  const status: SupportAccessStatus = effectiveStatus(row, now)
  const showCountdown =
    status === 'active' && minutesRemaining !== undefined && minutesRemaining > 0

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={grantStatusTone(status)} dot={status === 'active'}>
        {GRANT_STATUS_LABELS_TR[status]}
      </Badge>
      {showCountdown ? (
        <span className="text-[11px] text-faint tabular-nums">
          {formatMinutesRemainingTr(minutesRemaining)}
        </span>
      ) : null}
    </span>
  )
}
