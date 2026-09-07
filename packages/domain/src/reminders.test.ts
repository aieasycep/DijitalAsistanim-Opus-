import { describe, expect, it } from 'vitest'
import { DAY_MS, HOUR_MS, toZonedParts } from './clock.ts'
import {
  DEFAULT_REMINDER_WINDOWS,
  findSmartReminderSlot,
  isWithinQuietHours,
  resolveReminderTime,
  shiftOutOfQuietHours,
  type BusyBlock,
  type ReminderWindowPreferences,
} from './reminders.ts'
import {
  evaluateFollowUp,
  followUpDueAt,
  followUpWaitHours,
  looksLikeReplyExpected,
  MAX_DISMISSALS,
  type FollowUpCandidate,
} from './follow-up.ts'

const IST = 'Europe/Istanbul'
const windows: ReminderWindowPreferences = {
  ...DEFAULT_REMINDER_WINDOWS,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
}

const local = (iso: string) => toZonedParts(new Date(iso), IST)

describe('quiet hours', () => {
  it('recognises a window that wraps past midnight', () => {
    const inside = (localHour: number) =>
      isWithinQuietHours(
        new Date(`2026-09-07T${String(localHour).padStart(2, '0')}:30:00+03:00`),
        IST,
        '22:00',
        '07:00',
      )
    expect(inside(23)).toBe(true)
    expect(inside(2)).toBe(true)
    expect(inside(6)).toBe(true)
    expect(inside(7)).toBe(false)
    expect(inside(12)).toBe(false)
    expect(inside(21)).toBe(false)
  })

  it('recognises a window inside a single day', () => {
    const napTime = new Date('2026-09-07T14:30:00+03:00')
    expect(isWithinQuietHours(napTime, IST, '14:00', '16:00')).toBe(true)
    expect(isWithinQuietHours(napTime, IST, '15:00', '16:00')).toBe(false)
  })

  it('is off when either end is unset', () => {
    const middleOfTheNight = new Date('2026-09-07T03:00:00+03:00')
    expect(isWithinQuietHours(middleOfTheNight, IST, null, '07:00')).toBe(false)
    expect(isWithinQuietHours(middleOfTheNight, IST, '22:00', null)).toBe(false)
  })

  it('treats an empty window as no quiet hours rather than always quiet', () => {
    expect(isWithinQuietHours(new Date(), IST, '22:00', '22:00')).toBe(false)
  })

  it('pushes a reminder to the moment quiet hours end', () => {
    const shifted = shiftOutOfQuietHours(
      new Date('2026-09-07T03:15:00+03:00'),
      IST,
      '22:00',
      '07:00',
    )
    expect(local(shifted.toISOString())).toMatchObject({ day: 7, hour: 7, minute: 0 })
  })

  it('pushes a late-evening reminder to the next morning, not the same one', () => {
    const shifted = shiftOutOfQuietHours(
      new Date('2026-09-07T23:30:00+03:00'),
      IST,
      '22:00',
      '07:00',
    )
    expect(local(shifted.toISOString())).toMatchObject({ day: 8, hour: 7 })
  })

  it('leaves a reminder outside the window untouched', () => {
    const daytime = new Date('2026-09-07T14:00:00+03:00')
    expect(shiftOutOfQuietHours(daytime, IST, '22:00', '07:00')).toEqual(daytime)
  })
})

describe('resolveReminderTime', () => {
  const now = new Date('2026-09-07T11:00:00+03:00')
  const resolve = (
    preset: Parameters<typeof resolveReminderTime>[0]['preset'],
    over: Partial<Parameters<typeof resolveReminderTime>[0]> = {},
  ) => resolveReminderTime({ preset, now, timeZone: IST, windows, ...over })

  it('resolves the fixed offsets exactly', () => {
    expect(new Date(resolve('in_30_minutes').remindAt).getTime() - now.getTime()).toBe(30 * 60_000)
    expect(new Date(resolve('in_1_hour').remindAt).getTime() - now.getTime()).toBe(HOUR_MS)
  })

  it('resolves "this evening" to the user’s own evening hour', () => {
    expect(local(resolve('this_evening').remindAt)).toMatchObject({ day: 7, hour: 19, minute: 0 })
  })

  it('does not silently mean "tomorrow" when the evening has already passed', () => {
    // A reminder labelled "this evening" that fires tomorrow evening is a lie,
    // so it degrades to "shortly" and says so.
    const lateNight = new Date('2026-09-07T21:30:00+03:00')
    const result = resolveReminderTime({
      preset: 'this_evening',
      now: lateNight,
      timeZone: IST,
      windows: DEFAULT_REMINDER_WINDOWS,
    })
    expect(result.explanationKey).toBe('reminder.preset.eveningPassed')
    expect(new Date(result.remindAt).getTime() - lateNight.getTime()).toBeLessThanOrEqual(
      2 * HOUR_MS,
    )
  })

  it('shifts a resolved time out of quiet hours and says that is why', () => {
    // The fallback above would land at 22:30, inside quiet hours. Waking
    // someone up wins over honouring the preset exactly.
    const lateNight = new Date('2026-09-07T21:30:00+03:00')
    const result = resolveReminderTime({
      preset: 'this_evening',
      now: lateNight,
      timeZone: IST,
      windows,
    })
    expect(result.explanationKey).toBe('reminder.quietHoursShifted')
    expect(local(result.remindAt)).toMatchObject({ day: 8, hour: 7 })
    expect(isWithinQuietHours(new Date(result.remindAt), IST, '22:00', '07:00')).toBe(false)
  })

  it('resolves "tomorrow morning" to the morning hour on the next local day', () => {
    expect(local(resolve('tomorrow_morning').remindAt)).toMatchObject({
      day: 8,
      hour: 8,
      minute: 0,
    })
  })

  it('explains every choice with an i18n key', () => {
    for (const preset of [
      'in_30_minutes',
      'in_1_hour',
      'this_evening',
      'tomorrow_morning',
    ] as const) {
      expect(resolve(preset).explanationKey).toMatch(/^reminder\./)
    }
  })

  it('refuses a custom preset with no time, rather than inventing one', () => {
    expect(() => resolve('custom')).toThrow(/customAt/)
    expect(() => resolve('custom', { customAt: 'tomorrow-ish' })).toThrow(/invalid customAt/)
  })

  it('honours an explicit custom time', () => {
    const at = '2026-09-09T13:45:00.000Z'
    expect(resolve('custom', { customAt: at }).remindAt).toBe(at)
  })

  it('never schedules a reminder past the deadline it is about', () => {
    const deadline = new Date(now.getTime() + 10 * 60_000).toISOString()
    const result = resolve('in_1_hour', { notLaterThan: deadline })
    expect(new Date(result.remindAt).getTime()).toBeLessThanOrEqual(new Date(deadline).getTime())
  })
})

describe('findSmartReminderSlot', () => {
  const busy = (start: string, end: string): BusyBlock => ({
    startsAt: `2026-09-07T${start}:00+03:00`,
    endsAt: `2026-09-07T${end}:00+03:00`,
  })

  it('picks a gap between meetings rather than during one', () => {
    const now = new Date('2026-09-07T09:00:00+03:00')
    const slot = findSmartReminderSlot(now, IST, windows, [
      busy('09:00', '11:00'),
      busy('11:30', '13:00'),
    ])
    const at = new Date(slot.remindAt).getTime()
    expect(at).toBeGreaterThanOrEqual(new Date('2026-09-07T11:00:00+03:00').getTime())
    expect(at).toBeLessThanOrEqual(new Date('2026-09-07T11:30:00+03:00').getTime())
    expect(slot.explanationKey).toMatch(/^reminder\.smart\./)
  })

  it('falls back to tomorrow when today has no room left', () => {
    const now = new Date('2026-09-07T09:00:00+03:00')
    const slot = findSmartReminderSlot(now, IST, windows, [busy('09:00', '19:00')])
    expect(local(slot.remindAt).day).toBe(8)
  })

  it('never proposes a slot inside quiet hours', () => {
    const lateNight = new Date('2026-09-07T23:00:00+03:00')
    const slot = findSmartReminderSlot(lateNight, IST, windows, [])
    expect(isWithinQuietHours(new Date(slot.remindAt), IST, '22:00', '07:00')).toBe(false)
  })
})

describe('follow-up timing', () => {
  const IST_FRIDAY = new Date('2026-09-04T15:00:00+03:00') // a Friday afternoon

  const candidate = (over: Partial<FollowUpCandidate> = {}): FollowUpCandidate => ({
    sentAt: IST_FRIDAY.toISOString(),
    expectsReply: true,
    importance: 'normal',
    recipientIsVip: false,
    dismissCount: 0,
    repliedAt: null,
    closedAt: null,
    ...over,
  })

  it('waits less for an important thread and less again for a VIP', () => {
    const normal = followUpWaitHours(candidate())
    const important = followUpWaitHours(candidate({ importance: 'high' }))
    const vip = followUpWaitHours(candidate({ importance: 'high', recipientIsVip: true }))
    expect(important).toBeLessThan(normal)
    expect(vip).toBeLessThan(important)
  })

  it('doubles its patience each time the user dismisses it', () => {
    const once = followUpWaitHours(candidate({ dismissCount: 1 }))
    const base = followUpWaitHours(candidate({ dismissCount: 0 }))
    expect(once).toBe(base * 2)
  })

  it('does not count the weekend as silence', () => {
    // A mail sent Friday afternoon is not overdue on Sunday morning.
    const due = followUpDueAt(candidate(), IST)
    expect(due).not.toBeNull()
    const dueDay = toZonedParts(new Date(due ?? ''), IST)
    expect([1, 2, 3, 4, 5]).toContain(dueDay.weekday)
  })

  it('has no due date when no reply is expected', () => {
    expect(followUpDueAt(candidate({ expectsReply: false }), IST)).toBeNull()
  })

  it('has no due date when the sent time is unreadable', () => {
    expect(followUpDueAt(candidate({ sentAt: 'whenever' }), IST)).toBeNull()
  })
})

describe('evaluateFollowUp', () => {
  const sentAt = new Date('2026-09-01T09:00:00+03:00').toISOString()
  const now = new Date('2026-09-07T09:00:00+03:00')

  const candidate = (over: Partial<FollowUpCandidate> = {}): FollowUpCandidate => ({
    sentAt,
    expectsReply: true,
    importance: 'normal',
    recipientIsVip: false,
    dismissCount: 0,
    repliedAt: null,
    closedAt: null,
    ...over,
  })

  it('surfaces a thread that has gone unanswered long enough', () => {
    const verdict = evaluateFollowUp(candidate(), now, IST)
    expect(verdict.shouldSurface).toBe(true)
    if (verdict.shouldSurface) expect(verdict.silentHours).toBeGreaterThan(24)
  })

  it.each([
    ['replied', { repliedAt: new Date('2026-09-02T09:00:00Z').toISOString() }],
    ['closed', { closedAt: new Date('2026-09-02T09:00:00Z').toISOString() }],
    ['no_reply_expected', { expectsReply: false }],
    ['dismissed_enough', { dismissCount: MAX_DISMISSALS }],
    ['too_soon', { sentAt: new Date(now.getTime() - HOUR_MS).toISOString() }],
  ])('stays quiet with reason %s', (reason, over) => {
    const verdict = evaluateFollowUp(candidate(over as Partial<FollowUpCandidate>), now, IST)
    expect(verdict).toEqual({ shouldSurface: false, reason })
  })

  it('stops asking after the user has dismissed it enough times', () => {
    // Nagging is the failure mode this whole feature has to avoid.
    for (let dismissals = 0; dismissals < MAX_DISMISSALS; dismissals++) {
      const verdict = evaluateFollowUp(
        candidate({
          dismissCount: dismissals,
          sentAt: new Date(now.getTime() - 30 * DAY_MS).toISOString(),
        }),
        now,
        IST,
      )
      expect(verdict.shouldSurface).toBe(true)
    }
    expect(
      evaluateFollowUp(candidate({ dismissCount: MAX_DISMISSALS }), now, IST).shouldSurface,
    ).toBe(false)
  })
})

describe('looksLikeReplyExpected', () => {
  it.each([
    'Ne dersin?',
    'Onayınızı bekliyorum.',
    'Geri dönüş yapabilir misiniz',
    'Could you take a look?',
    'Please confirm the date',
  ])('sees a request for an answer in %s', (text) => {
    expect(looksLikeReplyExpected(text)).toBe(true)
  })

  it.each([
    'Teşekkürler, elime ulaştı.',
    'Bilgine.',
    'Thanks, received.',
    'Toplantı notlarını ekliyorum.',
  ])('does not see one in %s', (text) => {
    expect(looksLikeReplyExpected(text)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(looksLikeReplyExpected('PLEASE CONFIRM')).toBe(true)
  })
})
