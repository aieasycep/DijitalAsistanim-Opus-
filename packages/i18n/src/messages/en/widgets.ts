import type { MessageTree } from '../../engine.ts'

export const widgets = {
  title: 'Widgets',
  subtitle: 'A glance from your home screen.',

  today: {
    name: 'Today',
    description: 'What you should know today.',
    count: {
      zero: 'Nothing urgent today',
      one: '1 thing today',
      other: '{count} things today',
    },
    empty: 'Everything is under control.',
  },
  nextUp: {
    name: 'Next up',
    description: 'Your next meeting or deadline.',
    startsAt: '{time}',
    inMinutes: 'in {count} min',
    now: 'Now',
    none: 'Nothing next',
  },
  briefing: {
    name: 'Briefing',
    description: 'The day’s summary, in your pocket.',
    ready: 'Your briefing is ready',
    notReady: 'Briefing being prepared',
    tapToOpen: 'Tap to open',
  },
  followUps: {
    name: 'Follow-ups',
    description: 'Threads waiting on a reply.',
    count: { zero: 'Nothing waiting', one: '1 waiting', other: '{count} waiting' },
  },
  approvals: {
    name: 'Approvals',
    description: 'Actions waiting for you.',
    count: { zero: 'Nothing waiting', one: '1 action waiting', other: '{count} actions waiting' },
  },
  capture: {
    name: 'Quick capture',
    description: 'Add a photo, a note or a link in one tap.',
    action: 'Capture',
  },

  size: {
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    lockScreen: 'Lock screen',
  },
  lastUpdated: '{time}',
  needsSignIn: 'Sign in required',
  offline: 'Offline',
  placeholderHint: 'Widget data refreshes in the background.',
  addHint: 'Long-press your home screen and pick the widget.',
} satisfies MessageTree
