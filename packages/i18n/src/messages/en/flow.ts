import type { MessageTree } from '../../engine.ts'

export const flow = {
  title: 'Flow',
  subtitle: 'Everything arriving, in one stream.',
  filters: {
    all: 'All',
    important: 'Important',
    mail: 'Mail',
    calendar: 'Calendar',
    followup: 'Follow-up',
    personal: 'Personal',
  },
  groups: {
    now: 'Now',
    earlierToday: 'Earlier today',
    yesterday: 'Yesterday',
    thisWeek: 'This week',
    older: 'Older',
  },
  itemKind: {
    email: 'Mail',
    event: 'Event',
    task: 'Task',
    commitment: 'Commitment',
    followUp: 'Follow-up',
    lifeEvent: 'Personal',
    capture: 'Capture',
    approval: 'Approval',
  },
  badge: {
    new: 'New',
    urgent: 'Urgent',
    vip: 'VIP',
    deadline: 'Deadline',
    waiting: 'Waiting',
    overdue: 'Overdue',
  },
  swipe: {
    done: 'Done',
    snooze: 'Snooze',
    remind: 'Remind me',
    notImportant: 'Not important',
  },
  unreadCount: {
    one: '1 unread',
    other: '{count} unread',
  },
  loadMore: 'Load more',
  endOfList: 'You have reached the end.',
  newItems: {
    one: '1 new item',
    other: '{count} new items',
  },
  markAllRead: 'Mark all read',
  filterEmpty: 'Nothing matches this filter.',
} satisfies MessageTree
