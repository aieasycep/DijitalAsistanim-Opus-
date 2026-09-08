import { DAY_MS, fixedClock, mutableClock } from '@da/domain'
import { describe, expect, it } from 'vitest'
import { expiresAfterDays, expiresAfterDaysOrNever } from '../expiry.ts'

/**
 * The arithmetic behind every timed window the console opens.
 *
 * A temporary Pro grant, a per-user feature-flag pin and an admin invite all
 * post a *number of days* and never a date, because the operator's browser and
 * the server do not share a timezone. That makes this function the one place
 * where "seven days" becomes an instant, and it makes the clock an argument:
 * a test that read the wall clock would be a test that agreed with whatever the
 * code did.
 */

describe('expiresAfterDays', () => {
  const clock = fixedClock('2026-09-08T09:30:00.000Z')

  it('adds whole days to the instant it was given', () => {
    expect(expiresAfterDays(clock.now(), 7).toISOString()).toBe('2026-09-15T09:30:00.000Z')
    expect(expiresAfterDays(clock.now(), 1).toISOString()).toBe('2026-09-09T09:30:00.000Z')
  })

  it('is exact milliseconds, not a calendar rounding', () => {
    for (const days of [1, 3, 7, 14, 30, 90, 365]) {
      expect(expiresAfterDays(clock.now(), days).getTime() - clock.now().getTime()).toBe(
        days * DAY_MS,
      )
    }
  })

  it('preserves the time of day across a month and a year boundary', () => {
    expect(expiresAfterDays(new Date('2026-01-31T23:59:00.000Z'), 1).toISOString()).toBe(
      '2026-02-01T23:59:00.000Z',
    )
    expect(expiresAfterDays(new Date('2026-12-31T00:00:00.000Z'), 1).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    )
  })

  it('crosses a leap day without losing one', () => {
    expect(expiresAfterDays(new Date('2028-02-28T12:00:00.000Z'), 1).toISOString()).toBe(
      '2028-02-29T12:00:00.000Z',
    )
  })

  it('does not mutate the instant it was handed', () => {
    const from = clock.now()
    const before = from.getTime()
    expiresAfterDays(from, 30)
    expect(from.getTime()).toBe(before)
  })

  it('moves with the clock, which is the whole reason the clock is injected', () => {
    const advancing = mutableClock('2026-09-08T09:30:00.000Z')
    const first = expiresAfterDays(advancing.now(), 7)
    advancing.advance(DAY_MS)
    const second = expiresAfterDays(advancing.now(), 7)
    expect(second.getTime() - first.getTime()).toBe(DAY_MS)
  })

  it('returns an instant strictly after its start for any positive duration', () => {
    for (const days of [1, 2, 365, 3_650]) {
      expect(expiresAfterDays(clock.now(), days).getTime()).toBeGreaterThan(clock.now().getTime())
    }
  })
})

describe('expiresAfterDaysOrNever', () => {
  const from = fixedClock('2026-09-08T09:30:00.000Z').now()

  it('reads zero as "süresiz" — no expiry rather than an instant expiry', () => {
    // A window that closed the moment it opened would silently un-pin every
    // override an operator meant to leave running.
    expect(expiresAfterDaysOrNever(from, 0)).toBeNull()
    expect(expiresAfterDays(from, 0).getTime()).toBe(from.getTime())
  })

  it('agrees with the plain form for every non-zero duration', () => {
    for (const days of [1, 3, 7, 30]) {
      expect(expiresAfterDaysOrNever(from, days)?.toISOString()).toBe(
        expiresAfterDays(from, days).toISOString(),
      )
    }
  })

  it('does not treat a negative duration as "never"', () => {
    // Only the console's own `0` means no expiry; anything else is a window,
    // and a window in the past is one the database will refuse.
    expect(expiresAfterDaysOrNever(from, -1)).not.toBeNull()
  })
})
