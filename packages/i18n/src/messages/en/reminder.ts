import type { MessageTree } from '../../engine.ts'

export const reminder = {
  title: 'Reminders',
  subtitle: 'The things you do not want to forget.',

  /** Chip labels shown in the "remind me" sheet. */
  options: {
    in30Minutes: 'In 30 minutes',
    in1Hour: 'In an hour',
    thisEvening: 'This evening',
    tomorrowMorning: 'Tomorrow morning',
    smart: 'At a good moment',
    custom: 'Pick a time',
  },

  /** Resolved-time explanations returned by `resolveReminderTime`. */
  preset: {
    in30Minutes: 'You will be reminded in 30 minutes.',
    in1Hour: 'You will be reminded in an hour.',
    thisEvening: 'You will be reminded this evening at {time}.',
    eveningPassed: 'The evening slot has passed, so it moved to tomorrow morning.',
    tomorrowMorning: 'You will be reminded tomorrow at {time}.',
    custom: 'Set for {date} at {time}.',
  },

  smart: {
    freeSlotToday: 'You are free at {time} today — we will remind you then.',
    freeSlotTomorrow: 'You are free at {time} tomorrow — we will remind you then.',
    nextFreeMorning: 'Your first free morning is {date}; we will remind you then.',
    explain: 'We look at your schedule and pick a moment that will not interrupt you.',
  },

  quietHoursShifted: 'It fell inside your quiet hours, so it moved to {time}.',
  beforeDeadline: 'You will be reminded {hours} hours before the deadline.',

  create: {
    title: 'Set a reminder',
    whatLabel: 'What should we remind you about?',
    whatPlaceholder: 'For example: send the proposal',
    whenLabel: 'When',
    customDate: 'Date',
    customTime: 'Time',
    save: 'Set',
    saved: 'Reminder set.',
  },

  card: {
    at: '{date} {time}',
    fires: 'Reminds you at {time}',
    fired: 'Reminded at {time}',
    linkedTo: 'Linked to',
    snoozedTo: 'Snoozed to {time}',
  },

  action: {
    edit: 'Edit',
    reschedule: 'Change the time',
    cancel: 'Cancel',
    done: 'Done',
    snooze15: 'Snooze 15 minutes',
    snooze1h: 'Snooze an hour',
    snoozeTomorrow: 'Snooze to tomorrow',
  },

  cancelled: 'Reminder cancelled.',
  updated: 'Reminder updated.',
  pastTime: 'We cannot set a reminder in the past.',
  count: { zero: 'No reminders set', one: '1 reminder', other: '{count} reminders' },
} satisfies MessageTree
