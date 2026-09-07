import type { MessageTree } from '../../engine.ts'

export const person = {
  title: 'Person',
  contacts: 'People',
  searchPlaceholder: 'Search people',

  header: {
    lastContact: 'Last contact: {time}',
    neverContacted: 'You have not written to each other yet.',
    relationship: 'Relationship',
    company: 'Company',
    role: 'Role',
    email: 'Email',
    phone: 'Phone',
    vip: 'VIP',
    external: 'Outside your organisation',
  },

  stats: {
    title: 'Thread summary',
    threads: { zero: 'No threads', one: '1 thread', other: '{count} threads' },
    sent: { one: 'You sent 1 message', other: 'You sent {count} messages' },
    received: { one: 'You received 1 message', other: 'You received {count} messages' },
    meetings: { zero: 'No meetings', one: '1 meeting', other: '{count} meetings' },
    avgResponse: 'Your average reply time: {time}',
    theirAvgResponse: 'Their average reply time: {time}',
    busiestTopic: 'What you discuss most: {topic}',
  },

  section: {
    openItems: 'Open items',
    commitments: 'Promises both ways',
    recentThreads: 'Recent threads',
    upcomingMeetings: 'Upcoming meetings',
    pastMeetings: 'Past meetings',
    notes: 'Your notes',
    files: 'Shared files',
  },

  summary: {
    title: 'In short',
    lastTopic: 'You last talked about {topic}.',
    pendingFromYou: 'You owe them a reply on {count} things.',
    pendingFromThem: 'You are waiting on them for {count} things.',
    healthy: 'Nothing is open between you.',
    generate: 'Write a summary',
  },

  note: {
    add: 'Add a note',
    placeholder: 'What you want to remember about this person',
    saved: 'Note saved.',
    delete: 'Delete the note',
  },

  action: {
    draftEmail: 'Draft an email',
    scheduleMeeting: 'Propose a meeting',
    markVip: 'Make VIP',
    unmarkVip: 'Remove from VIP',
    mute: 'Mute',
    unmute: 'Unmute',
    openThreads: 'See all threads',
  },

  vipAdded: '{name} was added to your VIP list.',
  vipRemoved: '{name} was removed from your VIP list.',
  muted: '{name} is muted.',
  unmuted: '{name} is no longer muted.',
  privacyNote: 'Contact details are used only for your own device and account.',
} satisfies MessageTree
