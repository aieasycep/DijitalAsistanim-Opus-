import { describe, expect, it } from 'vitest'
import {
  addLocalDays,
  DAY_MS,
  endOfLocalDay,
  fixedClock,
  formatLocalTime,
  isLocalTime,
  mutableClock,
  parseLocalTime,
  startOfLocalDay,
  systemClock,
  timeZoneOffsetMinutes,
  toIsoDate,
  toZonedParts,
  zonedTimeToUtc,
} from './clock.ts'

/**
 * Everything in this app is anchored to a wall clock in the user's own zone:
 * a 07:30 briefing, "today", a deadline at end of day. Getting the zone wrong
 * does not throw — it silently sends the briefing an hour late twice a year,
 * so the DST cases below are the point of this file.
 */

const IST = 'Europe/Istanbul' // UTC+3 all year
const BERLIN = 'Europe/Berlin' // UTC+1 / UTC+2
const NY = 'America/New_York' // UTC-5 / UTC-4

describe('timeZoneOffsetMinutes', () => {
  it('reads a fixed-offset zone', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-01-15T00:00:00Z'), IST)).toBe(180)
    expect(timeZoneOffsetMinutes(new Date('2026-07-15T00:00:00Z'), IST)).toBe(180)
  })

  it('follows a zone across its DST change', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), BERLIN)).toBe(60)
    expect(timeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), BERLIN)).toBe(120)
    expect(timeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), NY)).toBe(-300)
    expect(timeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), NY)).toBe(-240)
  })

  it('is zero for UTC', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'UTC')).toBe(0)
  })
})

describe('toZonedParts', () => {
  it('reads the wall clock in the target zone', () => {
    const parts = toZonedParts(new Date('2026-09-07T09:00:00Z'), IST)
    expect(parts).toMatchObject({ year: 2026, month: 9, day: 7, hour: 12, minute: 0 })
  })

  it('reports the local weekday, not the UTC one', () => {
    // 22:30 UTC on Sunday is already Monday in Istanbul.
    expect(toZonedParts(new Date('2026-09-06T22:30:00Z'), IST).weekday).toBe(1)
    expect(toZonedParts(new Date('2026-09-06T22:30:00Z'), 'UTC').weekday).toBe(0)
  })

  it('renders local midnight as hour 0 rather than 24', () => {
    // `Intl` reports midnight as hour 24 in some locales; that would make
    // "is it before 07:30?" answer no at midnight.
    const midnight = toZonedParts(new Date('2026-09-06T21:00:00Z'), IST)
    expect(midnight.hour).toBe(0)
    expect(midnight.day).toBe(7)
  })
})

describe('zonedTimeToUtc', () => {
  it('resolves a wall-clock time to the right instant', () => {
    expect(
      zonedTimeToUtc({ year: 2026, month: 9, day: 7, hour: 7, minute: 30 }, IST).toISOString(),
    ).toBe('2026-09-07T04:30:00.000Z')
  })

  it('gives a different instant for the same wall time either side of DST', () => {
    // A 07:30 briefing is 07:30 to the user in both cases; the instant moves.
    const summer = zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 7, minute: 30 }, BERLIN)
    const winter = zonedTimeToUtc({ year: 2026, month: 12, day: 1, hour: 7, minute: 30 }, BERLIN)
    expect(summer.toISOString()).toBe('2026-07-01T05:30:00.000Z')
    expect(winter.toISOString()).toBe('2026-12-01T06:30:00.000Z')
  })

  it('round-trips through toZonedParts', () => {
    for (const zone of [IST, BERLIN, NY, 'UTC', 'Asia/Kolkata']) {
      for (const month of [1, 3, 6, 11]) {
        const wall = { year: 2026, month, day: 15, hour: 9, minute: 45 }
        const parts = toZonedParts(zonedTimeToUtc(wall, zone), zone)
        expect({ ...parts, second: undefined, weekday: undefined }).toMatchObject(wall)
      }
    }
  })

  it('lands on a real instant inside the spring-forward gap', () => {
    // 02:30 on 29 March 2026 does not exist in Berlin. It must resolve to a
    // real instant rather than NaN or an hour in the past.
    const resolved = zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, BERLIN)
    expect(Number.isNaN(resolved.getTime())).toBe(false)
    expect(toZonedParts(resolved, BERLIN).day).toBe(29)
  })

  it('handles a half-hour zone', () => {
    expect(
      zonedTimeToUtc({ year: 2026, month: 6, day: 1, hour: 9, minute: 0 }, 'Asia/Kolkata'),
    ).toEqual(new Date('2026-06-01T03:30:00Z'))
  })
})

describe('local day boundaries', () => {
  it('starts the day at local midnight', () => {
    expect(startOfLocalDay(new Date('2026-09-07T09:00:00Z'), IST).toISOString()).toBe(
      '2026-09-06T21:00:00.000Z',
    )
  })

  it('ends the day one millisecond before the next midnight', () => {
    const end = endOfLocalDay(new Date('2026-09-07T09:00:00Z'), IST)
    expect(end.toISOString()).toBe('2026-09-07T20:59:59.999Z')
  })

  it('spans exactly 23 hours on the day a zone springs forward', () => {
    const start = startOfLocalDay(new Date('2026-03-29T12:00:00Z'), BERLIN)
    const end = endOfLocalDay(new Date('2026-03-29T12:00:00Z'), BERLIN)
    expect(Math.round((end.getTime() + 1 - start.getTime()) / 3_600_000)).toBe(23)
  })

  it('spans 25 hours on the day a zone falls back', () => {
    const start = startOfLocalDay(new Date('2026-10-25T12:00:00Z'), BERLIN)
    const end = endOfLocalDay(new Date('2026-10-25T12:00:00Z'), BERLIN)
    expect(Math.round((end.getTime() + 1 - start.getTime()) / 3_600_000)).toBe(25)
  })

  it('formats the local date, which can differ from the UTC one', () => {
    expect(toIsoDate(new Date('2026-09-06T22:30:00Z'), IST)).toBe('2026-09-07')
    expect(toIsoDate(new Date('2026-09-06T22:30:00Z'), 'UTC')).toBe('2026-09-06')
    expect(toIsoDate(new Date('2026-09-07T02:00:00Z'), NY)).toBe('2026-09-06')
  })
})

describe('addLocalDays', () => {
  it('keeps the wall-clock time across a DST boundary', () => {
    // Adding a day to 07:30 the day before the change must give 07:30, not
    // 06:30 — this is exactly how a briefing drifts.
    const before = zonedTimeToUtc({ year: 2026, month: 3, day: 28, hour: 7, minute: 30 }, BERLIN)
    const after = addLocalDays(before, 1, BERLIN)
    expect(toZonedParts(after, BERLIN)).toMatchObject({ day: 29, hour: 7, minute: 30 })
    // …and the elapsed real time is 23 hours, not 24.
    expect(after.getTime() - before.getTime()).toBe(23 * 3_600_000)
  })

  it('crosses month and year boundaries', () => {
    const newYear = zonedTimeToUtc({ year: 2026, month: 12, day: 31, hour: 12 }, IST)
    expect(toZonedParts(addLocalDays(newYear, 1, IST), IST)).toMatchObject({
      year: 2027,
      month: 1,
      day: 1,
      hour: 12,
    })
  })

  it('goes backwards too', () => {
    const day = zonedTimeToUtc({ year: 2026, month: 3, day: 1, hour: 8 }, IST)
    expect(toZonedParts(addLocalDays(day, -1, IST), IST)).toMatchObject({ month: 2, day: 28 })
  })
})

describe('local time strings', () => {
  it('recognises a wall-clock time', () => {
    expect(isLocalTime('07:30')).toBe(true)
    expect(isLocalTime('23:59')).toBe(true)
    expect(isLocalTime('00:00')).toBe(true)
    expect(isLocalTime('7:30')).toBe(false)
    expect(isLocalTime('24:00')).toBe(false)
    expect(isLocalTime('07:60')).toBe(false)
    expect(isLocalTime('')).toBe(false)
  })

  it('round-trips parse and format', () => {
    expect(parseLocalTime('07:30')).toEqual({ hour: 7, minute: 30 })
    expect(formatLocalTime(7, 30)).toBe('07:30')
    expect(formatLocalTime(0, 0)).toBe('00:00')
    expect(formatLocalTime(23, 5)).toBe('23:05')
  })
})

describe('clocks', () => {
  it('freezes time for a test', () => {
    const clock = fixedClock('2026-09-07T09:00:00Z')
    expect(clock.now().toISOString()).toBe('2026-09-07T09:00:00.000Z')
    expect(clock.now().toISOString()).toBe('2026-09-07T09:00:00.000Z')
  })

  it('hands out a fresh Date each call so a caller cannot mutate it', () => {
    const clock = fixedClock('2026-09-07T09:00:00Z')
    const first = clock.now()
    first.setFullYear(1999)
    expect(clock.now().getFullYear()).toBe(2026)
  })

  it('advances on demand', () => {
    const clock = mutableClock('2026-09-07T09:00:00Z')
    clock.advance(DAY_MS)
    expect(clock.now().toISOString()).toBe('2026-09-08T09:00:00.000Z')
  })

  it('reads real time from the system clock', () => {
    const before = Date.now()
    const reading = systemClock.now().getTime()
    expect(reading).toBeGreaterThanOrEqual(before)
    expect(reading).toBeLessThanOrEqual(Date.now())
  })
})
