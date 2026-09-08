import { SOURCE_TYPES } from '@da/domain'
import { z } from 'zod'
import { isoInstantSchema } from '../primitives.ts'

/**
 * The `search` group — the single `search` function behind `app/search.tsx`.
 *
 * Three decisions are worth stating:
 *
 *  1. **One union, used in both directions.** `SEARCH_TYPES` is what a caller
 *     may filter by *and* what a hit's `type` may be. They used to be
 *     different sets — the request accepted `life_event` while the screen
 *     offered a `capture` filter nothing ever answered, and the memory pass
 *     could return `notification` or `user_input` hits that no filter could
 *     ask for or exclude. The domain's `SOURCE_TYPES` is the source of truth
 *     for what the assistant has indexed; `life_event` is added because a
 *     tracked parcel or flight is a searchable record with its own screen
 *     even though it is not a memory source.
 *
 *  2. **The `type` is the label.** A hit carries no display string: the screen
 *     names its kind from `type` through the `search.scope.*` catalogue. The
 *     function used to ship `'Mail'`, `'Takvim'`, `'Kişi'` and `'Taahhüt'`
 *     across the wire — Turkish copy invented server-side, which an English
 *     reader would have seen verbatim, and which nothing rendered anyway.
 *
 *  3. **`sourceLabel` is provenance, never copy.** It says which record a hit
 *     came from (the sender behind a remembered mail, the stored label of a
 *     memory chunk, the entity kind for a direct keyword match) and exists for
 *     support and telemetry. It is not a sentence and is not rendered.
 */

/**
 * Everything the index can be asked for, and everything a hit can be.
 *
 * Derived from the domain rather than restated, so a new source type is
 * searchable the moment the domain admits it exists.
 */
export const SEARCH_TYPES = [...SOURCE_TYPES, 'life_event'] as const

export const searchTypeSchema = z.enum(SEARCH_TYPES)

export type SearchHitType = z.infer<typeof searchTypeSchema>

// ── search ──────────────────────────────────────────────────────────────────

/**
 * A query and the kinds it is allowed to match.
 *
 * `types` empty means every kind — the "Tümü" chip sends nothing rather than
 * enumerating the union, so a kind added here is searchable without the screen
 * being redeployed.
 *
 * There is no `cursor`. The client used to send one and the function never
 * read it: a single ranked page merged from eight sources has no stable
 * position to resume from, so `limit` is the whole of the paging story.
 */
export const searchRequest = z.object({
  query: z.string().min(1).max(300),
  types: z.array(searchTypeSchema).default([]),
  limit: z.number().int().min(1).max(100).default(25),
})

export type SearchRequest = z.infer<typeof searchRequest>

/**
 * One row on the results list.
 *
 * `id` is the id of the underlying record, so `type` + `id` is both the React
 * key and the route the screen opens. Kinds the app has no screen for (a task,
 * a notification, a remembered note) still travel — they are real answers to
 * the question asked — and the screen renders them as unpressable rows rather
 * than as buttons that do nothing.
 */
export const searchHit = z.object({
  id: z.string().min(1),
  type: searchTypeSchema,
  title: z.string(),
  snippet: z.string(),
  occurredAt: isoInstantSchema.nullable(),
  /** Relevance: cosine similarity when embeddings answered, FTS rank otherwise. */
  score: z.number(),
  /** Provenance for support and telemetry. Never rendered, never a sentence. */
  sourceLabel: z.string(),
})

export type SearchHit = z.infer<typeof searchHit>

export const searchResponse = z.object({
  results: z.array(searchHit).default([]),
  /** Which retrieval path answered, so the UI can be honest about it. */
  mode: z.enum(['semantic', 'keyword']),
})

export type SearchResponse = z.infer<typeof searchResponse>
