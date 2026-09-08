import { APPROVAL_STATUSES, type ApprovalStatus } from '@da/domain'
import { z } from 'zod'
import { createApprovalRequestSchema, decideApprovalRequestSchema } from '../api-schemas.ts'
import { uuidSchema } from '../primitives.ts'
import { rowSchema } from './common.ts'

/**
 * The `approvals` group — `approval-create`, `approval-decide` and
 * `approval-retry`.
 *
 * This is the group where a drifting envelope is not a broken screen but a
 * broken promise: every write that leaves the app passes through here, so the
 * client's idea of "what happened" has to be the server's idea of it.
 *
 * Three decisions:
 *
 *  1. **The request bodies are aliases, not copies.** `api-schemas.ts` has
 *     always owned `createApprovalRequestSchema` and
 *     `decideApprovalRequestSchema`, and both are already imported by both
 *     sides. They are re-exported here under the contract's naming convention
 *     so a reader looking for the `approvals` wire shape finds all of it in one
 *     file — but they are the *same schema objects*. Re-declaring them would
 *     have created the second definition this module exists to abolish.
 *
 *  2. **A decision and a retry answer with the same shape.** Both end in
 *     `executeApproval`, so both return its result: the approval's new status
 *     in the state machine's own vocabulary, plus what the execution produced.
 *     `approvalDecideResponse` and `approvalRetryResponse` are one schema under
 *     two slug-named exports rather than two schemas that can disagree.
 *
 *  3. **Creation answers with the approval row itself.** The caller needs the
 *     new approval's id to route to its card — `proposeAndReview` does exactly
 *     that — so the envelope is pinned (`{ approval: … }`) and the row stays
 *     permissive, per the convention in `common.ts`.
 */

/**
 * The status the approval now holds, named by the domain state machine in
 * `@da/domain/approval.ts`. `satisfies` makes adding a state there a compile
 * error here rather than a silent parse failure at the boundary.
 */
const approvalStatusSchema = z.enum(APPROVAL_STATUSES) satisfies z.ZodType<ApprovalStatus>

/**
 * What an execution attempt produced.
 *
 * `status` is the approval's state *after* the attempt, which is why it is not
 * a boolean: a transient provider failure lands back on `approved` with a
 * `failureCode` and stays retryable, while a permanent one lands on `failed`.
 * `missingScopes` is non-empty exactly when the provider refused for want of a
 * consent the user has not granted yet, so the app can run step-up consent
 * instead of showing a dead end.
 */
export const approvalExecutionResult = z.object({
  approvalId: uuidSchema,
  status: approvalStatusSchema,
  /** The provider's id for what was created or sent; null when nothing was. */
  resultRef: z.string().nullable(),
  /** An `ErrorCode` the client localises — never an upstream provider string. */
  failureCode: z.string().nullable(),
  missingScopes: z.array(z.string()).default([]),
})

export type ApprovalExecutionResult = z.infer<typeof approvalExecutionResult>

// ── approval-create ─────────────────────────────────────────────────────────

/**
 * Propose an action. `discriminator` is folded into the idempotency key, so
 * two proposals of the same action converge on one approval rather than
 * queueing two sends.
 */
export const approvalCreateRequest = createApprovalRequestSchema

export type ApprovalCreateRequest = z.infer<typeof approvalCreateRequest>

/**
 * The proposal as it now stands — freshly inserted, or the one already holding
 * the idempotency key. Either way the caller gets a row it can route to.
 */
export const approvalCreateResponse = z.object({
  approval: rowSchema,
})

export type ApprovalCreateResponse = z.infer<typeof approvalCreateResponse>

// ── approval-decide ─────────────────────────────────────────────────────────

/**
 * Approve or reject. `editedPayload` carries the payload the user actually saw
 * and changed; the server re-checks it against the fields the action type
 * exposes before anything is sent.
 */
export const approvalDecideRequest = decideApprovalRequestSchema

export type ApprovalDecideRequest = z.infer<typeof approvalDecideRequest>

/**
 * Approving executes inline, so the answer is the execution's own result. A
 * rejection reports the same shape with `status: 'rejected'` and nothing else
 * filled in — there is no second acknowledgement shape for "refused".
 */
export const approvalDecideResponse = approvalExecutionResult

export type ApprovalDecideResponse = z.infer<typeof approvalDecideResponse>

// ── approval-retry ──────────────────────────────────────────────────────────

/** Re-run a failed execution. Only the approval id: the payload is already fixed. */
export const approvalRetryRequest = z.object({
  approvalId: uuidSchema,
})

export type ApprovalRetryRequest = z.infer<typeof approvalRetryRequest>

export const approvalRetryResponse = approvalExecutionResult

export type ApprovalRetryResponse = z.infer<typeof approvalRetryResponse>
