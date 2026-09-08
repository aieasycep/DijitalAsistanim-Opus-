import type { ReplyTone } from '@da/domain'
import { replyDraftRequest, replyDraftResponse, type ReplyDraftResponse } from '@da/validation'
import { parseRequest } from '../http'
import type { EndpointContext } from '../types'

/** What the composer knows when it asks for a draft. */
export interface ReplyDraftInput {
  threadId: string
  /** Defaults to `professional`, the voice the function falls back to. */
  tone?: ReplyTone
  /** Free-text steer from the user, e.g. "cumaya kadar erteleyelim". */
  instruction?: string | null
}

export interface ReplyApi {
  /** Drafts only. Sending is an approval, and the user makes that call. */
  draft(input: ReplyDraftInput): Promise<ReplyDraftResponse>
}

export function createReplyApi(ctx: EndpointContext): ReplyApi {
  return {
    async draft(input) {
      const request = parseRequest(replyDraftRequest, {
        threadId: input.threadId,
        ...(input.tone === undefined ? {} : { tone: input.tone }),
        instruction: input.instruction ?? null,
      })
      // Drafting costs a model call, so a retry would spend the budget twice
      // for an answer the user is about to read and edit anyway.
      return ctx.http.callFunction('reply-draft', request, replyDraftResponse, {
        retry: false,
        timeoutMs: 45_000,
      })
    },
  }
}
