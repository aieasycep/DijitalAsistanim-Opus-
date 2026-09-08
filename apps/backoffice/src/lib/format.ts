import { systemClock, type Clock } from '@da/domain'
import { messages } from './messages'

/**
 * Presentation helpers.
 *
 * Time is always read from an injected `Clock` (`@da/domain`), never from a
 * bare `new Date()`, so a relative timestamp is reproducible in a test and a
 * frozen clock renders a stable page.
 *
 * Everything formats for Turkish operators: `tr-TR` grouping, Europe/Istanbul
 * wall clock, tabular figures in the stylesheet.
 */

export const OPS_TIME_ZONE = 'Europe/Istanbul'
export const OPS_LOCALE = 'tr-TR'

const dateTimeFormatter = new Intl.DateTimeFormat(OPS_LOCALE, {
  timeZone: OPS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat(OPS_LOCALE, {
  timeZone: OPS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const numberFormatter = new Intl.NumberFormat(OPS_LOCALE)

const compactNumberFormatter = new Intl.NumberFormat(OPS_LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function parse(value: string | null | undefined): Date | null {
  if (!value) return null
  const instant = new Date(value)
  return Number.isNaN(instant.getTime()) ? null : instant
}

/** `07.09.2026 14:32` in Istanbul, or an em dash when there is no value. */
export function formatDateTime(value: string | null | undefined): string {
  const instant = parse(value)
  return instant ? dateTimeFormatter.format(instant) : '—'
}

/** `07.09.2026`. Accepts both an instant and a bare `YYYY-MM-DD`. */
export function formatDate(value: string | null | undefined): string {
  const instant = parse(value)
  return instant ? dateFormatter.format(instant) : '—'
}

/** `3 sa önce` / `2 gün sonra`. Coarse on purpose: this is triage, not forensics. */
export function formatRelative(
  value: string | null | undefined,
  clock: Clock = systemClock,
): string {
  const instant = parse(value)
  if (!instant) return '—'

  const deltaMs = instant.getTime() - clock.now().getTime()
  const past = deltaMs < 0
  const absMinutes = Math.floor(Math.abs(deltaMs) / 60_000)

  if (absMinutes < 1) return messages.relative.now
  if (absMinutes < 60) {
    return past ? messages.relative.minutesAgo(absMinutes) : messages.relative.inMinutes(absMinutes)
  }
  const hours = Math.floor(absMinutes / 60)
  if (hours < 24) {
    return past ? messages.relative.hoursAgo(hours) : messages.relative.inHours(hours)
  }
  const days = Math.floor(hours / 24)
  return past ? messages.relative.daysAgo(days) : messages.relative.inDays(days)
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return numberFormatter.format(value)
}

/** Compact form for stat tiles, where a six-digit count would wrap. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return Math.abs(value) < 10_000
    ? numberFormatter.format(value)
    : compactNumberFormatter.format(value)
}

/**
 * `ai_usage_events.cost_micros` is millionths of the billing currency. Shown to
 * cents, because a per-user figure is often a fraction of one.
 */
export function formatCostMicros(micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return '—'
  const units = micros / 1_000_000
  const fractionDigits = Math.abs(units) < 10 ? 2 : 0
  return `${messages.units.currency}${units.toLocaleString(OPS_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  const suffix = units[index] ?? 'B'
  return `${value.toLocaleString(OPS_LOCALE, { maximumFractionDigits: index === 0 ? 0 : 1 })} ${suffix}`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds < 60) return `${Math.round(seconds)} ${messages.units.seconds}`
  if (seconds < 3600) return `${Math.round(seconds / 60)} ${messages.units.minutes}`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} ${messages.units.hours}`
  return `${Math.round(seconds / 86_400)} ${messages.units.days}`
}

/** First eight characters of a uuid — enough to recognise, short enough to scan. */
export function shortId(id: string | null | undefined): string {
  if (!id) return '—'
  return id.length <= 8 ? id : id.slice(0, 8)
}

export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return '—'
  return `%${Math.round((part / whole) * 100).toLocaleString(OPS_LOCALE)}`
}

/** A ratio already computed elsewhere, e.g. `0.734` → `%73,4`. */
export function formatRatio(ratio: number | null | undefined, fractionDigits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  return `%${(ratio * 100).toLocaleString(OPS_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`
}

// ===========================================================================
// Zoned arithmetic
//
// Every window in this console is an Istanbul window. "Son 24 saat" and "1–7
// Eylül" are different questions, and both are answered against the operator's
// wall clock rather than UTC — otherwise the daily bucket an operator reads at
// 01:00 belongs to yesterday and nothing on the screen says so.
//
// The offset is asked of `Intl` per instant rather than hard-coded to +03:00.
// Türkiye has been on permanent UTC+3 since 2016, but a console that hard-codes
// a government decision is a console that silently lies the week it changes.
// ===========================================================================

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: OPS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function zonedParts(instant: Date): ZonedParts {
  const found: Record<string, number> = {}
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') found[part.type] = Number(part.value)
  }
  return {
    year: found['year'] ?? 1970,
    month: found['month'] ?? 1,
    day: found['day'] ?? 1,
    // `hour12: false` renders midnight as 24 in some ICU versions.
    hour: (found['hour'] ?? 0) % 24,
    minute: found['minute'] ?? 0,
    second: found['second'] ?? 0,
  }
}

/** Milliseconds Istanbul is ahead of UTC at this instant. */
function zoneOffsetMs(instant: Date): number {
  const parts = zonedParts(instant)
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * The instant at which a given Istanbul wall-clock moment occurs.
 *
 * Two passes: the first guesses with the offset that applies at the naive UTC
 * reading, the second corrects it with the offset that actually applies at the
 * guessed instant. That converges for every real transition, and for a zone
 * with no transitions the second pass is a no-op.
 */
export function instantFromIstanbul(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  const firstPass = naive - zoneOffsetMs(new Date(naive))
  const secondPass = naive - zoneOffsetMs(new Date(firstPass))
  return new Date(secondPass)
}

/** `2026-09-08` — the Istanbul calendar date an instant falls on. */
export function istanbulDate(instant: Date): string {
  const parts = zonedParts(instant)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

/** Today in Istanbul, from the injected clock. Never `new Date()`. */
export function istanbulToday(clock: Clock = systemClock): string {
  return istanbulDate(clock.now())
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parse `YYYY-MM-DD` into its three numbers, or null when it is not one. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(value)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  // Round-trip through the zone: `2026-02-30` parses but is not a date.
  const instant = instantFromIstanbul(year, month, day, 12)
  return istanbulDate(instant) === value ? { year, month, day } : null
}

/** The first instant of an Istanbul calendar date, or null for a bad date. */
export function istanbulDayStart(isoDate: string): Date | null {
  const parsed = parseIsoDate(isoDate)
  if (parsed === null) return null
  return instantFromIstanbul(parsed.year, parsed.month, parsed.day, 0, 0, 0, 0)
}

/** The last instant of an Istanbul calendar date, inclusive. */
export function istanbulDayEnd(isoDate: string): Date | null {
  const parsed = parseIsoDate(isoDate)
  if (parsed === null) return null
  return instantFromIstanbul(parsed.year, parsed.month, parsed.day, 23, 59, 59, 999)
}

const axisDayFormatter = new Intl.DateTimeFormat(OPS_LOCALE, {
  timeZone: OPS_TIME_ZONE,
  day: '2-digit',
  month: 'short',
})

const axisHourFormatter = new Intl.DateTimeFormat(OPS_LOCALE, {
  timeZone: OPS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

/** `08 Eyl` — a chart tick, short enough not to collide with its neighbour. */
export function formatAxisDay(value: string | null | undefined): string {
  const instant = parse(value)
  return instant ? axisDayFormatter.format(instant) : '—'
}

/** `14:00` — the tick for a window measured in hours rather than days. */
export function formatAxisHour(value: string | null | undefined): string {
  const instant = parse(value)
  return instant ? axisHourFormatter.format(instant) : '—'
}
