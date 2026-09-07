import type { MessageTree } from '../../engine.ts'

export const person = {
  title: 'People',
  detailTitle: 'Person',
  sections: {
    overview: 'Overview',
    threads: 'Conversations',
    meetings: 'Meetings',
    commitments: 'Open between you',
    files: 'Shared files',
  },
  stats: {
    threads: {
      one: '1 conversation',
      other: '{count} conversations',
    },
    meetings: {
      one: '1 meeting',
      other: '{count} meetings',
    },
    lastContact: 'Last contact {elapsed}',
    firstContact: 'First contact {date}',
    avgResponse: 'They usually reply in {duration}',
    yourAvgResponse: 'You usually reply in {duration}',
    neverMet: 'You have not met yet.',
  },
  relationship: {
    frequent: 'You talk often',
    occasional: 'You talk sometimes',
    rare: 'Rarely in touch',
    fading: 'Quieter than it used to be',
  },
  actions: {
    email: 'Email',
    schedule: 'Schedule a meeting',
    markVip: 'Mark as VIP',
    unmarkVip: 'Remove from VIP',
    mute: 'Mute',
    unmute: 'Unmute',
    call: 'Call',
    openContact: 'Open in Contacts',
  },
  fields: {
    email: 'Email',
    phone: 'Phone',
    company: 'Company',
    role: 'Role',
    notes: 'Notes',
  },
  notesPlaceholder: 'Anything you want to remember about them',
  openItems: {
    youOwe: 'You owe them: {item}',
    theyOwe: 'They owe you: {item}',
    none: 'Nothing open between you.',
  },
  list: {
    frequent: 'People you talk to most',
    recent: 'Recent',
    vip: 'VIP',
    all: 'Everyone',
    searchPlaceholder: 'Search people',
  },
  vipBadge: 'VIP',
  mutedBadge: 'Muted',
} satisfies MessageTree
