import type { MessageTree } from '../../engine.ts'

export const mail = {
  title: 'Mail Intelligence',
  subtitle: 'Your inbox has been read and sorted.',

  /** The six review buckets shown as tabs. */
  categories: {
    important: 'Important',
    awaitingYou: 'Waiting on you',
    awaitingOther: 'Waiting on them',
    deadline: 'With a deadline',
    info: 'For information',
    low: 'Low priority',
  },
  categoryHint: {
    important: 'What you should see today',
    awaitingYou: 'The other side is waiting for your reply',
    awaitingOther: 'You are waiting for a reply',
    deadline: 'Threads with a date in them',
    info: 'Worth knowing, nothing to do',
    low: 'Silenced — look if you want to',
  },

  /** Labels for the `EmailCategory` enum, keyed by its exact values. */
  category: {
    action_required: 'Needs action',
    waiting_for_user: 'Waiting on you',
    waiting_for_other: 'Waiting on them',
    deadline: 'Deadline',
    meeting: 'Meeting',
    travel: 'Travel',
    shipment: 'Delivery',
    payment: 'Payment',
    subscription: 'Subscription',
    security: 'Security',
    information: 'Information',
    promotion: 'Promotion',
  },

  summary: {
    scanned: { one: '1 message read today', other: '{count} messages read today' },
    surfaced: {
      zero: 'Nothing surfaced',
      one: '1 of them surfaced',
      other: '{count} of them surfaced',
    },
    silenced: {
      zero: 'Nothing silenced',
      one: '1 of them silenced',
      other: '{count} of them silenced',
    },
    unread: { zero: 'Nothing unread', one: '1 unread', other: '{count} unread' },
    line: '{scanned} messages read, {surfaced} of them mattered to you.',
  },

  thread: {
    messages: { one: '1 message', other: '{count} messages' },
    participants: { one: '1 person', other: '{count} people' },
    lastMessage: 'Last message {time}',
    from: 'From {name}',
    to: 'To {name}',
    hasAttachment: 'Has attachment',
    attachments: { one: '1 attachment', other: '{count} attachments' },
    unreadDot: 'Unread',
    muted: 'Muted',
  },

  sort: {
    title: 'Sort',
    priority: 'By importance',
    newest: 'Newest',
    oldest: 'Oldest',
    sender: 'By sender',
  },

  bulk: {
    markSeen: 'Mark as seen',
    mute: 'Mute',
    lowPriority: 'Move to low priority',
    selected: { one: '1 selected', other: '{count} selected' },
  },

  digest: {
    title: 'Silenced',
    body: 'We thought you did not need to see these. Tell us if we got it wrong.',
    action: 'Show them anyway',
  },

  triage: {
    why: 'Why this category?',
    changeCategory: 'Change category',
    changed: 'Category updated. We have learned from it.',
    confidenceLow: 'We are not fully sure about this classification.',
  },

  provider: {
    openInGmail: 'Open in Gmail',
    openInOutlook: 'Open in Outlook',
    openInMail: 'Open in Mail',
  },
} satisfies MessageTree
