import type { Locale } from '@da/domain'
import { toZonedParts } from '@da/domain'

/**
 * Locale-aware date, time and number formatting.
 *
 * Turkey uses a 24-hour clock and `1.490,00 ₺`-style numbers; the English
 * locale is used by expats and reviewers, so it keeps 24-hour time too rather
 * than flipping to AM/PM half-way through the product.
 */

const LOCALE_TAGS: Record<Locale, string> = { tr: 'tr-TR', en: 'en-GB' }

export function localeTag(locale: Locale): string {
  return LOCALE_TAGS[locale]
}

/** `08:42` */
export function formatTime(instant: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant)
}

/**
 * `07:30` from a stored `LocalTime`.
 *
 * A wall-clock preference has no date and no zone — rendering it through
 * `Date` would attach both and shift the value across a DST boundary.
 */
export function formatLocalTime(time: string, _locale: Locale): string {
  const [hours = '00', minutes = '00'] = time.split(':')
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
}

/**
 * `Pzt` / `Mon` from a weekday index (0 = Sunday, matching Postgres and the
 * preference columns).
 *
 * Derived from a fixed reference week in UTC rather than from a catalogue of
 * hand-written day names, so it stays correct in every locale we add.
 */
const REFERENCE_SUNDAY_UTC = Date.UTC(2024, 0, 7)

export function formatWeekdayName(
  weekdayIndex: number,
  locale: Locale,
  style: 'short' | 'long' = 'short',
): string {
  const normalized = ((weekdayIndex % 7) + 7) % 7
  const date = new Date(REFERENCE_SUNDAY_UTC + normalized * 86_400_000)
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    timeZone: 'UTC',
    weekday: style,
  }).format(date)
}

/** `5 Eylül` / `5 September` */
export function formatDayMonth(instant: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    timeZone,
    day: 'numeric',
    month: 'long',
  }).format(instant)
}

/** `Cuma, 5 Eylül` */
export function formatWeekdayDate(instant: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(instant)
}

/** `5 Eylül 2026` */
export function formatFullDate(instant: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(instant)
}

/** `14:00 – 16:30` */
export function formatTimeRange(start: Date, end: Date, locale: Locale, timeZone: string): string {
  return `${formatTime(start, locale, timeZone)} – ${formatTime(end, locale, timeZone)}`
}

/** `2,5 saat` → returned as a number + unit key so the caller can localise. */
export function splitDuration(minutes: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.round(minutes))
  return { hours: Math.floor(safe / 60), minutes: safe % 60 }
}

export function formatNumber(value: number, locale: Locale, fractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatMoney(value: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(LOCALE_TAGS[locale], {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value)
  } catch {
    // An unrecognised ISO code still has to render something truthful.
    return `${formatNumber(value, locale, Number.isInteger(value) ? 0 : 2)} ${currency}`
  }
}

/**
 * Relative day label: today, tomorrow, yesterday, otherwise a date. Returns an
 * i18n key rather than a string so the caller stays in control of wording.
 */
export function relativeDayKey(
  instant: Date,
  now: Date,
  timeZone: string,
): { key: string; values?: Record<string, string | number> } {
  const a = toZonedParts(instant, timeZone)
  const b = toZonedParts(now, timeZone)
  const dayDiff =
    Math.round(
      (Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000,
    ) || 0

  if (dayDiff === 0) return { key: 'common.today' }
  if (dayDiff === 1) return { key: 'common.tomorrow' }
  if (dayDiff === -1) return { key: 'common.yesterday' }
  if (dayDiff > 1 && dayDiff < 7) return { key: 'common.inDays', values: { count: dayDiff } }
  if (dayDiff < -1 && dayDiff > -7) return { key: 'common.daysAgo', values: { count: -dayDiff } }
  return { key: 'common.onDate' }
}

/**
 * "4 gün önce" style elapsed-time key for last-contact lines. Keys are plural
 * families so the caller resolves them with `plural`.
 */
export function elapsedKey(from: Date, now: Date): { key: string; count: number } {
  const minutes = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000))
  if (minutes < 1) return { key: 'common.elapsed.justNow', count: 0 }
  if (minutes < 60) return { key: 'common.elapsed.minutes', count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { key: 'common.elapsed.hours', count: hours }
  const days = Math.floor(hours / 24)
  if (days < 30) return { key: 'common.elapsed.days', count: days }
  const months = Math.floor(days / 30)
  if (months < 12) return { key: 'common.elapsed.months', count: months }
  return { key: 'common.elapsed.years', count: Math.floor(months / 12) }
}

/** Initials for an avatar. Handles Turkish casing (`i` → `İ`). */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0)
  if (parts.length === 0) return '?'
  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : ''
  return (first + last).toLocaleUpperCase('tr')
}
