import { DAY_MS, systemClock, type Clock } from '@da/domain'
import type { BadgeTone } from '@/components/ui'
import type { BoPrivacyRequestRow } from '@/lib/db'
import {
  DUE_SOON_DAYS,
  OPEN_EXPORT_STATUSES,
  STATUTORY_DAYS,
  STUCK_HOURS,
  type DeadlineBucket,
} from './contract'
import { privacyMessages } from './messages'

/**
 * The statutory clock, as arithmetic.
 *
 * It lives beside the contract rather than in the query module because both
 * sides need it: the queries turn a bucket into a `WHERE` clause over
 * `requested_at`, and the tables turn a single row's `requested_at` into the
 * remaining time an operator reads. Deriving both from the same constants is
 * what keeps a row the queue calls overdue from rendering as "4 gün kaldı".
 *
 * Time comes from an injected `Clock`, never from a bare `new Date()`, so a
 * frozen clock renders a stable page and a test can put a request one hour
 * either side of its deadline and get the answer it expects.
 */

/**
 * Days left before a request breaches the 30-day limit. Negative once it
 * already has, so one number covers both sides of the deadline.
 */
export function daysToDeadline(requestedAt: string, clock: Clock = systemClock): number {
  const requested = new Date(requestedAt).getTime()
  if (Number.isNaN(requested)) return Number.NaN
  return (requested + STATUTORY_DAYS * DAY_MS - clock.now().getTime()) / DAY_MS
}

export function deadlineBucketOf(requestedAt: string, clock: Clock = systemClock): DeadlineBucket {
  const remaining = daysToDeadline(requestedAt, clock)
  if (Number.isNaN(remaining)) return 'normal'
  if (remaining <= 0) return 'gecikmis'
  if (remaining <= DUE_SOON_DAYS) return 'yaklasan'
  return 'normal'
}

export function deadlineTone(bucket: DeadlineBucket): BadgeTone {
  switch (bucket) {
    case 'gecikmis':
      return 'critical'
    case 'yaklasan':
      return 'warning'
    default:
      return 'neutral'
  }
}

/**
 * The remaining time, in the coarsest unit that is still honest: days while
 * there are days, hours in the last day, and days overrun once the deadline has
 * passed.
 */
export function formatRemaining(requestedAt: string, clock: Clock = systemClock): string {
  const remaining = daysToDeadline(requestedAt, clock)
  if (Number.isNaN(remaining)) return '—'
  if (remaining <= 0) {
    return privacyMessages.deadline.overdueBy(Math.max(1, Math.floor(-remaining)))
  }
  if (remaining < 1) {
    return privacyMessages.deadline.remainingHours(Math.max(1, Math.floor(remaining * 24)))
  }
  return privacyMessages.deadline.remainingDays(Math.floor(remaining))
}

/** True when a request is still open. */
export function isOpenRequest(row: BoPrivacyRequestRow): boolean {
  return (OPEN_EXPORT_STATUSES as readonly string[]).includes(row.status)
}

/**
 * True when an unfinished export has been unfinished for longer than a build
 * ever takes. `age_hours` is computed by the view, so this is the database's own
 * arithmetic rather than a second opinion formed in the browser's timezone.
 */
export function isStuckRequest(row: BoPrivacyRequestRow): boolean {
  return isOpenRequest(row) && row.age_hours >= STUCK_HOURS
}

/** The tone a whole row takes in a table: the worse of stuck and overdue. */
export function requestRowTone(
  row: BoPrivacyRequestRow,
  clock: Clock = systemClock,
): 'default' | 'critical' | 'warning' {
  if (!isOpenRequest(row)) return row.status === 'failed' ? 'warning' : 'default'
  const bucket = deadlineBucketOf(row.requested_at, clock)
  if (bucket === 'gecikmis' || isStuckRequest(row)) return 'critical'
  if (bucket === 'yaklasan') return 'warning'
  return 'default'
}
