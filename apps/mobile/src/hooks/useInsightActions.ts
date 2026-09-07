import type { Insight, InsightAction } from '@da/domain'
import { useMutation } from '@tanstack/react-query'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { isUrlAllowed } from '@da/validation'
import { useApi } from '../providers/AppProviders'
import { useInvalidateAfterWrite } from './queries'
import { reportError } from '../lib/error-reporting'

/**
 * Dispatch for an insight card's action buttons.
 *
 * Every action either navigates, opens a verified external URL, or performs a
 * purely local state change. Nothing here writes to a provider — anything with
 * an outside effect routes to the approval flow, which is what keeps the card's
 * quick actions safe to tap.
 */
export function useInsightActions(): {
  runAction: (insight: Insight, action: InsightAction) => Promise<void>
  isRunning: boolean
} {
  const api = useApi()
  const router = useRouter()
  const invalidate = useInvalidateAfterWrite()
  const [isRunning, setIsRunning] = useState(false)

  const completeMutation = useMutation({
    mutationFn: (insightId: string) => api.today.completeInsight(insightId),
    onSuccess: invalidate,
  })

  const dismissMutation = useMutation({
    mutationFn: (insightId: string) => api.today.dismissInsight(insightId),
    onSuccess: invalidate,
  })

  const runAction = useCallback(
    async (insight: Insight, action: InsightAction) => {
      setIsRunning(true)
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

          case 'create_task':
            router.push(
              `/approvals/new?type=task_create&title=${encodeURIComponent(insight.title)}` +
                `&sourceId=${encodeURIComponent(insight.source?.id ?? '')}`,
            )
            return

          case 'add_to_calendar':
            router.push(
              `/approvals/new?type=calendar_create&title=${encodeURIComponent(insight.title)}` +
                `&sourceId=${encodeURIComponent(insight.source?.id ?? '')}`,
            )
            return

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
      } catch (error) {
        reportError(error, { scope: 'insight_action', extra: { kind: action.kind } })
        throw error
      } finally {
        setIsRunning(false)
      }
    },
    [api, router, completeMutation, dismissMutation],
  )

  return {
    runAction,
    isRunning: isRunning || completeMutation.isPending || dismissMutation.isPending,
  }
}
