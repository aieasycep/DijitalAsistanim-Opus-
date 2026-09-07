import { qk } from '@da/api-client'
import type { SourceRef, SourceType } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { track } from '../lib/analytics'
import { useApi } from '../providers/AppProviders'
import { useInvalidateAfterWrite } from './queries'

export interface AssistantTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: SourceRef[]
  grounded: boolean
  proposedApprovalId: string | null
}

/**
 * The assistant conversation.
 *
 * Turns are held locally for the session and persisted server-side by the
 * endpoint, so the transcript survives a restart without the screen having to
 * manage two sources of truth. The user's own turn is appended optimistically
 * because a question that vanishes while the model thinks feels broken.
 */
export function useAssistant(): {
  messages: AssistantTurn[]
  threadId: string | null
  ask: (question: string, wasVoice?: boolean) => Promise<void>
  reset: () => void
  isAsking: boolean
  error: unknown
} {
  const api = useApi()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterWrite()
  const [messages, setMessages] = useState<AssistantTurn[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (input: { question: string; wasVoice: boolean }) =>
      api.assistant.ask({
        threadId,
        question: input.question,
        wasVoice: input.wasVoice,
      }),
    onSuccess: async (answer) => {
      setThreadId(answer.threadId)
      setMessages((current) => [
        ...current,
        {
          id: answer.messageId,
          role: 'assistant',
          content: answer.answer,
          citations: answer.citations.map((citation) => ({
            type: citation.sourceType as SourceType,
            id: citation.sourceId,
            label: citation.label,
            provider: null,
            personName: null,
            occurredAt: citation.occurredAt,
            externalUrl: null,
          })),
          grounded: answer.grounded,
          proposedApprovalId: answer.proposedApprovalId,
        },
      ])

      await queryClient.invalidateQueries({ queryKey: qk.assistantThreads() })
      // A turn can have produced a pending approval, which Today and the
      // approval centre both surface.
      if (answer.proposedApprovalId) await invalidate()
    },
  })

  const ask = useCallback(
    async (question: string, wasVoice = false) => {
      const trimmed = question.trim()
      if (!trimmed) return

      setMessages((current) => [
        ...current,
        {
          // Local id: the server's id for this turn is not needed to render it.
          id: `local-${current.length}-${trimmed.length}`,
          role: 'user',
          content: trimmed,
          citations: [],
          grounded: true,
          proposedApprovalId: null,
        },
      ])

      track('assistant_query', { voice: wasVoice ? 'voice' : 'typed' })
      await mutation.mutateAsync({ question: trimmed, wasVoice })
    },
    [mutation],
  )

  const reset = useCallback(() => {
    setMessages([])
    setThreadId(null)
    mutation.reset()
  }, [mutation])

  return {
    messages,
    threadId,
    ask,
    reset,
    isAsking: mutation.isPending,
    error: mutation.error,
  }
}
