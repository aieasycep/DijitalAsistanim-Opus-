import type { MessageTree } from '../../engine.ts'

export const notifications = {
  title: 'Notifications',
  subtitle: 'You decide when you want to be interrupted.',

  master: {
    label: 'Only if it is important',
    hint: 'Off means we notify you about more.',
    systemDisabled: 'Notifications are switched off in your device settings.',
    openSystemSettings: 'Open device settings',
  },

  category: {
    morning_briefing: 'Morning briefing',
    midday_pulse: 'Midday pulse',
    evening_close: 'Evening close',
    weekly_review: 'Weekly review',
    critical_email: 'Critical mail',
    meeting: 'Meeting reminders',
    deadline: 'Deadlines',
    follow_up: 'Follow-ups',
    life_event: 'Deliveries, flights and payments',
    approval: 'Actions waiting for approval',
  },
  categoryHint: {
    morning_briefing: 'The day’s summary, one notification each morning.',
    midday_pulse: 'What changed since this morning.',
    evening_close: 'Closing today and setting up tomorrow.',
    weekly_review: 'The week in summary.',
    critical_email: 'Mail you cannot afford to miss.',
    meeting: 'A heads-up before a meeting.',
    deadline: 'When a deadline is close.',
    follow_up: 'Threads that never got a reply.',
    life_event: 'When your parcel ships or your flight changes.',
    approval: 'When something is waiting for your approval.',
  },

  timing: {
    title: 'Timing',
    morningAt: 'Morning briefing time',
    middayAt: 'Midday pulse time',
    eveningAt: 'Evening close time',
    weeklyOn: 'Weekly review day',
    meetingLeadTime: 'Minutes before a meeting',
    deadlineLeadTime: 'Hours before a deadline',
  },

  quietHours: {
    title: 'Quiet hours',
    hint: 'Only VIPs and critical alerts come through during these hours.',
    enabled: 'Quiet hours on',
    from: 'From',
    to: 'To',
    allowVip: 'Let VIPs through quiet hours',
    allowCritical: 'Let critical alerts through quiet hours',
    weekendsToo: 'Apply at weekends too',
  },

  lockScreen: {
    title: 'Lock-screen privacy',
    full: 'Full content',
    title_only: 'Title only',
    generic: 'Generic',
    fullHint: 'The summary shows on the lock screen.',
    title_onlyHint: 'Only the subject shows.',
    genericHint: 'It says “You have a new notification”.',
  },

  bundling: {
    title: 'Bundling',
    hint: 'Notifications arriving together are collapsed into one.',
    enabled: 'Bundle notifications',
    maxPerDay: 'Maximum per day',
    maxPerDayHint: 'Anything over this waits for the next briefing.',
  },

  sound: {
    title: 'Sound and vibration',
    sound: 'Sound',
    vibration: 'Vibration',
    criticalSound: 'A different sound for critical alerts',
  },

  test: {
    action: 'Send a test notification',
    sent: 'Test notification sent.',
    body: 'This is what notifications look like.',
  },

  history: {
    title: 'Notification history',
    empty: 'No notifications sent yet.',
    sentAt: 'Sent {time}',
    opened: 'Opened',
  },

  permissionDenied:
    'Notification permission was not granted. You can turn it on in device settings.',
  saved: 'Your notification settings were saved.',
} satisfies MessageTree
