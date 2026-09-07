import type { MessageTree } from '../../engine.ts'

export const mail = {
  title: 'Mail Intelligence',
  subtitle: 'Your inbox, sorted by what it asks of you.',
  categories: {
    important: 'Important',
    awaitingYou: 'Waiting on you',
    awaitingOther: 'Waiting on them',
    deadline: 'Has a deadline',
    info: 'Informational',
    low: 'Low priority',
  },
  categoryHint: {
    important: 'Needs you soon.',
    awaitingYou: 'Someone is waiting for your reply.',
    awaitingOther: 'You are waiting for a reply.',
    deadline: 'There is a date to meet.',
    info: 'Good to know, nothing to do.',
    low: 'Newsletters, promotions and noise.',
  },
  domainCategory: {
    action_required: 'Action required',
    waiting_for_user: 'Waiting on you',
    waiting_for_other: 'Waiting on them',
    deadline: 'Deadline',
    meeting: 'Meeting',
    travel: 'Travel',
    shipment: 'Shipment',
    payment: 'Payment',
    subscription: 'Subscription',
    security: 'Security',
    information: 'Information',
    promotion: 'Promotion',
  },
  counts: {
    total: {
      one: '1 conversation',
      other: '{count} conversations',
    },
    unread: {
      one: '1 unread',
      other: '{count} unread',
    },
    handled: '{count} handled by the assistant',
  },
  accounts: {
    all: 'All accounts',
    filterBy: 'Filter by account',
  },
  syncing: 'Syncing your mail',
  lastSync: 'Last synced {time}',
  syncNow: 'Sync now',
  triage: {
    title: 'Sorted for you',
    body: 'The assistant read {count} messages and surfaced {surfaced}.',
    lowSuppressed: '{count} low-priority messages were kept out of your way.',
    showSuppressed: 'Show them',
    hideSuppressed: 'Hide them',
  },
  thread: {
    participants: {
      one: '1 person',
      other: '{count} people',
    },
    messages: {
      one: '1 message',
      other: '{count} messages',
    },
    lastMessage: 'Last message {time}',
    hasAttachment: 'Has attachment',
    attachments: {
      one: '1 attachment',
      other: '{count} attachments',
    },
  },
  search: {
    placeholder: 'Search your mail',
    inCategory: 'in {category}',
  },
} satisfies MessageTree
