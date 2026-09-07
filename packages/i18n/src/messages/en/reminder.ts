import type { MessageTree } from '../../engine.ts'

export const reminder = {
  title: 'Reminders',
  preset: {
    in30Minutes: 'In 30 minutes, at {time}',
    in1Hour: 'In 1 hour, at {time}',
    thisEvening: 'This evening at {time}',
    eveningPassed: 'The evening window has passed, so tomorrow morning at {time}',
    tomorrowMorning: 'Tomorrow morning at {time}',
    custom: 'At {time} on {date}',
  },
  smart: {
    freeSlotToday: 'You are free at {time} today — a good moment.',
    freeSlotTomorrow: 'You are free at {time} tomorrow — a good moment.',
    nextFreeMorning: 'Your next clear morning is {date} at {time}.',
  },
  quietHoursShifted: 'This falls inside your quiet hours, so we moved it to {time}.',
  beforeDeadline: '{duration} before the deadline, at {time}',
  options: {
    in30Minutes: 'In 30 minutes',
    in1Hour: 'In 1 hour',
    thisEvening: 'This evening',
    tomorrowMorning: 'Tomorrow morning',
    smart: 'At a good time',
    custom: 'Pick a time',
  },
  create: {
    title: 'Remind me',
    whatLabel: 'About what',
    whatPlaceholder: 'What should I remind you of?',
    whenLabel: 'When',
    save: 'Set reminder',
    created: 'Reminder set for {time}',
  },
  edit: {
    title: 'Edit reminder',
    reschedule: 'Change the time',
    saved: 'Reminder updated',
  },
  list: {
    upcoming: 'Coming up',
    past: 'Past',
    today: 'Today',
    tomorrow: 'Tomorrow',
    later: 'Later',
  },
  actions: {
    done: 'Done',
    snooze: 'Snooze',
    reschedule: 'Reschedule',
    delete: 'Delete',
    openSource: 'Open the source',
  },
  snoozeOptions: {
    tenMinutes: '10 minutes',
    thirtyMinutes: '30 minutes',
    oneHour: '1 hour',
    tomorrow: 'Tomorrow',
  },
  snoozed: 'Snoozed until {time}',
  deleted: 'Reminder deleted',
  fired: 'Reminder',
  count: {
    one: '1 reminder',
    other: '{count} reminders',
  },
  timePicker: {
    dateLabel: 'Date',
    timeLabel: 'Time',
    inPast: 'That time has already passed.',
  },
} satisfies MessageTree
