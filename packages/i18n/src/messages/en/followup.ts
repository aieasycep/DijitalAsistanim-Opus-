import type { MessageTree } from '../../engine.ts'

export const followup = {
  title: 'Follow-ups',
  subtitle: 'Conversations still waiting on an answer.',
  noReplyYet: 'No reply yet.',
  sections: {
    waitingOnOthers: 'Waiting on them',
    waitingOnYou: 'Waiting on you',
    overdue: 'Overdue',
    upcoming: 'Coming up',
  },
  sentAgo: 'Sent {elapsed}',
  waitingFor: 'Waiting for {name}',
  youOweReply: '{name} is waiting on you',
  dueAt: 'Nudge on {date}',
  overdueBy: 'Overdue by {duration}',
  actions: {
    nudge: 'Send a nudge',
    draftNudge: 'Draft a nudge',
    snooze: 'Snooze',
    markResolved: 'Resolved',
    stopFollowing: 'Stop following',
    openThread: 'Open conversation',
  },
  nudge: {
    title: 'Nudge',
    body: 'A short, polite reminder about your last message.',
    tone: 'Tone',
    generating: 'Drafting a nudge',
  },
  resolved: 'Marked resolved',
  stopped: 'We will stop following this one.',
  snoozed: 'Snoozed until {date}',
  detected: {
    question: 'You asked a question.',
    request: 'You made a request.',
    deadline: 'You set a date.',
    approval: 'You asked for approval.',
  },
  count: {
    one: '1 follow-up',
    other: '{count} follow-ups',
  },
} satisfies MessageTree
