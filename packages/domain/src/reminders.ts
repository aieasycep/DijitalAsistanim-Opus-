import {
  addLocalDays,
  DAY_MS,
  HOUR_MS,
  type IsoInstant,
  MINUTE_MS,
  nextLocalTimeOccurrence,
  parseLocalTime,
  toZonedParts,
  zonedTimeToUtc,
} from './clock.ts'
import type { ReminderPreset } from './entities.ts'

/**
 * One reminder-time calculator, shared by every surface that offers "remind
 * me" — email detail, insight cards, capture results, the assistant, post
 * meeting. Presets resolve to a concrete instant here so the approval card can
 * show the user exactly when they will be nudged before anything is scheduled.
 */

export interface ReminderWindowPreferences {
  /** Start of the user's evening, e.g. `19:00`. */
  eveningTime: string
  /** Start of the user's morning, e.g. `08:00`. */
  morningTime: string
  quietHoursStart: string | null
  quietHoursEnd: string | null
}

export const DEFAULT_REMINDER_WINDOWS: ReminderWindowPreferences = {
  eveningTime: '19:00',
  morningTime: '08:00',
  quietHoursStart: null,
  quietHoursEnd: null,
}

export interface BusyBlock {
  startsAt: IsoInstant
  endsAt: IsoInstant
}

export interface ResolveReminderInput {
  preset: ReminderPreset
  now: Date
  timeZone: string
  windows: ReminderWindowPreferences
  /** Required for `custom`. */
  customAt?: IsoInstant
  /** Calendar events consulted by the `smart` preset. */
  busy?: BusyBlock[]
  /** Hard ceiling — a reminder about a deadline never fires after it. */
  notLaterThan?: IsoInstant | null
}

export interface ResolvedReminder {
  remindAt: IsoInstant
  /** i18n key explaining the choice, e.g. "toplantılar arasındaki ilk boşluk". */
  explanationKey: string
  values?: Record<string, string | number>
}

/**
 * True when `instant` falls inside the user's quiet hours. Windows that wrap
 * past midnight (22:00 → 07:00) are handled by testing the union of the two
 * spans rather than a single interval.
 */
export function isWithinQuietHours(
  instant: Date,
  timeZone: string,
  start: string | null,
  end: string | null,
): boolean {
  if (!start || !end) return false
  const p = toZonedParts(instant, timeZone)
  const minutes = p.hour * 60 + p.minute
  const s = parseLocalTime(start)
  const e = parseLocalTime(end)
  const startMin = s.hour * 60 + s.minute
  const endMin = e.hour * 60 + e.minute
  if (startMin === endMin) return false
  return startMin < endMin
    ? minutes >= startMin && minutes < endMin
    : minutes >= startMin || minutes < endMin
}

/** Push an instant forward to the first moment quiet hours are over. */
export function shiftOutOfQuietHours(
  instant: Date,
  timeZone: string,
  start: string | null,
  end: string | null,
): Date {
  if (!isWithinQuietHours(instant, timeZone, start, end) || !end) return instant
  return nextLocalTimeOccurrence(new Date(instant.getTime() - 1), end, timeZone)
}

/**
 * The `smart` preset: pick the first gap of at least 15 minutes inside the
 * user's waking hours, skipping anything already on the calendar. Falls back
 * to "tomorrow morning" when today has no room left.
 */
export function findSmartReminderSlot(
  now: Date,
  timeZone: string,
  windows: ReminderWindowPreferences,
  busy: BusyBlock[],
): ResolvedReminder {
  const SLOT_MS = 15 * MINUTE_MS
  const morning = parseLocalTime(windows.morningTime)
  const evening = parseLocalTime(windows.eveningTime)

  const blocks = busy
    .map((b) => ({ start: new Date(b.startsAt).getTime(), end: new Date(b.endsAt).getTime() }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start)

  // Search today first, then tomorrow — two days is enough for a reminder.
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const dayAnchor = dayOffset === 0 ? now : addLocalDays(now, 1, timeZone)
    const p = toZonedParts(dayAnchor, timeZone)
    const dayStart = zonedTimeToUtc(
      { year: p.year, month: p.month, day: p.day, hour: morning.hour, minute: morning.minute },
      timeZone,
    )
    const dayEnd = zonedTimeToUtc(
      { year: p.year, month: p.month, day: p.day, hour: evening.hour, minute: evening.minute },
      timeZone,
    )

    // Never propose a time in the past, and leave a few minutes of lead-in.
    let cursor = Math.max(dayStart.getTime(), now.getTime() + 10 * MINUTE_MS)

    for (const block of blocks) {
      if (block.end <= cursor) continue
      if (block.start >= dayEnd.getTime()) break
      if (block.start - cursor >= SLOT_MS) {
        const candidate = shiftOutOfQuietHours(
          new Date(cursor),
          timeZone,
          windows.quietHoursStart,
          windows.quietHoursEnd,
        )
        if (candidate.getTime() + SLOT_MS <= block.start) {
          return {
            remindAt: candidate.toISOString(),
            explanationKey:
              dayOffset === 0 ? 'reminder.smart.freeSlotToday' : 'reminder.smart.freeSlotTomorrow',
          }
        }
      }
      cursor = Math.max(cursor, block.end)
    }

    if (dayEnd.getTime() - cursor >= SLOT_MS) {
      const candidate = shiftOutOfQuietHours(
        new Date(cursor),
        timeZone,
        windows.quietHoursStart,
        windows.quietHoursEnd,
      )
      if (candidate.getTime() + SLOT_MS <= dayEnd.getTime()) {
        return {
          remindAt: candidate.toISOString(),
          explanationKey:
            dayOffset === 0 ? 'reminder.smart.freeSlotToday' : 'reminder.smart.freeSlotTomorrow',
        }
      }
    }
  }

  // Both days are full — fall back to the start of the day after tomorrow.
  const fallbackDay = addLocalDays(now, 2, timeZone)
  const fp = toZonedParts(fallbackDay, timeZone)
  return {
    remindAt: zonedTimeToUtc(
      { year: fp.year, month: fp.month, day: fp.day, hour: morning.hour, minute: morning.minute },
      timeZone,
    ).toISOString(),
    explanationKey: 'reminder.smart.nextFreeMorning',
  }
}

export function resolveReminderTime(input: ResolveReminderInput): ResolvedReminder {
  const { preset, now, timeZone, windows } = input
  let resolved: ResolvedReminder

  switch (preset) {
    case 'in_30_minutes':
      resolved = {
        remindAt: new Date(now.getTime() + 30 * MINUTE_MS).toISOString(),
        explanationKey: 'reminder.preset.in30Minutes',
      }
      break

    case 'in_1_hour':
      resolved = {
        remindAt: new Date(now.getTime() + HOUR_MS).toISOString(),
        explanationKey: 'reminder.preset.in1Hour',
      }
      break

    case 'this_evening': {
      const evening = nextLocalTimeOccurrence(now, windows.eveningTime, timeZone)
      // "This evening" past the evening hour means tonight has gone; the next
      // occurrence would be tomorrow, which is not what the label promised, so
      // fall back to an hour from now.
      const stillToday = evening.getTime() - now.getTime() < DAY_MS / 2
      resolved = stillToday
        ? { remindAt: evening.toISOString(), explanationKey: 'reminder.preset.thisEvening' }
        : {
            remindAt: new Date(now.getTime() + HOUR_MS).toISOString(),
            explanationKey: 'reminder.preset.eveningPassed',
          }
      break
    }

    case 'tomorrow_morning': {
      const tomorrow = addLocalDays(now, 1, timeZone)
      const p = toZonedParts(tomorrow, timeZone)
      const m = parseLocalTime(windows.morningTime)
      resolved = {
        remindAt: zonedTimeToUtc(
          { year: p.year, month: p.month, day: p.day, hour: m.hour, minute: m.minute },
          timeZone,
        ).toISOString(),
        explanationKey: 'reminder.preset.tomorrowMorning',
      }
      break
    }

    case 'smart':
      resolved = findSmartReminderSlot(now, timeZone, windows, input.busy ?? [])
      break

    case 'custom': {
      if (!input.customAt) throw new Error('resolveReminderTime: custom preset requires customAt')
      const at = new Date(input.customAt)
      if (Number.isNaN(at.getTime())) {
        throw new Error(`resolveReminderTime: invalid customAt "${input.customAt}"`)
      }
      resolved = { remindAt: at.toISOString(), explanationKey: 'reminder.preset.custom' }
      break
    }
  }

  // Quiet hours apply to every preset except an explicit custom time — if the
  // user picked 02:00 themselves, that is what they meant.
  if (preset !== 'custom') {
    const shifted = shiftOutOfQuietHours(
      new Date(resolved.remindAt),
      timeZone,
      windows.quietHoursStart,
      windows.quietHoursEnd,
    )
    if (shifted.toISOString() !== resolved.remindAt) {
      resolved = { remindAt: shifted.toISOString(), explanationKey: 'reminder.quietHoursShifted' }
    }
  }

  // Never fire after the thing being remembered has already passed.
  if (input.notLaterThan) {
    const ceiling = new Date(input.notLaterThan)
    if (!Number.isNaN(ceiling.getTime()) && new Date(resolved.remindAt) > ceiling) {
      const before = new Date(
        Math.max(now.getTime() + MINUTE_MS, ceiling.getTime() - 30 * MINUTE_MS),
      )
      resolved = { remindAt: before.toISOString(), explanationKey: 'reminder.beforeDeadline' }
    }
  }

  return resolved
}
