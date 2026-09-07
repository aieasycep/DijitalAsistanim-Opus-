import type { MessageTree } from '../../engine.ts'

export const search = {
  title: 'Search',
  placeholder: 'Search mail, meetings, people and notes',
  cancel: 'Cancel',
  clear: 'Clear',

  scope: {
    all: 'All',
    email: 'Mail',
    calendar_event: 'Events',
    task: 'Tasks',
    capture: 'Captures',
    commitment: 'Promises',
    contact: 'People',
    notification: 'Notifications',
    user_input: 'Notes',
  },

  results: {
    count: { zero: 'No results', one: '1 result', other: '{count} results' },
    in: 'in {scope}',
    took: '{ms} ms',
    showAll: 'See all results',
    loadMore: 'More results',
  },

  recent: {
    title: 'Recent searches',
    clear: 'Clear history',
    cleared: 'Search history cleared.',
  },

  suggestion: {
    title: 'Quick searches',
    unanswered: 'Mail waiting on a reply',
    thisWeekMeetings: 'This week’s meetings',
    deadlines: 'Deadlines coming up',
    fromVip: 'From your VIPs',
    withAttachments: 'With attachments',
  },

  filter: {
    title: 'Filters',
    from: 'From',
    to: 'To',
    dateRange: 'Date range',
    hasAttachment: 'Has an attachment',
    importance: 'Importance',
    unreadOnly: 'Unread only',
    apply: 'Apply',
    reset: 'Reset',
    active: { one: '1 filter on', other: '{count} filters on' },
  },

  semantic: {
    hint: 'Plain language works too: "the proposal we discussed last month".',
    matchedOn: 'Matched by meaning',
  },

  noResults: 'No results.',
  noResultsHint: 'Try a different word, or clear the filters.',
  offline: 'Offline, we can only search what is already downloaded.',
  error: 'The search could not be completed.',
} satisfies MessageTree
