import {
  APPROVAL_ACTION_TYPES,
  SOURCE_TYPES,
  type ApprovalActionType,
  type SourceType,
} from '@da/domain'
import { z } from 'zod'
import {
  approvalPayloadSchema,
  transcribeRequestSchema,
  transcribeResponseSchema,
} from '../api-schemas.ts'
import { isoInstantSchema, uuidSchema } from '../primitives.ts'

/**
 * The `assistant` group — `assistant-ask` and `transcribe`.
 *
 * This is the one group whose wire carries model output, so the contract has a
 * job the others do not: it decides what the model is *allowed* to have
 * decided.
 *
 * Four decisions:
 *
 *  1. **The model does not choose the write.** `assistant-ask` used to spread
 *     the free-form draft straight into `approval_actions.payload` as
 *     `{ kind: action.type, ...action.draft }` — a `draft.kind` of
 *     `email_send` therefore overrode a declared `task_create`, and nothing
 *     checked the fields either way. So a turn could pick which external write
 *     the user would be shown a card for, and the executor would then be handed
 *     a payload no schema had ever seen. `assistantProposedAction` re-asserts
 *     the declared type *over* the draft and parses the result against that
 *     type's own payload schema; the payload cannot be obtained without
 *     passing that check, which is why this is a transform and not a comment.
 *
 *  2. **A citation is a real record.** `sourceType` is the domain's
 *     `SourceType`, not the free string the client used to accept: it chooses
 *     the provenance chip's icon and the screen's route, so a value outside the
 *     enum is a chip that opens nothing. The function fills each citation from
 *     the retrieved chunk whose id the model cited, rather than from what the
 *     model wrote *about* that chunk — the id is the only part of a citation
 *     that can be verified, so the rest is taken from the record it names.
 *
 *  3. **The wire citation is a projection, not a stored `SourceRef`.** The
 *     transcript row keeps a full `SourceRef` (that is what
 *     `assistant_messages.citations` is documented to hold, and what the
 *     messages reader maps it back through), while the wire carries only the
 *     four fields the answer bubble uses. They are different shapes on purpose,
 *     and only one of them — this one — is a contract.
 *
 *  4. **`transcribe` is an alias, not a copy.** Its request and response
 *     schemas already live in `api-schemas.ts` and the edge function already
 *     imports them, so they are re-exported here under the group's naming
 *     convention. Re-declaring them would have created the second definition
 *     this module exists to abolish.
 */

/** The kind of record a citation points at. */
export const assistantSourceType = z.enum(SOURCE_TYPES) satisfies z.ZodType<SourceType>

/** The writes a turn is allowed to propose. It executes none of them. */
const approvalActionType = z.enum(APPROVAL_ACTION_TYPES) satisfies z.ZodType<ApprovalActionType>

// ── assistant-ask ───────────────────────────────────────────────────────────

export const assistantAskRequest = z.object({
  /**
   * The thread to continue. Null starts a new one, and the response says which
   * thread the turn actually landed in.
   */
  threadId: uuidSchema.nullable().default(null),
  question: z.string().min(1).max(2000),
  /** Voice turns keep the transcript only; audio is never uploaded or stored. */
  wasVoice: z.boolean().default(false),
})

export type AssistantAskRequest = z.infer<typeof assistantAskRequest>

/**
 * One source behind the answer.
 *
 * `label` is not `.min(1)`: an event with no title has no label to show, and
 * failing the whole turn over an empty chip would be a worse trade than a chip
 * that renders as its icon alone.
 */
export const assistantCitation = z.object({
  sourceType: assistantSourceType,
  /** The cited record's id, as retrieval returned it. */
  sourceId: z.string().min(1).max(100),
  label: z.string().max(160),
  occurredAt: isoInstantSchema.nullable(),
})

export type AssistantCitation = z.infer<typeof assistantCitation>

export const assistantAskResponse = z.object({
  /** The thread asked for, or the one created for this turn. */
  threadId: uuidSchema,
  /** The stored assistant message, which is what the screen keys the turn by. */
  messageId: uuidSchema,
  answer: z.string().min(1).max(4000),
  citations: z.array(assistantCitation).default([]),
  /**
   * The approval a proposed write is waiting behind — never a receipt for one
   * that happened. Null when the turn only answered.
   */
  proposedApprovalId: uuidSchema.nullable(),
  /**
   * False when no citation survived verification, whatever the model claimed
   * about itself. The answer bubble says so rather than presenting it as fact.
   */
  grounded: z.boolean(),
})

export type AssistantAskResponse = z.infer<typeof assistantAskResponse>

/**
 * A write the turn asked for, checked before it can become an approval.
 *
 * The declared `type` is authoritative and `draft` is model prose: `kind` is
 * written *after* the draft is spread, so a draft naming a different action is
 * parsed as the declared one — and fails there — instead of quietly switching
 * which external write the user is asked to approve.
 *
 * The caller is expected to have filled in the fields that are the server's to
 * know (which mailbox, which calendar, which stored event) before parsing:
 * the model is never given account ids, so a draft that had to supply one
 * could only ever have invented it.
 */
export const assistantProposedAction = z
  .object({
    type: approvalActionType,
    /** The approval card's headline. An untitled card is not a proposal. */
    what: z.string().min(1).max(200),
    why: z.string().min(1).max(300),
    draft: z.record(z.string(), z.unknown()),
  })
  .transform((value, ctx) => {
    const payload = approvalPayloadSchema.safeParse({ ...value.draft, kind: value.type })
    if (!payload.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['draft'],
        message: `draft does not satisfy the ${value.type} payload`,
      })
      return z.NEVER
    }
    return { type: value.type, what: value.what, why: value.why, payload: payload.data }
  })

export type AssistantProposedAction = z.infer<typeof assistantProposedAction>

// ── transcribe ──────────────────────────────────────────────────────────────

/** Base64 audio in. The bytes are forwarded and dropped, never stored. */
export const transcribeRequest = transcribeRequestSchema

export type TranscribeRequest = z.infer<typeof transcribeRequest>

/**
 * Text out. `provider` is null when no speech-to-text provider is configured,
 * which is the state in which the app hides the microphone rather than
 * offering a button that cannot work.
 */
export const transcribeResponse = transcribeResponseSchema

export type TranscribeResponse = z.infer<typeof transcribeResponse>
