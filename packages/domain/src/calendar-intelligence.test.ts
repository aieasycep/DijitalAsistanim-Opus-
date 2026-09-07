import { describe, expect, it } from 'vitest'
import {
  BACK_TO_BACK_THRESHOLD_MINUTES,
  detectConflicts,
  findFreeBlocks,
  summarizeDayLoad,
  suggestFocusBlock,
  type TimedEvent,
} from './calendar-intelligence.ts'

/**
 * What the plan screen and the morning briefing both read.
 *
 * The rule that matters: a gap is only free when nothing is in it. Reporting
 * an hour as free because two meetings overlap it, or proposing focus time on
 * top of an existing commitment, is worse than saying nothing.
 */

const IST = 'Europe/Istanbul'

const event = (
  id: string,
  startLocal: string,
  endLocal: string,
  over: Partial<TimedEvent> = {},
): TimedEvent => ({
  id,
  title: id,
  // Istanbul is UTC+3 all year, so the local time is written directly.
  startsAt: `2026-09-07T${startLocal}:00.000+03:00`,
  endsAt: `2026-09-07T${endLocal}:00.000+03:00`,
  isAllDay: false,
  location: null,
  attendeeCount: 2,
  ...over,
})

const localTime = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))

const windowStart = new Date('2026-09-07T09:00:00.000+03:00')
const windowEnd = new Date('2026-09-07T18:00:00.000+03:00')

describe('findFreeBlocks', () => {
  it('returns the whole window when nothing is scheduled', () => {
    const blocks = findFreeBlocks([], windowStart, windowEnd)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.minutes).toBe(540)
  })

  it('finds the gaps between meetings', () => {
    const blocks = findFreeBlocks(
      [event('a', '10:00', '11:00'), event('b', '14:00', '15:00')],
      windowStart,
      windowEnd,
    )
    expect(blocks.map((b) => [localTime(b.startsAt), localTime(b.endsAt)])).toEqual([
      ['09:00', '10:00'],
      ['11:00', '14:00'],
      ['15:00', '18:00'],
    ])
  })

  it('merges overlapping events instead of reporting the overlap as free', () => {
    // Two meetings 10–12 and 11–13 leave 13:00 as the next free moment, not
    // the 11–12 hour that both of them occupy.
    const blocks = findFreeBlocks(
      [event('a', '10:00', '12:00'), event('b', '11:00', '13:00')],
      windowStart,
      windowEnd,
    )
    expect(blocks.map((b) => localTime(b.startsAt))).toEqual(['09:00', '13:00'])
  })

  it('drops gaps shorter than the minimum', () => {
    const events = [event('a', '10:00', '11:00'), event('b', '11:10', '12:00')]
    expect(
      findFreeBlocks(events, windowStart, windowEnd, 30).map((b) => localTime(b.startsAt)),
    ).toEqual(['09:00', '12:00'])
    expect(
      findFreeBlocks(events, windowStart, windowEnd, 10).map((b) => localTime(b.startsAt)),
    ).toEqual(['09:00', '11:00', '12:00'])
  })

  it('ignores all-day events, which do not block the clock', () => {
    const blocks = findFreeBlocks(
      [event('holiday', '00:00', '23:59', { isAllDay: true })],
      windowStart,
      windowEnd,
    )
    expect(blocks).toHaveLength(1)
  })

  it('ignores an event with a broken or inverted time range', () => {
    const broken = event('bad', '12:00', '11:00')
    const unparseable = { ...event('worse', '10:00', '11:00'), startsAt: 'not-a-date' }
    expect(findFreeBlocks([broken, unparseable], windowStart, windowEnd)).toHaveLength(1)
  })

  it('clips an event that starts before or ends after the window', () => {
    const blocks = findFreeBlocks([event('early', '07:00', '10:00')], windowStart, windowEnd)
    expect(blocks.map((b) => localTime(b.startsAt))).toEqual(['10:00'])
  })

  it('returns nothing when the day is full', () => {
    expect(findFreeBlocks([event('all', '09:00', '18:00')], windowStart, windowEnd)).toEqual([])
  })
})

describe('detectConflicts', () => {
  it('finds nothing in a clean day', () => {
    expect(detectConflicts([event('a', '10:00', '11:00'), event('b', '14:00', '15:00')])).toEqual(
      [],
    )
  })

  it('reports an overlap with the minutes involved', () => {
    const conflicts = detectConflicts([event('a', '10:00', '11:00'), event('b', '10:30', '11:30')])
    const overlap = conflicts.find((c) => c.kind === 'overlap')
    expect(overlap).toMatchObject({ minutes: 30, messageKey: 'calendar.conflict.overlap' })
    expect(overlap?.eventIds.sort()).toEqual(['a', 'b'])
  })

  it('reports a full containment as an overlap', () => {
    const conflicts = detectConflicts([
      event('long', '10:00', '12:00'),
      event('short', '10:30', '11:00'),
    ])
    expect(conflicts.some((c) => c.kind === 'overlap' && c.minutes === 30)).toBe(true)
  })

  it('flags back-to-back meetings', () => {
    const conflicts = detectConflicts([event('a', '10:00', '11:00'), event('b', '11:00', '12:00')])
    expect(conflicts.some((c) => c.kind === 'back_to_back')).toBe(true)
  })

  it('does not flag a comfortable gap as back-to-back', () => {
    const gap = BACK_TO_BACK_THRESHOLD_MINUTES + 25
    const end = `11:${String(gap).padStart(2, '0')}`
    const conflicts = detectConflicts([event('a', '10:00', '11:00'), event('b', end, '12:00')])
    expect(conflicts.some((c) => c.kind === 'back_to_back')).toBe(false)
  })

  it('flags a location change with no travel time', () => {
    const conflicts = detectConflicts([
      event('a', '10:00', '11:00', { location: 'Levent ofis' }),
      event('b', '11:00', '12:00', { location: 'Kadıköy şube' }),
    ])
    expect(conflicts.some((c) => c.kind === 'location_change')).toBe(true)
  })

  it('does not flag a location change between two events in the same place', () => {
    const conflicts = detectConflicts([
      event('a', '10:00', '11:00', { location: 'Levent ofis' }),
      event('b', '11:00', '12:00', { location: 'Levent ofis' }),
    ])
    expect(conflicts.some((c) => c.kind === 'location_change')).toBe(false)
  })

  it('describes every conflict with an i18n key, never a sentence', () => {
    const conflicts = detectConflicts([
      event('a', '10:00', '11:00', { location: 'A' }),
      event('b', '10:45', '12:00', { location: 'B', attendeeCount: 8 }),
    ])
    expect(conflicts.length).toBeGreaterThan(0)
    for (const conflict of conflicts) {
      expect(conflict.messageKey).toMatch(/^(calendar|plan)\./)
    }
  })

  it('handles an empty calendar and a single event', () => {
    expect(detectConflicts([])).toEqual([])
    expect(detectConflicts([event('only', '10:00', '11:00')])).toEqual([])
  })
})

describe('summarizeDayLoad', () => {
  const day = new Date('2026-09-07T12:00:00.000+03:00')

  it('reports an empty day as light', () => {
    const load = summarizeDayLoad([], day, IST)
    expect(load.bookedMinutes).toBe(0)
    expect(load.meetingCount).toBe(0)
    expect(load.level).toBe('light')
  })

  it('counts booked time once, even where meetings overlap', () => {
    // Two meetings that overlap by an hour are not three hours of load.
    const load = summarizeDayLoad(
      [event('a', '10:00', '12:00'), event('b', '11:00', '13:00')],
      day,
      IST,
    )
    expect(load.bookedMinutes).toBe(180)
    expect(load.meetingCount).toBe(2)
  })

  it('counts meeting time and escalates the level as the day fills', () => {
    const light = summarizeDayLoad([event('a', '10:00', '11:00')], day, IST)
    const heavy = summarizeDayLoad(
      [
        event('a', '09:00', '11:00'),
        event('b', '11:30', '13:30'),
        event('c', '14:00', '16:00'),
        event('d', '16:30', '18:30'),
      ],
      day,
      IST,
    )
    expect(light.bookedMinutes).toBe(60)
    expect(light.level).toBe('light')
    expect(heavy.bookedMinutes).toBe(480)
    expect(heavy.level).toBe('heavy')
    expect(heavy.meetingCount).toBe(4)
  })

  it('ignores events on other days', () => {
    const tomorrow: TimedEvent = {
      ...event('x', '10:00', '11:00'),
      startsAt: '2026-09-08T10:00:00.000+03:00',
      endsAt: '2026-09-08T11:00:00.000+03:00',
    }
    expect(summarizeDayLoad([tomorrow], day, IST).bookedMinutes).toBe(0)
  })
})

describe('suggestFocusBlock', () => {
  it('proposes the longest free stretch', () => {
    const suggestion = suggestFocusBlock(
      [event('a', '09:30', '10:00'), event('b', '15:00', '15:30')],
      windowStart,
      windowEnd,
      60,
    )
    expect(suggestion).not.toBeNull()
    expect(localTime(suggestion?.startsAt ?? '')).toBe('10:00')
  })

  it('proposes nothing when no gap is long enough', () => {
    const packed = [
      event('a', '09:00', '11:00'),
      event('b', '11:15', '13:00'),
      event('c', '13:15', '18:00'),
    ]
    expect(suggestFocusBlock(packed, windowStart, windowEnd, 60)).toBeNull()
  })

  it('never proposes a block on top of an existing meeting', () => {
    const events = [event('a', '10:00', '12:00')]
    const suggestion = suggestFocusBlock(events, windowStart, windowEnd, 60)
    if (!suggestion) return
    const start = new Date(suggestion.startsAt).getTime()
    const end = new Date(suggestion.endsAt).getTime()
    for (const e of events) {
      const busyStart = new Date(e.startsAt).getTime()
      const busyEnd = new Date(e.endsAt).getTime()
      expect(start >= busyEnd || end <= busyStart).toBe(true)
    }
  })
})
