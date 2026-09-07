/**
 * Time is injected, never read ambiently. Every scheduling decision the
 * product makes (briefing windows, reminder offsets, follow-up thresholds,
 * retention cutoffs) is timezone-sensitive and must be reproducible in tests,
 * so `new Date()` is banned by lint and replaced by an explicit `Clock`.
 */
export interface Clock {
  /** Current instant. Always UTC internally; render in the user's zone. */
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(Date.now()),
}

/** A clock frozen at a fixed instant, for tests and deterministic replays. */
export function fixedClock(iso: string | Date): Clock {
  const instant = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(instant.getTime())) throw new Error(`fixedClock: invalid instant ${String(iso)}`)
  return { now: () => new Date(instant.getTime()) }
}

/** An advanceable clock, for stepping through scheduled work in tests. */
export function mutableClock(start: string | Date): Clock & { advance(ms: number): void } {
  let t = (typeof start === 'string' ? new Date(start) : start).getTime()
  return {
    now: () => new Date(t),
    advance(ms: number) {
      t += ms
    },
  }
}

export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

/** ISO-8601 instant string in UTC, e.g. `2026-09-07T06:30:00.000Z`. */
export type IsoInstant = string
/** Calendar date with no time component, e.g. `2026-09-07`. */
export type IsoDate = string
/** Wall-clock time of day in a user's zone, e.g. `07:15`. */
export type LocalTime = string

const LOCAL_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isLocalTime(value: string): value is LocalTime {
  return LOCAL_TIME_RE.test(value)
}

export function parseLocalTime(value: string): { hour: number; minute: number } {
  const m = LOCAL_TIME_RE.exec(value)
  if (!m) throw new Error(`Invalid local time "${value}" — expected HH:mm`)
  return { hour: Number(m[1]), minute: Number(m[2]) }
}

export function formatLocalTime(hour: number, minute: number): LocalTime {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * Offset of `timeZone` from UTC at `instant`, in minutes (positive east of
 * Greenwich). Derived from `Intl` rather than a table so DST transitions are
 * handled by the platform's own tz database.
 */
export function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type)
    return p ? Number(p.value) : 0
  }
  // `Date.UTC` of the wall-clock reading in the target zone, minus the true
  // instant, is exactly the zone's offset.
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  )
  return Math.round((asUtc - instant.getTime()) / MINUTE_MS)
}

/** The wall-clock calendar/time fields an instant shows in `timeZone`. */
export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = Sunday … 6 = Saturday, in the target zone. */
  weekday: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export function toZonedParts(instant: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((x) => x.type === type)?.value ?? '0'
  const hour = Number(get('hour'))
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: hour === 24 ? 0 : hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  }
}

/**
 * The UTC instant at which `timeZone` reads the given wall-clock time.
 *
 * Two passes: guess with the offset at the naive instant, then re-derive the
 * offset at the guess. This settles DST boundaries correctly — around a
 * spring-forward gap the result lands on the first valid instant after it.
 */
export function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    0,
    0,
  )
  const firstGuess = new Date(naive - timeZoneOffsetMinutes(new Date(naive), timeZone) * MINUTE_MS)
  const refinedOffset = timeZoneOffsetMinutes(firstGuess, timeZone)
  return new Date(naive - refinedOffset * MINUTE_MS)
}

/** `YYYY-MM-DD` for the instant as seen in `timeZone`. */
export function toIsoDate(instant: Date, timeZone: string): IsoDate {
  const p = toZonedParts(instant, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Midnight that starts the instant's local day, as a UTC instant. */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  const p = toZonedParts(instant, timeZone)
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 }, timeZone)
}

export function endOfLocalDay(instant: Date, timeZone: string): Date {
  return new Date(addLocalDays(startOfLocalDay(instant, timeZone), 1, timeZone).getTime() - 1)
}

/**
 * Add whole calendar days in `timeZone`. Adding a day across a DST boundary
 * keeps the same wall-clock time rather than shifting by exactly 24h.
 */
export function addLocalDays(instant: Date, days: number, timeZone: string): Date {
  const p = toZonedParts(instant, timeZone)
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return zonedTimeToUtc(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: p.hour,
      minute: p.minute,
    },
    timeZone,
  )
}

/** The next instant at which `timeZone` reads `localTime`, strictly after `from`. */
export function nextLocalTimeOccurrence(from: Date, localTime: LocalTime, timeZone: string): Date {
  const { hour, minute } = parseLocalTime(localTime)
  const p = toZonedParts(from, timeZone)
  const today = zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour, minute }, timeZone)
  if (today.getTime() > from.getTime()) return today
  return addLocalDays(today, 1, timeZone)
}

/** Monday-start week boundary, matching Turkish calendar convention. */
export function startOfLocalWeek(instant: Date, timeZone: string): Date {
  const p = toZonedParts(instant, timeZone)
  const daysSinceMonday = (p.weekday + 6) % 7
  return startOfLocalDay(addLocalDays(instant, -daysSinceMonday, timeZone), timeZone)
}

export function isWeekend(instant: Date, timeZone: string): boolean {
  const wd = toZonedParts(instant, timeZone).weekday
  return wd === 0 || wd === 6
}

export function isSameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  return toIsoDate(a, timeZone) === toIsoDate(b, timeZone)
}

/** Whole minutes between two instants, rounded toward zero. */
export function minutesBetween(a: Date, b: Date): number {
  return Math.trunc((b.getTime() - a.getTime()) / MINUTE_MS)
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

export const DEFAULT_TIME_ZONE = 'Europe/Istanbul'
