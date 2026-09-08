import { qk } from '@da/api-client'
import { AppError, MINUTE_MS, type Insight, type InsightAction, type IsoInstant } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { isUrlAllowed } from '@da/validation'
import { useT } from '../i18n/I18nProvider'
import { useApi } from '../providers/AppProviders'
import { useInvalidateAfterWrite } from './queries'
import { useApprovalFlow } from './useApprovalFlow'
import { useUserContext } from './useUserContext'
import { reportError } from '../lib/error-reporting'

/**
 * How long a calendar entry proposed from an insight runs.
 *
 * The insight knows *when* something is due, never how long it takes, and the
 * approval sheet cannot edit times — so the block is deliberately short enough
 * to be harmless if the user approves it unchanged.
 */
const INSIGHT_EVENT_MINUTES = 30

/** A parsed instant, or null for anything the model did not actually give us. */
function toInstant(value: string | undefined): IsoInstant | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

export interface InsightActionsApi {
  runAction: (insight: Insight, action: InsightAction) => Promise<void>
  /** The insight whose action is in flight, so its card can say so. */
  runningInsightId: string | null
  isRunning: boolean
  /** The last failure. Reported *and* returned, so the screen can render it. */
  error: unknown
  clearError: () => void
}

/**
 * Dispatch for an insight card's action buttons.
 *
 * Every action either navigates, opens a verified external URL, performs a
 * purely local state change, or proposes an approval. Nothing here writes to a
 * provider directly — anything with an outside effect goes through
 * `useApprovalFlow`, which is what keeps the card's quick actions safe to tap.
 *
 * `create_task` and `add_to_calendar` used to push `/approvals/new`, a route
 * with no file behind it, so both landed on the router's unmatched-route
 * screen. They now build the approval payload themselves and hand it to the
 * real flow, which creates the pending action and opens its card.
 */
export function useInsightActions(): InsightActionsApi {
  const api = useApi()
  const t = useT()
  const router = useRouter()
  const invalidate = useInvalidateAfterWrite()
  const { timeZone } = useUserContext()
  const { proposeAndReview, isProposing } = useApprovalFlow()
  const queryClient = useQueryClient()
  const [runningInsightId, setRunningInsightId] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  /**
   * The calendar an insight's event would land on.
   *
   * `calendarCreatePayloadSchema` wants a real uuid, so a guess or an empty
   * string fails validation before the request leaves the device. Primary
   * first, then any other connected calendar.
   *
   * Resolved on tap rather than subscribed to: this hook runs on Today, whose
   * whole design is one request on a cold start, and the answer is only needed
   * by one of ten actions. `fetchQuery` shares the cache with the screens that
   * do subscribe, so in practice the tap costs nothing.
   */
  const resolveCalendarAccountId = useCallback(async (): Promise<string | null> => {
    const accounts = await queryClient.fetchQuery({
      queryKey: qk.accounts(),
      queryFn: () => api.accounts.list(),
      staleTime: MINUTE_MS,
    })
    const usable = accounts.filter(
      (account) => account.status === 'connected' && account.kinds.includes('calendar'),
    )
    return (usable.find((account) => account.isPrimary) ?? usable[0])?.id ?? null
  }, [api, queryClient])

  const completeMutation = useMutation({
    mutationFn: (insightId: string) => api.today.completeInsight(insightId),
    onSuccess: invalidate,
  })

  const dismissMutation = useMutation({
    mutationFn: (insightId: string) => api.today.dismissInsight(insightId),
    onSuccess: invalidate,
  })

  const clearError = useCallback(() => setError(null), [])

  const runAction = useCallback(
    async (insight: Insight, action: InsightAction) => {
      setRunningInsightId(insight.id)
      setError(null)
      try {
        switch (action.kind) {
          case 'open_source': {
            const source = insight.source
            if (!source) return
            if (source.type === 'email') router.push(`/thread/${source.id}`)
            else if (source.type === 'calendar_event') router.push(`/event/${source.id}`)
            else if (source.type === 'capture') router.push(`/capture?id=${source.id}`)
            else if (source.type === 'contact') router.push(`/person/${source.id}`)
            else if (source.type === 'commitment') router.push(`/commitment/${source.id}`)
            return
          }

          case 'draft_reply': {
            const threadId = action.params.threadId ?? insight.source?.id
            if (threadId) router.push(`/thread/${threadId}?draft=1`)
            return
          }

          case 'create_task': {
            // A task needs no external account — `connectedAccountId` is
            // nullable and the executor resolves the user's task list — so the
            // proposal can always be built from the insight itself.
            await proposeAndReview({
              type: 'task_create',
              what: t('approval.actionType.task_create'),
              why: insight.reasonImportant ?? insight.title,
              sourceType: insight.source?.type ?? null,
              sourceId: insight.source?.id ?? null,
              discriminator: `insight:${insight.id}:task_create`,
              payload: {
                kind: 'task_create',
                connectedAccountId: null,
                title: insight.title,
                notes: insight.detail,
                dueAt: toInstant(action.params.dueAt) ?? insight.dueAt,
              },
            })
            return
          }

          case 'add_to_calendar': {
            // No calendar connected is not an error, it is a missing step: the
            // accounts screen is where it gets fixed.
            const calendarAccountId = await resolveCalendarAccountId()
            if (calendarAccountId === null) {
              router.push('/settings/accounts')
              return
            }
            const startsAt =
              toInstant(action.params.startsAt) ?? toInstant(action.params.dueAt) ?? insight.dueAt
            if (!startsAt) {
              // The approval sheet cannot edit an event's time, so inventing
              // one would put an hour the user never chose on their calendar.
              throw new AppError('validation_failed', {
                detail: 'add_to_calendar: no start instant on the insight or its action',
              })
            }
            // A model-supplied end that is not after the start is not an end.
            const supposedEnd = toInstant(action.params.endsAt)
            const endsAt =
              supposedEnd && Date.parse(supposedEnd) > Date.parse(startsAt)
                ? supposedEnd
                : new Date(Date.parse(startsAt) + INSIGHT_EVENT_MINUTES * MINUTE_MS).toISOString()
            await proposeAndReview({
              type: 'calendar_create',
              what: t('approval.actionType.calendar_create'),
              why: insight.reasonImportant ?? insight.title,
              sourceType: insight.source?.type ?? null,
              sourceId: insight.source?.id ?? null,
              discriminator: `insight:${insight.id}:calendar_create`,
              payload: {
                kind: 'calendar_create',
                connectedAccountId: calendarAccountId,
                title: insight.title,
                description: insight.detail,
                location: action.params.location ?? null,
                startsAt,
                endsAt,
                timeZone,
                attendees: [],
              },
            })
            return
          }

          case 'set_reminder':
            router.push(
              `/reminder?title=${encodeURIComponent(insight.title)}` +
                `&entityType=${insight.source?.type ?? 'user_input'}` +
                `&entityId=${encodeURIComponent(insight.source?.id ?? insight.id)}`,
            )
            return

          case 'prepare_meeting': {
            const eventId = action.params.eventId ?? insight.source?.id
            if (eventId) router.push(`/meeting/${eventId}`)
            return
          }

          case 'open_person': {
            const contactId = action.params.contactId
            if (contactId) router.push(`/person/${contactId}`)
            return
          }

          case 'track_shipment': {
            // The URL came from an extraction, so it is re-validated here rather
            // than trusted: an unchecked `Linking.openURL` would happily open a
            // `javascript:` or `file:` target.
            const url = action.params.url
            if (url && isUrlAllowed(url)) await Linking.openURL(url)
            return
          }

          case 'mark_done':
            await completeMutation.mutateAsync(insight.id)
            return

          case 'dismiss':
            await dismissMutation.mutateAsync(insight.id)
            return
        }
      } catch (caught) {
        // Surfaced, not rethrown: the caller is a tap handler, and an unhandled
        // rejection there is exactly how these failures used to disappear.
        reportError(caught, { scope: 'insight_action', extra: { kind: action.kind } })
        setError(caught)
      } finally {
        setRunningInsightId(null)
      }
    },
    [
      completeMutation,
      dismissMutation,
      proposeAndReview,
      resolveCalendarAccountId,
      router,
      t,
      timeZone,
    ],
  )

  return {
    runAction,
    runningInsightId,
    isRunning:
      runningInsightId !== null ||
      isProposing ||
      completeMutation.isPending ||
      dismissMutation.isPending,
    error,
    clearError,
  }
}
