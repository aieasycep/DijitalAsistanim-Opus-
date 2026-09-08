import { z } from 'zod'

/**
 * The wire contract between the edge functions and the API client.
 *
 * Every endpoint's request and response shape is defined ONCE, here, and
 * imported by both sides:
 *
 *   - the edge function annotates its response object with the inferred type,
 *     so `deno check` fails at compile time if the object drifts;
 *   - the API client parses the response with the same schema, so a deployed
 *     function that drifts fails loudly at the boundary instead of producing
 *     `undefined` three layers into a screen.
 *
 * This module exists because the two halves used to define their shapes
 * independently. Each side type-checked perfectly against its own definition
 * and disagreed with the other — five screens shipped broken while every gate
 * was green. A single definition makes that class of bug a compile error.
 *
 * Convention for a group `X` (matching `packages/api-client/src/endpoints/X.ts`):
 *
 *   export const xThingRequest  = z.object({ ... })
 *   export const xThingResponse = z.object({ ... })
 *   export type  XThingResponse = z.infer<typeof xThingResponse>
 *
 * Name the schema after the function slug it belongs to, camel-cased, so
 * `plan-day` is `planDayRequest` / `planDayResponse`.
 */

/**
 * A database row the function has already selected and RLS has already scoped.
 *
 * Row *contents* are pinned by the migrations and the mappers, not here — what
 * drifts in practice is the envelope around them (a field renamed, an array
 * that moved a level down), so that is what these contracts pin. Keeping rows
 * permissive also means adding a column does not require a contract change.
 */
export const rowSchema = z.record(z.string(), z.unknown())

/** An array of rows, defaulting to empty so a missing key is not a crash. */
export const rowsSchema = z.array(rowSchema).default([])

/**
 * The acknowledgement shape for an endpoint whose only answer is "done".
 *
 * Four functions used to return bespoke acknowledgements while the client
 * parsed `{ ok: boolean }`, so account deletion and disconnection *succeeded*
 * server-side and then reported failure to the user. Anything that has nothing
 * to return returns this, and nothing else.
 */
export const ackResponse = z.object({ ok: z.literal(true) })
export type AckResponse = z.infer<typeof ackResponse>

/** The value every "just acknowledge it" handler returns. */
export const ACK: AckResponse = { ok: true }
