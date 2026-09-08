import type { EmailCategory, FollowUp, Importance, SourceType } from '@da/domain'
import { EMAIL_CATEGORIES, IMPORTANCE_LEVELS } from '@da/domain'
import { z } from 'zod'
import { uuidSchema } from '../primitives.ts'

/**
 * The `threads` group — the mail reads behind `api.threads`, and `feedback`.
 *
 * Like `events` and `people`, most of this group has no edge function: a mail
 * thread is the user's own mirrored row, the only things the app changes about
 * one are two flags the user set deliberately (`is_read`, `suppressed_at`), and
 * every read is a PostgREST call under RLS. There is no JSON envelope between
 * two hand-written definitions for those, so inventing a response schema would
 * pin nothing.
 *
 * What *did* drift is the query, the join, and the one call that does cross the
 * wire — and those are pinned here:
 *
 *  1. **A flow is a cut, defined once.** The seven chips on the Akış screen
 *     each mean a set of categories or importance levels, and that meaning
 *     existed twice: as a `switch` in `endpoints/threads.ts` and as a second,
 *     hand-copied `switch` in the demo client, with the five `personal`
 *     categories written out as a bare string array in both. Two copies of a
 *     vocabulary is two chances for the demo to show a cut the live app cannot
 *     produce. `threadFlowCut` is the one copy, and it is stated in terms of
 *     `EmailCategory` and `Importance`, so a category renamed in the domain is
 *     a compile error rather than a filter that silently matches nothing.
 *
 *  2. **A commitment points at its thread through columns, not through JSON.**
 *     `commitments` stores `source_type`, `source_id` and `source_quote` as
 *     three columns (migration 0005) — there is no `source` jsonb. The thread
 *     detail asked PostgREST for `source->>id`, which is a `42703` on a column
 *     that does not exist, so the request failed, `detail()` rejected, and the
 *     whole thread screen rendered its error state: no summary, no messages, no
 *     commitments, for every thread. `THREAD_COMMITMENT_SOURCE_TYPE` and the
 *     column names below are what the ingestion pipeline actually writes.
 *
 *  3. **A closed follow-up is not a thread waiting on a reply.** The detail
 *     read every follow-up ever recorded against the thread, including the ones
 *     already `replied` or `closed`, so a conversation that had been answered
 *     weeks ago would still have offered "Henüz dönüş gelmedi". The live set is
 *     `waiting` and `nudged` — the same two `followups`' own list uses, because
 *     drafting a nudge moves the row to `nudged` and must not make it vanish.
 *
 *  4. **`feedback` answers `ACK`.** Its request is `feedbackRequestSchema` in
 *     `../api-schemas.ts` and its response is `ackResponse` from `./common.ts`;
 *     neither is re-declared here, because a second name for one schema is the
 *     duplication these contracts exist to abolish. The function used to answer
 *     `{ recorded: true, id }` while the client parsed `{ ok }` — so "bu önemli
 *     değil" and "iyi özet" were recorded, acted on, and then reported to the
 *     user as failures. A recorded signal has nothing to describe: nothing in
 *     the app can fetch or amend one afterwards.
 */

// ── The flow cuts ───────────────────────────────────────────────────────────

/**
 * The chips on the Akış screen, in the order they are offered.
 *
 * `all` first, then the cuts users actually reach for. This is the vocabulary
 * `ThreadFilter.flow` speaks; it is not a database value and never reaches a
 * column on its own — `threadFlowCut` is what turns one into a query.
 */
export const THREAD_FLOWS = [
  'all',
  'important',
  'action_required',
  'waiting',
  'deadlines',
  'meetings',
  'personal',
] as const

export const threadFlow = z.enum(THREAD_FLOWS)

export type ThreadFlow = z.infer<typeof threadFlow>

/** What "önemli" means: the two levels the priority engine ranks above normal. */
export const THREAD_IMPORTANT_LEVELS = ['critical', 'high'] as const satisfies readonly Importance[]

/** Waiting on someone, in either direction. */
export const THREAD_WAITING_CATEGORIES = [
  'waiting_for_user',
  'waiting_for_other',
] as const satisfies readonly EmailCategory[]

/**
 * The life-admin cut: the mail that is about the user rather than about work.
 *
 * Not a rename of any single category — it is the union the chip promises, and
 * it is the reason this list is a contract rather than a literal at the call
 * site.
 */
export const THREAD_PERSONAL_CATEGORIES = [
  'shipment',
  'travel',
  'payment',
  'subscription',
  'security',
] as const satisfies readonly EmailCategory[]

/**
 * A flow, as a query rather than as a name.
 *
 * Declarative on purpose: the two readers build very different things from it
 * (PostgREST filters live, an array predicate in the demo) and neither may
 * decide for itself what a chip means.
 *
 * A tagged union rather than a record of optional narrowings, because every
 * chip narrows exactly one dimension and the reader has exactly one `in`
 * clause to spend on it. Spelled as a record, "narrow by category *and* by
 * importance" would be a legal value that the live client could only honour
 * half of — and it would honour it silently.
 */
export type ThreadFlowCut =
  /** Everything the caller's own filters admit. */
  | { readonly by: 'nothing' }
  /** Threads whose `category` is one of these. */
  | { readonly by: 'category'; readonly categories: readonly EmailCategory[] }
  /** Threads whose `importance` is one of these. */
  | { readonly by: 'importance'; readonly levels: readonly Importance[] }
  /** Threads that ask something of the user. */
  | { readonly by: 'requiresUserAction' }

/** The single statement of what each chip narrows to. */
export function threadFlowCut(flow: ThreadFlow): ThreadFlowCut {
  switch (flow) {
    case 'important':
      return { by: 'importance', levels: THREAD_IMPORTANT_LEVELS }
    case 'action_required':
      return { by: 'requiresUserAction' }
    case 'waiting':
      return { by: 'category', categories: THREAD_WAITING_CATEGORIES }
    case 'deadlines':
      return { by: 'category', categories: ['deadline'] }
    case 'meetings':
      return { by: 'category', categories: ['meeting'] }
    case 'personal':
      return { by: 'category', categories: THREAD_PERSONAL_CATEGORIES }
    case 'all':
      return { by: 'nothing' }
  }
}

// ── threads.list ────────────────────────────────────────────────────────────

/**
 * The ranked feed is bounded, not paged.
 *
 * Akış ends: it is the set of things worth knowing, cut off by the priority
 * engine, so the cap is a property of the product rather than a page size to
 * scroll past. 200 is the ceiling a caller may ask for; the default is what
 * every caller that does not care gets.
 */
export const THREAD_LIST_MAX_LIMIT = 200

export const THREAD_LIST_DEFAULT_LIMIT = 100

/**
 * The feed query.
 *
 * Every field is optional-with-a-default rather than merely optional, so the
 * absent case is decided here once instead of by each `??` at the call site —
 * which is how `includeSuppressed` came to mean "show muted threads" in the
 * client and nothing at all in the demo.
 */
export const threadsListRequest = z.object({
  flow: threadFlow.default('all'),
  /** An exact category, narrowing whatever the flow already admits. */
  category: z.enum(EMAIL_CATEGORIES).nullable().default(null),
  importance: z.enum(IMPORTANCE_LEVELS).nullable().default(null),
  /** One connected mailbox, when the caller is scoped to a single account. */
  accountId: uuidSchema.nullable().default(null),
  unreadOnly: z.boolean().default(false),
  requiresAction: z.boolean().default(false),
  /**
   * Muted threads are hidden, not deleted: a `not_important` signal and a mute
   * rule both set `suppressed_at`, and a ranked surface excludes it. Only a
   * caller that has a reason to see the hidden ones asks for them.
   */
  includeSuppressed: z.boolean().default(false),
  limit: z.number().int().min(1).max(THREAD_LIST_MAX_LIMIT).default(THREAD_LIST_DEFAULT_LIMIT),
})

export type ThreadsListRequest = z.infer<typeof threadsListRequest>

// ── threads.get / messages / detail / suppress ──────────────────────────────

/**
 * One thread, by its own id.
 *
 * `threadId` reaches the client from a route parameter (`/thread/[id]`) and
 * from a notification deep link. Sent unchecked, a malformed one becomes a
 * PostgREST `22P02`, which maps to `server_unavailable` — a retried "we cannot
 * reach you right now" for what is simply a bad link. Checked here it is a
 * `validation_failed` that fails once and immediately.
 */
export const threadRefRequest = z.object({ threadId: uuidSchema })

export type ThreadRefRequest = z.infer<typeof threadRefRequest>

/** Read state is the one flag the app flips without asking a function. */
export const threadsMarkReadRequest = threadRefRequest.extend({ isRead: z.boolean() })

export type ThreadsMarkReadRequest = z.infer<typeof threadsMarkReadRequest>

/**
 * How a commitment names the thread it was read from.
 *
 * `ingest.ts` writes `source_type: 'email'` with the thread's id in `source_id`,
 * exactly as `meeting-note` writes `calendar_event` with an event's. Both halves
 * are stated so a reader cannot pair the right column with the wrong constant —
 * and the type is the domain's `SourceType`, so a vocabulary change there is a
 * compile error here rather than a filter that matches nothing.
 */
export const THREAD_COMMITMENT_SOURCE_TYPE = 'email' as const satisfies SourceType

export const THREAD_COMMITMENT_SOURCE_TYPE_COLUMN = 'source_type'

export const THREAD_COMMITMENT_SOURCE_ID_COLUMN = 'source_id'

/**
 * The statuses a follow-up on this thread is still live in.
 *
 * `replied` and `closed` are finished: the other side answered, or the user
 * stopped following. Showing either as "henüz dönüş gelmedi" would be telling
 * the user to chase a conversation that has already ended.
 */
export const THREAD_LIVE_FOLLOW_UP_STATUSES = [
  'waiting',
  'nudged',
] as const satisfies readonly FollowUp['status'][]
