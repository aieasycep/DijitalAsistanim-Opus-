import type { AssistantMessage, AssistantThread, Locale } from '@da/domain'
import {
  assistantAskRequest,
  assistantAskResponse,
  transcribeRequest,
  transcribeResponse,
  type TranscribeResponse,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapAssistantMessage, mapAssistantThread } from '../mappers'
import type {
  AssistantAnswer,
  AssistantMessageRow,
  AssistantThreadRow,
  EndpointContext,
} from '../types'

/** Voice in, text out. The transcript is all that survives the round trip. */
export type Transcription = TranscribeResponse

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
    /**
     * The answer is returned as the contract parsed it, not field by field: a
     * hand-copied envelope is a second definition, and copying it here is how
     * the two sides drifted in the first place. The `AssistantAnswer` return
     * type is what makes a contract change that the app cannot consume a
     * compile error rather than an empty bubble.
     */
    async ask(input) {
      const request = parseRequest(assistantAskRequest, {
        threadId: input.threadId ?? null,
        question: input.question,
        wasVoice: input.wasVoice ?? false,
      })
      return ctx.http.callFunction('assistant-ask', request, assistantAskResponse, {
        retry: false,
        timeoutMs: 60_000,
      })
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
      const request = parseRequest(transcribeRequest, {
        audioBase64: input.audioBase64,
        mimeType: input.mimeType,
        locale: input.locale ?? 'tr',
      })
      return ctx.http.callFunction('transcribe', request, transcribeResponse, {
        retry: false,
        timeoutMs: 45_000,
      })
    },
  }
}
