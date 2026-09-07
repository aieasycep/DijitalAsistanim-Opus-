import { qk } from '@da/api-client'
import type { ApprovalActionType, ApprovalPayload, SourceType } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { track } from '../lib/analytics'
import { useApi } from '../providers/AppProviders'
import { useInvalidateAfterWrite } from './queries'

/**
 * The single path from "the assistant wants to do something" to "it happened".
 *
 * Every screen that can trigger an external write goes through `propose`, which
 * creates a pending approval and opens its card. No screen ever calls an
 * execute endpoint directly — that is what makes "nothing is sent without your
 * approval" a property of the codebase rather than a promise in the copy.
 */

export interface ProposeInput {
  type: ApprovalActionType
  /** One line stating the change, e.g. "Ahmet Yılmaz'a yanıt gönder". */
  what: string
  /** Why the assistant is proposing it. */
  why: string
  payload: ApprovalPayload
  sourceType?: SourceType | null
  sourceId?: string | null
  /**
   * Stable discriminator folded into the idempotency key — usually the thread
   * or event id. Proposing the same action twice reuses the same approval
   * rather than stacking duplicates in the queue.
   */
  discriminator: string
}

export function useApprovalFlow() {
  const api = useApi()
  const router = useRouter()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterWrite()

  const proposeMutation = useMutation({
    mutationFn: (input: ProposeInput) =>
      api.approvals.create({
        type: input.type,
        what: input.what,
        why: input.why,
        payload: input.payload,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        discriminator: input.discriminator,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['approvals'] })
    },
  })

  const decideMutation = useMutation({
    mutationFn: (input: {
      approvalId: string
      decision: 'approve' | 'reject'
      editedPayload?: ApprovalPayload
    }) =>
      api.approvals.decide({
        approvalId: input.approvalId,
        decision: input.decision,
        ...(input.editedPayload ? { editedPayload: input.editedPayload } : {}),
      }),
    onSuccess: async (result, variables) => {
      track(variables.decision === 'approve' ? 'action_approved' : 'action_rejected')
      await queryClient.invalidateQueries({ queryKey: qk.approval(variables.approvalId) })
      await invalidate()
    },
  })

  const retryMutation = useMutation({
    mutationFn: (approvalId: string) => api.approvals.retry(approvalId),
    onSuccess: invalidate,
  })

  /** Create the approval and take the user straight to its card to decide. */
  const proposeAndReview = useCallback(
    async (input: ProposeInput) => {
      const approval = await proposeMutation.mutateAsync(input)
      router.push(`/approval/${approval.id}`)
      return approval
    },
    [proposeMutation, router],
  )

  return {
    propose: proposeMutation.mutateAsync,
    proposeAndReview,
    decide: decideMutation.mutateAsync,
    retry: retryMutation.mutateAsync,
    isProposing: proposeMutation.isPending,
    isDeciding: decideMutation.isPending,
    isRetrying: retryMutation.isPending,
    lastResult: decideMutation.data ?? null,
    error: proposeMutation.error ?? decideMutation.error ?? retryMutation.error ?? null,
  }
}
