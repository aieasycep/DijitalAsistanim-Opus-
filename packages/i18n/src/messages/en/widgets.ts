import type { MessageTree } from '../../engine.ts'

export const widgets = {
  title: 'Widgets',
  subtitle: 'Your day, without opening the app.',
  today: {
    name: 'Today',
    description: 'What you need to know right now.',
    empty: 'Nothing urgent.',
    itemCount: {
      one: '1 thing to know',
      other: '{count} things to know',
    },
  },
  nextMeeting: {
    name: 'Next meeting',
    description: 'Your next event and when it starts.',
    empty: 'Nothing scheduled.',
    startsIn: 'in {minutes} min',
    now: 'Now',
    at: 'at {time}',
  },
  briefing: {
    name: 'Briefing',
    description: 'The headline from your latest briefing.',
    empty: 'No briefing yet.',
    tapToRead: 'Tap to read',
  },
  commitments: {
    name: 'Commitments',
    description: 'What you owe and what is owed to you.',
    empty: 'Nothing open.',
    dueToday: {
      one: '1 due today',
      other: '{count} due today',
    },
  },
  inbox: {
    name: 'Important mail',
    description: 'Mail that needs you.',
    empty: 'Everything is under control.',
    count: {
      one: '1 needs you',
      other: '{count} need you',
    },
  },
  lockScreen: {
    name: 'Lock screen',
    description: 'A single line at a glance.',
  },
  liveActivity: {
    name: 'Live meeting',
    description: 'The meeting you are in, live.',
    inProgress: 'In progress',
    endsIn: 'ends in {minutes} min',
    join: 'Join',
  },
  sizes: {
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
  },
  setup: {
    title: 'Add a widget',
    ios: 'Press and hold the home screen, tap +, then find Digital Assistant.',
    android: 'Press and hold the home screen, tap Widgets, then find Digital Assistant.',
  },
  needsSignIn: 'Sign in to see your day.',
  updatedAt: 'Updated {time}',
} satisfies MessageTree
