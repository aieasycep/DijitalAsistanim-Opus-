import { systemClock, type Clock } from '@da/domain'
// Relative rather than `@/lib/format` so this module resolves in the unit-test
// runner as well as in the bundler: the range arithmetic is the least obvious
// code in the kit and it has to be testable outside a request.
import { OPS_TIME_ZONE, instantFromIstanbul, istanbulDate, parseIsoDate } from '../../lib/format.ts'

/**
 * The time window every dashboard, chart and log view is read through.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PRESET IS ITS OWN PARAMETER
 * ---------------------------------------------------------------------------
 *
 * The obvious design writes only two timestamps and infers the preset by
 * comparing them. It does not survive contact with "son 24 saat": the moment an
 * operator clicks it, the URL freezes an instant, and by the next render `now`
 * has moved, so the control that was just pressed no longer looks pressed and
 * the window silently stops being the last 24 hours.
 *
 * So `range` names the intent — `24h`, `7d`, `30d`, `90d` or `custom` — and the
 * server resolves it against the injected clock on every render. A rolling
 * window stays rolling, a bookmark keeps meaning "the last day" rather than
 * "that Tuesday", and there is nothing for two parameters to disagree about
 * because `from`/`to` are read only when `range=custom`.
 *
 * ---------------------------------------------------------------------------
 * THE WINDOW IS HALF-OPEN, AND IT IS AN ISTANBUL WINDOW
 * ---------------------------------------------------------------------------
 *
 * `[from, to)`. A row at exactly `to` belongs to the next window, so two
 * adjacent ranges partition the timeline instead of double-counting the
 * boundary row.
 *
 * A custom range is a range of Istanbul calendar days: `1–7 Eylül` starts at
 * 00:00 on the 1st and ends at 00:00 on the 8th, Istanbul. That is what an
 * operator means, and the control says so on screen — a window whose timezone
 * is unstated is a window two people will read differently.
 */

export const RANGE_PRESETS = ['24h', '7d', '30d', '90d'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

export type RangeSelection = RangePreset | 'custom'

/** Query parameter names. Overridable per page; these are the defaults. */
export const RANGE_PARAMS = {
  range: 'range',
  from: 'from',
  to: 'to',
} as const

export type RangeParamNames = { range: string; from: string; to: string }

const PRESET_HOURS: Readonly<Record<RangePreset, number>> = Object.freeze({
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
})

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** The longest window the console will resolve, custom or not. */
export const MAX_RANGE_DAYS = 366

export function isRangePreset(value: unknown): value is RangePreset {
  return typeof value === 'string' && (RANGE_PRESETS as readonly string[]).includes(value)
}

export interface ResolvedRange {
  /** Which control is pressed. */
  readonly selection: RangeSelection
  /** Inclusive start. */
  readonly from: Date
  /** Exclusive end. */
  readonly to: Date
  /** `from` as an ISO instant, ready for a `gte` filter. */
  readonly fromIso: string
  /** `to` as an ISO instant, ready for an `lt` filter. */
  readonly toIso: string
  /** Istanbul calendar dates, for the two date inputs. */
  readonly fromDate: string
  /** The last day *inside* the window — what an operator typed, not `to`. */
  readonly toDate: string
  /** Today in Istanbul: the furthest either input may go. */
  readonly today: string
  /** Set when the requested range was unusable and this one was substituted. */
  readonly correction: 'invalid_dates' | 'reversed' | 'too_long' | 'future' | null
}

function presetRange(preset: RangePreset, now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - PRESET_HOURS[preset] * HOUR_MS), to: now }
}

/** The Istanbul day after this one, as an instant — the exclusive end. */
function dayAfter(isoDate: string): Date | null {
  const parsed = parseIsoDate(isoDate)
  if (parsed === null) return null
  return instantFromIstanbul(parsed.year, parsed.month, parsed.day + 1, 0, 0, 0, 0)
}

function startOfDay(isoDate: string): Date | null {
  const parsed = parseIsoDate(isoDate)
  if (parsed === null) return null
  return instantFromIstanbul(parsed.year, parsed.month, parsed.day, 0, 0, 0, 0)
}

/**
 * Resolve the window from the query string.
 *
 * Total: every malformed, reversed, future or absurdly long input resolves to a
 * usable window and reports what it did in `correction`, so the page can say so
 * rather than rendering an empty table that looks like good news.
 */
export function resolveRange(
  query: Readonly<Record<string, string | undefined>>,
  options: {
    clock?: Clock
    fallback?: RangePreset
    params?: Partial<RangeParamNames>
  } = {},
): ResolvedRange {
  const clock = options.clock ?? systemClock
  const fallback = options.fallback ?? '7d'
  const names: RangeParamNames = { ...RANGE_PARAMS, ...options.params }
  const now = clock.now()
  const today = istanbulDate(now)

  const raw = query[names.range]
  if (raw !== 'custom') {
    const preset = isRangePreset(raw) ? raw : fallback
    const { from, to } = presetRange(preset, now)
    return finish(preset, from, to, today, null)
  }

  const fromRaw = query[names.from] ?? ''
  const toRaw = query[names.to] ?? ''
  let start = startOfDay(fromRaw)
  let end = dayAfter(toRaw)

  if (start === null || end === null) {
    const { from, to } = presetRange(fallback, now)
    return finish(fallback, from, to, today, 'invalid_dates')
  }

  let correction: ResolvedRange['correction'] = null

  if (start.getTime() >= end.getTime()) {
    // Typed backwards. Swapping is what the operator meant; refusing is not.
    const swappedStart = startOfDay(toRaw)
    const swappedEnd = dayAfter(fromRaw)
    if (swappedStart === null || swappedEnd === null) {
      const { from, to } = presetRange(fallback, now)
      return finish(fallback, from, to, today, 'invalid_dates')
    }
    start = swappedStart
    end = swappedEnd
    correction = 'reversed'
  }

  const tomorrow = dayAfter(today)
  if (tomorrow !== null && end.getTime() > tomorrow.getTime()) {
    end = tomorrow
    correction = correction ?? 'future'
  }

  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    start = new Date(end.getTime() - MAX_RANGE_DAYS * DAY_MS)
    correction = correction ?? 'too_long'
  }

  return finish('custom', start, end, today, correction)
}

function finish(
  selection: RangeSelection,
  from: Date,
  to: Date,
  today: string,
  correction: ResolvedRange['correction'],
): ResolvedRange {
  // `to` is exclusive, so the last day inside the window is the day before it.
  const lastInstant = new Date(to.getTime() - 1)
  return {
    selection,
    from,
    to,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    fromDate: istanbulDate(from),
    toDate: istanbulDate(lastInstant),
    today,
    correction,
  }
}

/** The zone every window in this console is measured in. */
export const RANGE_TIME_ZONE = OPS_TIME_ZONE
