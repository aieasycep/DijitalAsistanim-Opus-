import { type IsoInstant, MINUTE_MS, endOfLocalDay, startOfLocalDay } from './clock.ts'

/**
 * Calendar analysis: gaps, collisions, back-to-back runs and preparation
 * windows. Everything here is derived from event times the provider gave us —
 * travel time is *not* computed unless a real location and a configured route
 * provider are both present, which is handled by the caller, never guessed.
 */

export interface TimedEvent {
  id: string
  title: string
  startsAt: IsoInstant
  endsAt: IsoInstant
  isAllDay: boolean
  location: string | null
  attendeeCount: number
}

interface Interval {
  id: string
  title: string
  start: number
  end: number
  location: string | null
  attendeeCount: number
}

function toIntervals(events: TimedEvent[]): Interval[] {
  return events
    .filter((e) => !e.isAllDay)
    .map((e) => ({
      id: e.id,
      title: e.title,
      start: new Date(e.startsAt).getTime(),
      end: new Date(e.endsAt).getTime(),
      location: e.location,
      attendeeCount: e.attendeeCount,
    }))
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

export interface FreeBlock {
  startsAt: IsoInstant
  endsAt: IsoInstant
  minutes: number
}

/**
 * Gaps of at least `minMinutes` between `windowStart` and `windowEnd`.
 * Overlapping events are merged first, so a double-booked hour does not
 * masquerade as free time.
 */
export function findFreeBlocks(
  events: TimedEvent[],
  windowStart: Date,
  windowEnd: Date,
  minMinutes = 30,
): FreeBlock[] {
  const intervals = toIntervals(events)
  const merged: Array<{ start: number; end: number }> = []
  for (const i of intervals) {
    const last = merged[merged.length - 1]
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else merged.push({ start: i.start, end: i.end })
  }

  const blocks: FreeBlock[] = []
  let cursor = windowStart.getTime()
  for (const m of merged) {
    if (m.end <= cursor) continue
    if (m.start >= windowEnd.getTime()) break
    if (m.start - cursor >= minMinutes * MINUTE_MS) {
      blocks.push({
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(m.start).toISOString(),
        minutes: Math.round((m.start - cursor) / MINUTE_MS),
      })
    }
    cursor = Math.max(cursor, m.end)
  }
  if (windowEnd.getTime() - cursor >= minMinutes * MINUTE_MS) {
    blocks.push({
      startsAt: new Date(cursor).toISOString(),
      endsAt: windowEnd.toISOString(),
      minutes: Math.round((windowEnd.getTime() - cursor) / MINUTE_MS),
    })
  }
  return blocks
}

export interface CalendarConflict {
  kind: 'overlap' | 'back_to_back' | 'no_prep_time' | 'location_change'
  eventIds: string[]
  /** Minutes of overlap, or minutes of gap for the non-overlap kinds. */
  minutes: number
  /** i18n key describing the conflict. */
  messageKey: string
  values: Record<string, string | number>
}

/** Anything under this gap between meetings counts as back-to-back. */
export const BACK_TO_BACK_THRESHOLD_MINUTES = 5
/** A meeting with several attendees deserves at least this much prep runway. */
export const PREP_WINDOW_MINUTES = 15

export function detectConflicts(events: TimedEvent[]): CalendarConflict[] {
  const intervals = toIntervals(events)
  const conflicts: CalendarConflict[] = []

  for (let i = 0; i < intervals.length; i++) {
    const a = intervals[i]
    if (!a) continue
    for (let j = i + 1; j < intervals.length; j++) {
      const b = intervals[j]
      if (!b) continue
      if (b.start >= a.end) break

      const overlapMs = Math.min(a.end, b.end) - b.start
      if (overlapMs > 0) {
        conflicts.push({
          kind: 'overlap',
          eventIds: [a.id, b.id],
          minutes: Math.round(overlapMs / MINUTE_MS),
          messageKey: 'calendar.conflict.overlap',
          values: { first: a.title, second: b.title, minutes: Math.round(overlapMs / MINUTE_MS) },
        })
      }
    }

    const next = intervals[i + 1]
    if (!next || next.start < a.end) continue

    const gapMinutes = Math.round((next.start - a.end) / MINUTE_MS)

    if (gapMinutes <= BACK_TO_BACK_THRESHOLD_MINUTES) {
      conflicts.push({
        kind: 'back_to_back',
        eventIds: [a.id, next.id],
        minutes: gapMinutes,
        messageKey: 'calendar.conflict.backToBack',
        values: { first: a.title, second: next.title },
      })
    } else if (gapMinutes < PREP_WINDOW_MINUTES && next.attendeeCount > 2) {
      conflicts.push({
        kind: 'no_prep_time',
        eventIds: [a.id, next.id],
        minutes: gapMinutes,
        messageKey: 'calendar.conflict.noPrepTime',
        values: { title: next.title, minutes: gapMinutes },
      })
    }

    // A physical location change with almost no gap is worth flagging — but
    // only as "these are in different places", never as a travel-time estimate.
    if (
      a.location &&
      next.location &&
      a.location.trim() !== next.location.trim() &&
      gapMinutes < 30
    ) {
      conflicts.push({
        kind: 'location_change',
        eventIds: [a.id, next.id],
        minutes: gapMinutes,
        messageKey: 'calendar.conflict.locationChange',
        values: { from: a.location, to: next.location, minutes: gapMinutes },
      })
    }
  }

  return conflicts
}

export interface DayLoad {
  /** Total booked minutes, overlaps counted once. */
  bookedMinutes: number
  meetingCount: number
  longestFreeBlockMinutes: number
  backToBackRuns: number
  /** `light` < 2h, `moderate` < 5h, `heavy` beyond. */
  level: 'light' | 'moderate' | 'heavy'
}

export function summarizeDayLoad(events: TimedEvent[], day: Date, timeZone: string): DayLoad {
  const dayStart = startOfLocalDay(day, timeZone)
  const dayEnd = endOfLocalDay(day, timeZone)
  const intervals = toIntervals(events).filter(
    (i) => i.end > dayStart.getTime() && i.start < dayEnd.getTime(),
  )

  const merged: Array<{ start: number; end: number }> = []
  for (const i of intervals) {
    const last = merged[merged.length - 1]
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else merged.push({ start: i.start, end: i.end })
  }
  const bookedMinutes = merged.reduce((sum, m) => sum + (m.end - m.start) / MINUTE_MS, 0)

  const free = findFreeBlocks(
    events.filter((e) => intervals.some((i) => i.id === e.id)),
    dayStart,
    dayEnd,
    15,
  )
  const longestFreeBlockMinutes = free.reduce((max, b) => Math.max(max, b.minutes), 0)

  let backToBackRuns = 0
  for (let i = 0; i < intervals.length - 1; i++) {
    const a = intervals[i]
    const b = intervals[i + 1]
    if (!a || !b) continue
    if (b.start - a.end <= BACK_TO_BACK_THRESHOLD_MINUTES * MINUTE_MS && b.start >= a.end) {
      backToBackRuns++
    }
  }

  const hours = bookedMinutes / 60
  return {
    bookedMinutes: Math.round(bookedMinutes),
    meetingCount: intervals.length,
    longestFreeBlockMinutes,
    backToBackRuns,
    level: hours < 2 ? 'light' : hours < 5 ? 'moderate' : 'heavy',
  }
}

/**
 * A schedule proposal, e.g. "Yarın 14:00–16:30 arasında 2,5 saat boşluğun
 * var." The instant is real free time on the user's calendar; committing to it
 * still goes through an approval.
 */
export interface ScheduleSuggestion {
  startsAt: IsoInstant
  endsAt: IsoInstant
  minutes: number
  messageKey: string
  values: Record<string, string | number>
}

export function suggestFocusBlock(
  events: TimedEvent[],
  windowStart: Date,
  windowEnd: Date,
  desiredMinutes = 90,
): ScheduleSuggestion | null {
  const blocks = findFreeBlocks(events, windowStart, windowEnd, Math.min(30, desiredMinutes))
  if (blocks.length === 0) return null
  const best = blocks.reduce((a, b) => (b.minutes > a.minutes ? b : a))
  if (best.minutes < Math.min(30, desiredMinutes)) return null
  const useMinutes = Math.min(best.minutes, desiredMinutes)
  return {
    startsAt: best.startsAt,
    endsAt: new Date(new Date(best.startsAt).getTime() + useMinutes * MINUTE_MS).toISOString(),
    minutes: useMinutes,
    messageKey: 'plan.suggestion.focusBlock',
    values: { minutes: useMinutes },
  }
}
