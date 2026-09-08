import { OPS_TIME_ZONE, instantFromIstanbul } from '@/lib/format'

/**
 * The two conversions between an announcement's window and a `datetime-local`
 * input.
 *
 * `announcements.starts_at` and `.ends_at` are `timestamptz` — an instant, with
 * no zone of its own. A `<input type="datetime-local">` is a wall clock with no
 * zone at all. Something has to say which wall clock, and in this console the
 * answer is always Europe/Istanbul: every window an operator reads is an
 * Istanbul window, and a form that quietly used the browser's zone would
 * schedule a notice an hour out for anyone travelling.
 *
 * The hard direction — a wall-clock reading to an instant, across a possible
 * offset transition — is `instantFromIstanbul` in `@/lib/format`, which is
 * already the console's one implementation of that arithmetic. Only the easy
 * direction is written here, and it is written here rather than in `format.ts`
 * because `datetime-local`'s exact spelling is this module's concern.
 */

/** `2026-09-08T14:30` — what a `datetime-local` input reads and writes. */
const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: OPS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/**
 * An instant as the Istanbul wall clock spells it for a `datetime-local` input.
 *
 * Returns `''` for a missing or unparseable value, which is what an empty input
 * posts back — so a round trip through the form cannot invent a date.
 */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return ''

  const found: Record<string, number> = {}
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') found[part.type] = Number(part.value)
  }
  const year = found['year'] ?? 1970
  const month = found['month'] ?? 1
  const day = found['day'] ?? 1
  // `hour12: false` renders midnight as 24 in some ICU versions.
  const hour = (found['hour'] ?? 0) % 24
  const minute = found['minute'] ?? 0

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}`
}

/**
 * The instant at which an Istanbul wall-clock reading occurs, or null when the
 * string is not one.
 *
 * Null is the answer for anything malformed rather than a silently corrected
 * date: `2026-02-30T09:00` is not a moment, and a form that turned it into the
 * first of March would schedule a notice nobody chose.
 */
export function fromLocalInput(value: string): Date | null {
  const match = LOCAL_INPUT.exec(value.trim())
  if (match === null) return null

  // The groups are guaranteed by the pattern; the fallbacks are what makes that
  // guarantee survive `noUncheckedIndexedAccess` without an assertion, and an
  // empty string reads as zero, which the bounds below reject.
  const year = Number(match[1] ?? '')
  const month = Number(match[2] ?? '')
  const day = Number(match[3] ?? '')
  const hour = Number(match[4] ?? '')
  const minute = Number(match[5] ?? '')
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null

  const instant = instantFromIstanbul(year, month, day, hour, minute)
  // Round-trip through the zone: a date that does not exist comes back as a
  // different wall clock, and that mismatch is the rejection.
  return toLocalInput(instant.toISOString()) === match[0] ? instant : null
}

/** Now, rounded up to the next five minutes — a sane default start. */
export function nextRoundFiveMinutes(now: Date): Date {
  const step = 5 * 60_000
  return new Date(Math.ceil(now.getTime() / step) * step)
}
