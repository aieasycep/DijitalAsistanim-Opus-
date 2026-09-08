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
