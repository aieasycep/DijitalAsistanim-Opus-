import type { CommitmentDirection, SourceType } from '@da/domain'
import { COMMITMENT_DIRECTIONS } from '@da/domain'
import { z } from 'zod'
import { isoInstantSchema } from '../primitives.ts'
import { rowSchema } from './common.ts'

/**
 * The `commitments` group — `commitment-create`.
 *
 * Three things are worth stating here:
 *
 *  1. **One function, one contract.** Listing, completing and snoozing a
 *     promise are PostgREST reads and writes against `commitments` under RLS,
 *     not edge functions: there is no envelope between the two sides to drift,
 *     so pinning one would pin nothing. Creating is the only call that crosses
 *     a function boundary, and it is the only thing defined here.
 *
 *  2. **The request is this function's, not the approval payload's.** The
 *     client used to post `commitmentCreatePayloadSchema` — the *approval*
 *     payload, `kind: 'commitment_create'` discriminator and all — at an
 *     endpoint that never reads `kind`, while the function's own schema
 *     accepted a `sourceType` and `sourceId` the client had no way to express.
 *     Two definitions of one request, agreeing by luck on the five fields they
 *     happened to share. The approval payload still describes what an approval
 *     carries; `commitmentCreateRequest` describes what this wire carries, and
 *     both sides import it.
 *
 *  3. **A promise is stored only if it can be quoted.** `quote` is required and
 *     lands in `commitments.source_quote`, which the database checks is
 *     non-blank: a claim the app cannot read back to the user as a sentence is
 *     never persisted. For a hand-written commitment the sentence the user
 *     typed is its own source, which is why the client sends the text as the
 *     quote rather than leaving the field empty.
 */

/**
 * Where a promise came from.
 *
 * `source_type` in the database is the full `SourceType` enum, but `task`,
 * `commitment` and `contact` are not things a promise is ever read out of, so
 * the wire does not accept them: a source the reader cannot open is worse than
 * no source at all.
 */
export const COMMITMENT_SOURCE_TYPES = [
  'email',
  'calendar_event',
  'capture',
  'notification',
  'user_input',
] as const satisfies readonly SourceType[]

export const commitmentSourceType = z.enum(COMMITMENT_SOURCE_TYPES)

export type CommitmentSourceType = z.infer<typeof commitmentSourceType>

/** Who owes whom. */
export const commitmentDirection = z.enum(
  COMMITMENT_DIRECTIONS,
) satisfies z.ZodType<CommitmentDirection>

// ── commitment-create ───────────────────────────────────────────────────────

/**
 * A promise to record. The limits are the column widths, so a body that parses
 * here cannot be rejected by the table afterwards.
 */
export const commitmentCreateRequest = z.object({
  text: z.string().min(3).max(500),
  direction: commitmentDirection,
  /** The counterparty, when the user named one. */
  personName: z.string().max(120).nullable().default(null),
  dueAt: isoInstantSchema.nullable().default(null),
  /** The verbatim sentence the promise was read from. Never invented. */
  quote: z.string().min(1).max(600),
  sourceType: commitmentSourceType.default('user_input'),
  /**
   * The record the quote came from — a thread id, an event id, a capture id.
   * Null for a hand-written promise, which the function gives an id of its own
   * so two identical sentences typed on different days stay two promises.
   */
  sourceId: z.string().min(1).max(100).nullable().default(null),
})

export type CommitmentCreateRequest = z.infer<typeof commitmentCreateRequest>

/**
 * The stored row, so the app can open the promise it just wrote without
 * waiting for the list to refetch.
 *
 * The row itself stays permissive — its columns are pinned by the migration and
 * narrowed by the mapper — while the envelope around it is fixed here, because
 * the envelope is what drifts.
 */
export const commitmentCreateResponse = z.object({ commitment: rowSchema })

export type CommitmentCreateResponse = z.infer<typeof commitmentCreateResponse>
