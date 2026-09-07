import type { MessageTree } from '../../engine.ts'

export const today = {
  title: 'Today',
  greeting: {
    morning: 'Good morning, {name}',
    afternoon: 'Good afternoon, {name}',
    evening: 'Good evening, {name}',
  },
  hero: {
    count: {
      zero: 'Nothing urgent today.',
      one: 'There is 1 thing to know today.',
      other: 'There are {count} things to know today.',
    },
    subtitle: 'Read the briefing to see the whole picture.',
    openBriefing: 'Open briefing',
    listenBriefing: 'Listen',
  },
  sections: {
    now: 'Right now',
    priorities: 'Priorities',
    schedule: 'Schedule',
    expectedFromYou: 'Expected from you',
    waitingOnOthers: 'What you are waiting on',
    deadlines: 'Deadlines',
    personal: 'Personal',
    captures: 'Captures',
    approvals: 'Waiting for approval',
  },
  now: {
    inMeeting: 'You are in a meeting: {title}',
    nextMeeting: 'Next: {title}, {time}',
    freeUntil: 'Free until {time}',
    dayDone: 'Nothing left on the calendar today.',
    startsIn: 'Starts in {minutes} min',
    joinCall: 'Join',
  },
  load: {
    light: 'A light day',
    balanced: 'A balanced day',
    heavy: 'A full day',
    backToBack: 'Back-to-back meetings',
    meetingHours: '{hours} h in meetings',
    freeHours: '{hours} h of open time',
  },
  quickActions: {
    title: 'Quick actions',
    ask: 'Ask',
    capture: 'Capture',
    newReminder: 'Reminder',
    search: 'Search',
  },
  timeSaved: {
    title: 'Time saved',
    thisWeek: '{minutes} min this week',
    body: 'Reading, triage and drafts the assistant handled for you.',
  },
  refreshedAt: 'Updated {time}',
  pullToRefresh: 'Pull to refresh',
  seeFlow: 'See the full flow',
  seePlan: 'See your plan',
} satisfies MessageTree
