import type { ApprovalStatus, BriefingKind, IsoDate } from '@da/domain'
import type { FlowFilter, PlanRange, ThreadFilter } from './types'

/**
 * One hierarchical key factory for the whole app: every cache read and every
 * invalidation names the same tuple, so nothing goes stale by accident.
 */
export const qk = {
  today: (date: IsoDate) => ['today', date] as const,

  briefings: () => ['briefings'] as const,
  briefing: (kind: BriefingKind, date: IsoDate) => ['briefings', kind, date] as const,

  flow: (filter: FlowFilter) => ['flow', filter] as const,
  threads: (filter: ThreadFilter) => ['threads', filter] as const,
  thread: (id: string) => ['threads', 'detail', id] as const,

  plan: (range: PlanRange, date: IsoDate) => ['plan', range, date] as const,
  events: (range: { from: IsoDate; to: IsoDate }) => ['events', range.from, range.to] as const,
  tasks: () => ['tasks'] as const,
  commitments: () => ['commitments'] as const,
  followUps: () => ['follow-ups'] as const,
  meetingPrep: (eventId: string) => ['meetings', 'prep', eventId] as const,

  assistantThreads: () => ['assistant', 'threads'] as const,
  assistantMessages: (threadId: string) => ['assistant', 'threads', threadId, 'messages'] as const,

  approvals: (status: ApprovalStatus | 'all') => ['approvals', status] as const,
  approval: (id: string) => ['approvals', 'detail', id] as const,

  captures: () => ['captures'] as const,
  capture: (id: string) => ['captures', 'detail', id] as const,

  contacts: () => ['contacts'] as const,
  person: (id: string) => ['contacts', 'detail', id] as const,
  vip: () => ['contacts', 'vip'] as const,

  priorityRules: () => ['rules', 'priority'] as const,
  learnedPreferences: () => ['rules', 'learned'] as const,

  search: (query: string, types: readonly string[]) => ['search', query, [...types]] as const,

  settings: () => ['settings'] as const,
  preferences: () => ['settings', 'preferences'] as const,
  notificationPrefs: () => ['settings', 'notifications'] as const,

  accounts: () => ['accounts'] as const,
  syncStatus: () => ['accounts', 'sync-status'] as const,

  subscription: () => ['subscription'] as const,
  referral: () => ['referral'] as const,

  insights: (date: IsoDate) => ['insights', date] as const,
  lifeEvents: () => ['life-events'] as const,
  exportStatus: () => ['privacy', 'export-status'] as const,
} as const

export type QueryKey = ReturnType<(typeof qk)[keyof typeof qk]>
