import { DAY_MS } from '@da/domain'

/**
 * When a window measured in whole days closes.
 *
 * ---------------------------------------------------------------------------
 * WHY A DURATION, AND WHY THE INSTANT IS COMPUTED HERE
 * ---------------------------------------------------------------------------
 *
 * Three areas of the console open a timed window on somebody's account — a
 * temporary Pro grant, a per-user feature-flag pin, an admin invite — and all
 * three forms post a *number of days* rather than a date. The operator's
 * browser and the server do not share a timezone, and a `datetime-local` that
 * silently lands three hours out either expires an invite early or leaves a
 * free month running a day longer than anybody chose.
 *
 * So the instant is derived on the server, from the injected `Clock`, by these
 * two functions. They were the same expression written out three times, which
 * is two more places for `days` and the window it produced to stop agreeing.
 *
 * Neither of them decides how long a window *may* be. That is the database's
 * job — `admin_entitlement_grants_days_range` and
 * `admin_invites_expiry_after_creation` — and the console does not restate it.
 */

/** The end of a window of `days` whole days that opens at `from`. */
export function expiresAfterDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS)
}

/**
 * The same window, where `0` days means the console's "süresiz" — no expiry at
 * all rather than a window that closed the instant it opened.
 *
 * A feature-flag pin is the one place that offers it: a null `expires_at` is
 * what `feature_flag_is_enabled()` reads as a pin that never lapses.
 */
export function expiresAfterDaysOrNever(from: Date, days: number): Date | null {
  return days === 0 ? null : expiresAfterDays(from, days)
}
