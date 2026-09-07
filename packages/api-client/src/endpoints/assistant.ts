import type { AssistantMessage, AssistantThread, Locale } from '@da/domain'
import {
  assistantAskRequestSchema,
  assistantAskResponseSchema,
  transcribeRequestSchema,
  transcribeResponseSchema,
} from '@da/validation'
import type { z } from 'zod'
import { parseRequest } from '../http'
import { mapAssistantMessage, mapAssistantThread } from '../mappers'
import type {
  AssistantAnswer,
  AssistantMessageRow,
  AssistantThreadRow,
  EndpointContext,
} from '../types'

export type Transcription = z.infer<typeof transcribeResponseSchema>

export interface AssistantAskInput {
  threadId?: string | null
  question: string
  wasVoice?: boolean
}

export interface AssistantApi {
  ask(input: AssistantAskInput): Promise<AssistantAnswer>
  threads(input?: { limit?: number }): Promise<AssistantThread[]>
  messages(threadId: string): Promise<AssistantMessage[]>
  /** Voice in, text out: the audio is never stored, only the transcript. */
  transcribe(input: {
    audioBase64: string
    mimeType: string
    locale?: Locale
  }): Promise<Transcription>
}

export function createAssistantApi(ctx: EndpointContext): AssistantApi {
  return {
    async ask(input) {
      const request = parseRequest(assistantAskRequestSchema, {
        threadId: input.threadId ?? null,
        question: input.question,
        wasVoice: input.wasVoice ?? false,
      })
      const result = await ctx.http.callFunction(
        'assistant-ask',
        request,
        assistantAskResponseSchema,
        { retry: false, timeoutMs: 60_000 },
      )
      return {
        threadId: result.threadId,
        messageId: result.messageId,
        answer: result.answer,
        citations: result.citations,
        proposedApprovalId: result.proposedApprovalId,
        grounded: result.grounded,
      }
    },

    async threads(input = {}) {
      const rows = await ctx.db.selectMany<AssistantThreadRow>('assistant_threads', {
        order: { column: 'last_message_at', ascending: false },
        limit: input.limit ?? 50,
      })
      return rows.map(mapAssistantThread)
    },

    async messages(threadId) {
      const rows = await ctx.db.selectMany<AssistantMessageRow>('assistant_messages', {
        filters: [{ column: 'thread_id', op: 'eq', value: threadId }],
        order: { column: 'created_at', ascending: true },
      })
      return rows.map(mapAssistantMessage)
    },

    async transcribe(input) {
      const request = parseRequest(transcribeRequestSchema, {
        audioBase64: input.audioBase64,
        mimeType: input.mimeType,
        locale: input.locale ?? 'tr',
      })
      return ctx.http.callFunction('transcribe', request, transcribeResponseSchema, {
        retry: false,
        timeoutMs: 45_000,
      })
    },
  }
}
