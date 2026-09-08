import { REPLY_TONES, type ReplyTone } from '@da/domain'
import { z } from 'zod'
import { replyDraftSchema } from '../ai-schemas.ts'
import { emailSendPayloadSchema } from '../api-schemas.ts'
import { uuidSchema } from '../primitives.ts'

/**
 * The `reply` group — `reply-draft`, and nothing else.
 *
 * Drafting is the only thing this group does. Sending is an approval, and the
 * user makes that call, so no schema here has a "send" in it.
 *
 * Four decisions, each of them a defect this file makes impossible:
 *
 *  1. **The draft is flat.** The function used to answer
 *     `{ draft: { subject, body, tone, openQuestions }, threadId, … }` while
 *     the client parsed `subject`/`body`/`tone` at the top level. Every draft
 *     request therefore failed at the boundary: the composer showed its error
 *     card, the body stayed empty and the approve button stayed disabled, so
 *     the feature had never worked in a shipped build. The wire is flat now,
 *     because that is what the screen reads.
 *
 *  2. **The model's fields are the model's.** `subject`, `body`, `tone` and
 *     `openQuestions` reuse `replyDraftSchema`'s own field schemas rather than
 *     restating their bounds, so the wire cannot promise a 500-character
 *     subject the model contract caps at 300.
 *
 *  3. **The addressing fields are the approval payload's.** A draft exists to
 *     become an `email_send` approval, so `connectedAccountId`, `to` and
 *     `inReplyToMessageId` are `emailSendPayloadSchema`'s own field schemas. A
 *     draft that could not be turned into an approval now fails where it is
 *     produced instead of when the user presses the button. This is also why
 *     the client no longer guesses the recipients from the thread's
 *     participants — that guess mailed the user their own reply and, with
 *     `inReplyToMessageId` hardcoded to null, started a new conversation
 *     instead of continuing the one on screen. The function reads the messages
 *     and knows who is being answered; it says so.
 *
 *  4. **"Grounded" is derived where the evidence is.** The client used to
 *     default it to `true`, so the "we left out what the source did not
 *     confirm" notice could never appear. It is now the server's reading of
 *     the model's own `openQuestions`: a draft with blanks left for the user
 *     is not a fully grounded draft, and the questions travel with it so the
 *     composer can show what was left open.
 *
 * `alternatives`, `approvalId` and the `asApproval` request flag are gone. No
 * function ever produced an alternative or an approval id — the client filled
 * both in from defaults — and `asApproval` was read only by the demo client,
 * which meant demo and live disagreed about whether asking for a draft could
 * queue an approval. The tone chips regenerate the draft, and `useApprovalFlow`
 * is the one path that creates an approval; both of those are real.
 */

/** The four voices a draft can be written in, as the domain names them. */
export const replyTone = z.enum(REPLY_TONES) satisfies z.ZodType<ReplyTone>

// ── reply-draft ─────────────────────────────────────────────────────────────

/**
 * The thread to answer, and how.
 *
 * `tone` defaults to `professional` — the same fallback the function's prompt
 * builder assumes — so a caller that has not asked for a voice still gets a
 * usable one rather than a 422.
 */
export const replyDraftRequest = z.object({
  threadId: uuidSchema,
  tone: replyTone.default('professional'),
  /** Free-text steer from the user, e.g. "cumaya kadar erteleyelim". */
  instruction: z.string().max(500).nullable().default(null),
})

export type ReplyDraftRequest = z.infer<typeof replyDraftRequest>

/**
 * A draft, plus everything the approval it becomes will need.
 *
 * Nothing here has been sent, stored or queued: the draft lives in the
 * composer until the user proposes it.
 */
export const replyDraftResponse = z.object({
  threadId: uuidSchema,
  /** The mailbox the reply would leave from — the thread's own account. */
  connectedAccountId: emailSendPayloadSchema.shape.connectedAccountId,
  subject: replyDraftSchema.shape.subject,
  body: replyDraftSchema.shape.body,
  /** The voice the model actually wrote in, which is what the approval records. */
  tone: replyDraftSchema.shape.tone,
  /** Whom the reply answers: at least one address, never the user's own. */
  to: emailSendPayloadSchema.shape.to,
  /** Keeps the reply in its conversation instead of starting a new one. */
  inReplyToMessageId: emailSendPayloadSchema.shape.inReplyToMessageId,
  /** What the model deliberately left for the user to fill in. */
  openQuestions: replyDraftSchema.shape.openQuestions,
  /** False when the draft leaves something open; drives the uncertainty notice. */
  grounded: z.boolean(),
})

export type ReplyDraftResponse = z.infer<typeof replyDraftResponse>
