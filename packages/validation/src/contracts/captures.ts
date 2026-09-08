import type { CaptureExtraction, InsightAction } from '@da/domain'
import { z } from 'zod'
import { captureAnalysisSchema, suggestedActionSchema } from '../ai-schemas.ts'
import {
  captureUploadUrlRequestSchema,
  captureUploadUrlResponseSchema,
  createCaptureRequestSchema,
} from '../api-schemas.ts'
import { confidenceSchema, isoInstantSchema, moneySchema } from '../primitives.ts'
import { rowSchema } from './common.ts'

/**
 * The `captures` group — `capture-create` and `capture-upload-url`.
 *
 * Four decisions, each of them a defect this file makes impossible:
 *
 *  1. **A claim travels with the sentence it was read from.** The capture
 *     analysis used to return an `amount` and a booking/tracking `reference`
 *     with nothing to check them against: the date had a `dateQuote` and was
 *     re-derived from the source, but the amount and the reference were
 *     persisted exactly as the model wrote them. A wrong digit in a tracking
 *     code or a fabricated total is the worst kind of output this product can
 *     produce, because it looks like data the user photographed. Every factual
 *     field here is now paired with a required verbatim quote, `verifyQuotes`
 *     checks that quote against the text the model was actually shown, and
 *     `captureExtraction` drops any claim whose quote is missing — so an
 *     unverifiable amount cannot survive a round trip even if a future writer
 *     forgets to check it.
 *
 *  2. **The row is the answer on every path.** `capture-create` answered a
 *     successful analysis with the full `captures` row and a failed one with a
 *     hand-built `{ id, status, failureReason }` stub. The client maps both
 *     through `mapCapture`, so the failure answer produced a `Capture` whose
 *     `kind`, `userId` and `createdAt` were `undefined` — and the screen then
 *     rendered `capture.kind.undefined` as its badge. Both paths carry the row.
 *
 *  3. **`extracted` is a blob, not a set of columns.** `captures.extracted` is
 *     JSONB written with the domain's own field names (`startsAt`,
 *     `keyPoints`, `suggestedActions`), exactly as the column comment in
 *     migration 0008 says. It is therefore pinned here, in full, rather than
 *     left permissive like a real row: it is the one part of the capture the
 *     screen reads field by field.
 *
 *  4. **The request states what the kind needs.** `captures` has a
 *     `captures_has_payload` CHECK — a row must carry a storage path, a source
 *     URL or some raw text. Nothing on the wire said so, so a capture with
 *     none of the three reached the insert and came back as a 500 from a
 *     constraint violation, long before the function's own `missing_url` /
 *     `missing_file` checks could produce a readable failure. The request now
 *     carries the same rule the table does.
 */

/**
 * A verbatim span of the captured text, kept beside the claim it supports.
 *
 * Three characters is the floor `verifyQuotes` will actually check; anything
 * shorter is treated as unverifiable rather than as trivially present.
 */
const captureQuote = z.string().min(3).max(600)

/**
 * One offered next step. Reused from the AI schema rather than restated: the
 * actions the model may propose and the actions the app can dispatch are the
 * same closed set, and `InsightAction` is what the screen dispatches.
 */
export const captureSuggestedAction = suggestedActionSchema satisfies z.ZodType<
  InsightAction,
  z.ZodTypeDef,
  unknown
>

export type CaptureSuggestedAction = z.infer<typeof captureSuggestedAction>

const captureExtractionFields = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(800),
  /** Set only when the capture literally shows a date, and only once verified. */
  startsAt: isoInstantSchema.nullable(),
  endsAt: isoInstantSchema.nullable(),
  /** The sentence `startsAt` was read from. */
  dateQuote: captureQuote.nullable().default(null),
  location: z.string().max(200).nullable(),
  people: z.array(z.string().max(120)),
  amount: moneySchema.nullable(),
  /** The line the amount was read from. */
  amountQuote: captureQuote.nullable().default(null),
  /** Tracking number, PNR, reservation code — never derived, only read. */
  reference: z.string().max(80).nullable(),
  /** The line the reference was read from. */
  referenceQuote: captureQuote.nullable().default(null),
  keyPoints: z.array(z.string().max(240)),
  confidence: confidenceSchema,
  suggestedActions: z.array(captureSuggestedAction),
})

/**
 * What `captures.extracted` holds, and what the capture screen renders.
 *
 * The transform is the second half of the anti-hallucination rule: the
 * function drops what it could not verify before writing the row, and this
 * drops it again on the way back out. That matters for rows written before the
 * quotes existed — they lose the unquoted amount rather than presenting it as
 * something the source said.
 *
 * The quotes are a superset of the domain's `CaptureExtraction`, which is the
 * projection the app renders; `satisfies` proves the projection is total.
 */
export const captureExtraction = captureExtractionFields.transform((value) => {
  const dated = value.startsAt !== null && value.dateQuote !== null
  const priced = value.amount !== null && value.amountQuote !== null
  const referenced = value.reference !== null && value.referenceQuote !== null
  return {
    ...value,
    startsAt: dated ? value.startsAt : null,
    endsAt: dated ? value.endsAt : null,
    dateQuote: dated ? value.dateQuote : null,
    amount: priced ? value.amount : null,
    amountQuote: priced ? value.amountQuote : null,
    reference: referenced ? value.reference : null,
    referenceQuote: referenced ? value.referenceQuote : null,
  }
}) satisfies z.ZodType<CaptureExtraction, z.ZodTypeDef, unknown>

export type CaptureExtractionRecord = z.infer<typeof captureExtraction>

/**
 * The model's structured output for a capture.
 *
 * `captureAnalysisSchema` already required a `dateQuote`; the amount and the
 * reference were the two claims it let through unsupported, so they gain the
 * same obligation here. Extending rather than restating keeps one definition
 * of everything else the analysis returns.
 */
export const captureCreateAnalysis = captureAnalysisSchema.extend({
  amountQuote: captureQuote.nullable(),
  referenceQuote: captureQuote.nullable(),
})

export type CaptureCreateAnalysis = z.infer<typeof captureCreateAnalysis>

// ── capture-create ──────────────────────────────────────────────────────────

/**
 * Something to analyse, plus how it arrived.
 *
 * The three payload fields are all nullable because which one is filled
 * depends on the kind — a note carries `rawText`, a link carries `sourceUrl`,
 * an upload carries `storagePath` — but a capture with none of the three is
 * the row the table refuses, so it is refused here instead, on the caller's
 * device, with a message about the request rather than about the database.
 */
export const captureCreateRequest = createCaptureRequestSchema.superRefine((value, ctx) => {
  if (value.storagePath === null && value.sourceUrl === null && value.rawText === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rawText'],
      message: 'a capture needs a storagePath, a sourceUrl or rawText',
    })
  }
})

export type CaptureCreateRequest = z.infer<typeof captureCreateRequest>

/**
 * The `captures` row, analysed or failed.
 *
 * One field, because there is one answer: the client maps the row into a
 * `Capture` and the screen becomes that capture's status view. A failed
 * analysis is still a row — `status` and `failure_reason` are what the screen
 * reads to explain itself — so it is not a different envelope.
 */
export const captureCreateResponse = z.object({ capture: rowSchema })

export type CaptureCreateResponse = z.infer<typeof captureCreateResponse>

// ── capture-upload-url ──────────────────────────────────────────────────────

/**
 * Where to put the bytes. Already defined in `api-schemas.ts` and already
 * imported by both sides, so these are re-exported under the group's naming
 * convention rather than restated — a second declaration is the thing this
 * module exists to abolish.
 */
export const captureUploadUrlRequest = captureUploadUrlRequestSchema

export type CaptureUploadUrlRequest = z.infer<typeof captureUploadUrlRequest>

/**
 * A signed, user-scoped destination. The app uploads straight to it, so the
 * bytes never pass through an endpoint that would have to be trusted with them.
 */
export const captureUploadUrlResponse = captureUploadUrlResponseSchema

export type CaptureUploadUrlResponse = z.infer<typeof captureUploadUrlResponse>
