import type { MessageTree } from '../../engine.ts'

export const vip = {
  title: 'VIPs',
  subtitle: 'The people whose messages you cannot miss.',
  explain: 'Anything from your VIPs is surfaced first and notified even during quiet hours.',

  add: 'Add a VIP',
  addPlaceholder: 'Search by name or email',
  remove: 'Remove from VIP',
  removeConfirm: 'Remove {name} from your VIP list?',

  list: {
    title: 'Your list',
    count: { zero: 'No VIPs yet', one: '1 VIP', other: '{count} VIPs' },
    limit: 'This plan allows up to {limit} VIPs.',
    limitReached: 'You have reached the VIP limit. Pro removes it.',
  },

  suggestion: {
    title: 'Suggested',
    hint: 'The people you write to most, and fastest.',
    reasonFrequent: 'You write to them often.',
    reasonFast: 'You usually reply to them quickly.',
    reasonManager: 'The pattern looks like a manager.',
    reasonMeeting: 'You meet regularly.',
    accept: 'Add',
    dismiss: 'No need',
  },

  behaviour: {
    title: 'How VIPs behave',
    alwaysNotify: 'Always notify',
    alwaysNotifyHint: 'Even during quiet hours.',
    alwaysTop: 'Always at the top of the flow',
    fastReplyReminder: 'Remind me if I have not replied',
    fastReplyHint: 'We will tell you if you have not replied within {hours} hours.',
  },

  added: '{name} was added to your VIP list.',
  removed: '{name} was removed from the list.',
  empty: 'Nobody is on your VIP list.',
  emptyHint: 'Your boss, your closest client, or your family.',
} satisfies MessageTree
