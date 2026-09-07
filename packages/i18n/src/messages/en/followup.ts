import type { MessageTree } from '../../engine.ts'

export const followup = {
  title: 'Follow-ups',
  subtitle: 'So nothing unanswered slips past you.',
  noReplyYet: 'No reply yet.',

  section: {
    waitingOnOthers: 'You are waiting on',
    waitingOnYou: 'Waiting on you',
    overdue: 'Overdue',
    upcoming: 'Coming up',
  },

  card: {
    sentTo: 'Sent to {name}',
    sentOn: 'Sent on {date}',
    waitingFor: { one: 'Waiting 1 day', other: 'Waiting {count} days' },
    expectedBy: 'A reply was expected by {date}',
    lastNudge: 'Last nudged {time}',
    neverNudged: 'You have not nudged yet.',
  },

  reason: {
    questionAsked: 'You asked a question.',
    approvalRequested: 'You asked for approval.',
    deadlineMentioned: 'A date was given.',
    commitmentMade: 'They made a promise.',
    meetingProposed: 'You proposed a meeting.',
  },

  action: {
    nudge: 'Nudge politely',
    nudgeDraft: 'Draft a nudge',
    markResolved: 'Resolved',
    stopFollowing: 'Stop following',
    snooze: 'Snooze',
    openThread: 'Open the thread',
    remindMe: 'Remind me',
  },

  nudge: {
    title: 'Nudge draft',
    body: 'A short reminder with no pressure in it.',
    preview: 'Hi {name}, any thoughts on the below?',
    tooSoon: 'A little early. We would give it at least {days} days.',
  },

  resolved: 'Follow-up closed.',
  stopped: 'We will stop following this.',
  reopened: 'Follow-up reopened.',
  autoDetected: 'We picked this follow-up up from your mail.',
  count: {
    zero: 'Nothing waiting.',
    one: '1 follow-up waiting',
    other: '{count} follow-ups waiting',
  },
  overdueCount: { one: '1 follow-up overdue', other: '{count} follow-ups overdue' },
} satisfies MessageTree
