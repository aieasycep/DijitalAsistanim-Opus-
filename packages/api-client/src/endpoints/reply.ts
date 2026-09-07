import { REPLY_TONES } from '@da/domain'
import { uuidSchema } from '@da/validation'
import { z } from 'zod'
import type { EndpointContext, ReplyDraft, ReplyDraftInput } from '../types'

const replyDraftResponseSchema = z.object({
  threadId: uuidSchema,
  subject: z.string(),
  body: z.string(),
  tone: z.enum(REPLY_TONES),
  approvalId: uuidSchema.nullable().default(null),
  alternatives: z.array(z.object({ tone: z.enum(REPLY_TONES), body: z.string() })).default([]),
  grounded: z.boolean().default(true),
})

export interface ReplyApi {
  /** Drafts only. Sending is an approval, and the user makes that call. */
  draft(input: ReplyDraftInput): Promise<ReplyDraft>
}

export function createReplyApi(ctx: EndpointContext): ReplyApi {
  return {
    async draft(input) {
      const result = await ctx.http.callFunction(
        'reply-draft',
        {
          threadId: input.threadId,
          tone: input.tone,
          instruction: input.instruction ?? null,
          asApproval: input.asApproval ?? false,
        },
        replyDraftResponseSchema,
        { retry: false, timeoutMs: 45_000 },
      )
      return {
        threadId: result.threadId,
        subject: result.subject,
        body: result.body,
        tone: result.tone,
        approvalId: result.approvalId,
        alternatives: result.alternatives,
        grounded: result.grounded,
      }
    },
  }
}
