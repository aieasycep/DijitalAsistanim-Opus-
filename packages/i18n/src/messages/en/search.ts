import type { MessageTree } from '../../engine.ts'

export const search = {
  title: 'Search',
  placeholder: 'Search mail, calendar, people, captures',
  cancel: 'Cancel',
  clear: 'Clear',
  recent: 'Recent searches',
  clearRecent: 'Clear history',
  suggestions: 'Suggestions',
  filters: {
    all: 'All',
    email: 'Mail',
    event: 'Calendar',
    person: 'People',
    task: 'Tasks',
    commitment: 'Commitments',
    capture: 'Captures',
  },
  dateRange: {
    label: 'Date range',
    anyTime: 'Any time',
    lastWeek: 'Last 7 days',
    lastMonth: 'Last 30 days',
    lastYear: 'Last year',
    custom: 'Custom range',
  },
  results: {
    count: {
      one: '1 result',
      other: '{count} results',
    },
    none: 'No results for “{query}”.',
    tip: 'Try fewer words or a wider date range.',
    semanticNote: 'Results are ranked by meaning, not just exact words.',
    inSection: 'in {section}',
  },
  askAssistant: 'Ask the assistant instead',
  askAssistantHint: 'Get an answer instead of a list.',
  loadMore: 'Load more',
  searching: 'Searching',
  failed: 'Search failed. Try again.',
} satisfies MessageTree
