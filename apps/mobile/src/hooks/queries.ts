import { qk } from '@da/api-client'
import {
  type ApprovalStatus,
  type BriefingKind,
  type IsoDate,
  systemClock,
  toIsoDate,
} from '@da/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useApi } from '../providers/AppProviders'
import { useUserContext } from './useUserContext'

/**
 * The read layer.
 *
 * Every screen goes through one of these hooks rather than calling the API
 * client directly, so cache keys, stale windows and invalidation live in one
 * place. A screen that needed a bespoke fetch would be a sign the endpoint is
 * missing, not that the hook layer should be bypassed.
 */

export function useTodayFeed(forDate?: IsoDate) {
  const api = useApi()
  const { timeZone } = useUserContext()
  const date = forDate ?? toIsoDate(systemClock.now(), timeZone)

  return useQuery({
    queryKey: qk.today(date),
    queryFn: () => api.today.get({ forDate: date, timeZone }),
    // Today is the first thing seen after a cold start; a slightly stale render
    // that fills in beats an empty screen with a spinner.
    staleTime: 60_000,
  })
}

export function useBriefing(kind: BriefingKind, forDate?: IsoDate) {
  const api = useApi()
  const { timeZone } = useUserContext()
  const date = forDate ?? toIsoDate(systemClock.now(), timeZone)

  return useQuery({
    queryKey: qk.briefing(kind, date),
    queryFn: () => api.briefings.get({ kind, forDate: date }),
  })
}

export function useThreads(filter: Parameters<typeof qk.threads>[0]) {
  const api = useApi()
  return useQuery({
    queryKey: qk.threads(filter),
    queryFn: () => api.threads.list(filter),
  })
}

export function useThread(threadId: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: qk.thread(threadId ?? 'none'),
    queryFn: () => api.threads.get(threadId as string),
    enabled: Boolean(threadId),
  })
}

export function usePlan(range: 'day' | 'week', forDate?: IsoDate) {
  const api = useApi()
  const { timeZone } = useUserContext()
  const date = forDate ?? toIsoDate(systemClock.now(), timeZone)

  return useQuery({
    queryKey: qk.plan(range, date),
    queryFn: () => api.plan.get({ range, forDate: date, timeZone }),
  })
}

export function useCommitments() {
  const api = useApi()
  return useQuery({ queryKey: qk.commitments(), queryFn: () => api.commitments.list() })
}

export function useFollowUps() {
  const api = useApi()
  return useQuery({ queryKey: qk.followUps(), queryFn: () => api.followUps.list() })
}

export function useApprovals(status: ApprovalStatus | 'all' = 'pending') {
  const api = useApi()
  return useQuery({
    queryKey: qk.approvals(status),
    queryFn: () => api.approvals.list(status),
    // Approvals expire, so a stale list can offer an action that will fail.
    staleTime: 15_000,
  })
}

export function useMeetingPrep(eventId: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: qk.meetingPrep(eventId ?? 'none'),
    queryFn: () => api.meetings.prep(eventId as string),
    enabled: Boolean(eventId),
    // Prep costs a model call; do not re-fetch on every focus.
    staleTime: 10 * 60_000,
  })
}

export function useContacts() {
  const api = useApi()
  return useQuery({ queryKey: qk.contacts(), queryFn: () => api.people.list() })
}

export function usePerson(contactId: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: qk.person(contactId ?? 'none'),
    queryFn: () => api.people.get(contactId as string),
    enabled: Boolean(contactId),
  })
}

export function usePriorityRules() {
  const api = useApi()
  return useQuery({ queryKey: qk.priorityRules(), queryFn: () => api.rules.list() })
}

export function useLearnedPreferences() {
  const api = useApi()
  return useQuery({ queryKey: qk.learnedPreferences(), queryFn: () => api.rules.listLearned() })
}

export function usePreferences() {
  const api = useApi()
  return useQuery({ queryKey: qk.preferences(), queryFn: () => api.settings.getPreferences() })
}

export function useNotificationPreferences() {
  const api = useApi()
  return useQuery({
    queryKey: qk.notificationPrefs(),
    queryFn: () => api.settings.getNotificationPreferences(),
  })
}

export function useAccounts() {
  const api = useApi()
  return useQuery({ queryKey: qk.accounts(), queryFn: () => api.accounts.list() })
}

export function useSubscription() {
  const api = useApi()
  return useQuery({ queryKey: qk.subscription(), queryFn: () => api.subscription.get() })
}

export function useReferral() {
  const api = useApi()
  return useQuery({ queryKey: qk.referral(), queryFn: () => api.referral.getCode() })
}

export function useCaptures() {
  const api = useApi()
  return useQuery({ queryKey: qk.captures(), queryFn: () => api.captures.list() })
}

export function useCapture(captureId: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: qk.capture(captureId ?? 'none'),
    queryFn: () => api.captures.get(captureId as string),
    enabled: Boolean(captureId),
    // While analysis is running the row changes; poll until it settles.
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'analyzing' || status === 'queued' || status === 'uploading' ? 2000 : false
    },
  })
}

export function useAssistantThreads() {
  const api = useApi()
  return useQuery({ queryKey: qk.assistantThreads(), queryFn: () => api.assistant.listThreads() })
}

export function useAssistantMessages(threadId: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: qk.assistantMessages(threadId ?? 'none'),
    queryFn: () => api.assistant.listMessages(threadId as string),
    enabled: Boolean(threadId),
  })
}

export function useSearch(query: string, types: readonly string[]) {
  const api = useApi()
  const trimmed = query.trim()
  return useQuery({
    queryKey: qk.search(trimmed, types),
    queryFn: () => api.search.query({ query: trimmed, types: [...types] }),
    // Searching on every keystroke would bill a model call per character.
    enabled: trimmed.length >= 2,
  })
}

export function useLifeEvents() {
  const api = useApi()
  return useQuery({ queryKey: qk.lifeEvents(), queryFn: () => api.today.get().then((f) => f.lifeEvents) })
}

/**
 * Invalidate everything a write could have touched.
 *
 * Approving an action can create a task, move an event, send a mail and close a
 * follow-up, so the safe move after a mutation is to widen rather than to
 * enumerate — the queries are cheap and correctness matters more here.
 */
export function useInvalidateAfterWrite() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['today'] }),
      queryClient.invalidateQueries({ queryKey: ['approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['threads'] }),
      queryClient.invalidateQueries({ queryKey: ['plan'] }),
      queryClient.invalidateQueries({ queryKey: ['events'] }),
      queryClient.invalidateQueries({ queryKey: ['commitments'] }),
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    ])
  }, [queryClient])
}

export function useRefreshToday() {
  const queryClient = useQueryClient()
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['today'] }),
    [queryClient],
  )
}

/** Pull-to-refresh: refetch the active queries for a screen's key prefix. */
export function useRefresh(prefix: readonly unknown[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => queryClient.refetchQueries({ queryKey: [...prefix], type: 'active' }),
  })
}
