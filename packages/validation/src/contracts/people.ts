import { z } from 'zod'
import { uuidSchema } from '../primitives.ts'

/**
 * The `people` group — the contact directory behind `api.people`.
 *
 * Like `events`, this group has no edge function, and for the same reason: a
 * contact is the user's own row, the only thing the app ever changes about one
 * is a flag the user set deliberately, and both are PostgREST calls under RLS.
 * There is no JSON envelope between two hand-written definitions here, so
 * inventing a response schema would pin nothing.
 *
 * What drifted is everything *around* the row, and that is what is defined
 * here — once, so the API client, the two VIP screens and the `search` edge
 * function stop giving three different answers about one table:
 *
 *  1. **A pruned contact is not a person.** `contacts.deleted_at` is part of the
 *     table (migration 0005) and `search/index.ts` filters on it, so a contact
 *     the retention sweep has retired disappears from search results. The
 *     directory read did not filter on it, so the same person stayed in the
 *     people list and on the VIP screen. One rule, stated here and applied by
 *     every read: a row with `deleted_at` set is not returned.
 *
 *  2. **A directory search matches a name or an address.**
 *     `search/index.ts` asks for `name.ilike.<q>,email.ilike.<q>`, and the demo
 *     client matches the concatenation of both. The live client matched `name`
 *     alone — so searching by address found nobody, and a contact whose name
 *     the sync never learned (`name` is nullable) was unreachable by any query
 *     at all. `CONTACT_SEARCH_COLUMNS` is the single statement of which columns
 *     a person can be found by.
 *
 *  3. **The VIP list is a query, not a filter over the ranked page.** The
 *     directory comes back ordered by `interaction_count` and capped at
 *     `PEOPLE_DIRECTORY_LIMIT`, which is the right shape for "who might you want
 *     to promote" and the wrong shape for "who have you already promoted": a VIP
 *     the user rarely writes to — a spouse, a doctor — falls off the end of the
 *     page, vanishes from the VIP screen, and cannot be removed there. It also
 *     made the entitlement count too low, so the cap could be exceeded. Asking
 *     the database with `vipOnly` is exact regardless of ranking, which is what
 *     `qk.vip()` in the API client's key factory was always for.
 *
 *  4. **A contact id is a uuid.** `contactId` reaches the client from a route
 *     parameter. Sent unchecked, a malformed one becomes a PostgREST `22P02`,
 *     which maps to `server_unavailable` — a retried "we cannot reach you right
 *     now" for what is simply a bad link. Checked here, it is a
 *     `validation_failed` that fails once and immediately.
 */

/**
 * The default page of the directory.
 *
 * Enough that a search box filtering it locally behaves like the whole address
 * book for anyone but the heaviest correspondent, and small enough to stay one
 * cheap indexed read. Anything that has to be exhaustive — the VIP list — asks
 * for its own set instead of paging through this one.
 */
export const PEOPLE_DIRECTORY_LIMIT = 100

/**
 * The columns a person can be found by.
 *
 * The two are searched separately and merged, because a contact matches if
 * *either* does: PostgREST expresses that as `or(...)`, and the client's filter
 * list is conjunctive, so it runs one read per column and unions the results by
 * id. Same predicate, same rows, two round trips instead of one.
 */
export const CONTACT_SEARCH_COLUMNS = ['name', 'email'] as const

export type ContactSearchColumn = (typeof CONTACT_SEARCH_COLUMNS)[number]

/**
 * What the user typed into a people search box.
 *
 * Blank is not a search: an empty field, or one holding only spaces, asks for
 * the ranked directory rather than for the contacts whose name contains
 * nothing — which is all of them, in a different and slower way.
 */
export const contactSearchTerm = z
  .string()
  .trim()
  .max(200)
  .transform((term) => (term.length > 0 ? term : null))

// ── people.list ─────────────────────────────────────────────────────────────

export const peopleListRequest = z.object({
  /** Ask the database for the VIP set instead of ranking the whole directory. */
  vipOnly: z.boolean().default(false),
  search: contactSearchTerm.nullable().default(null),
  limit: z.number().int().min(1).max(500).default(PEOPLE_DIRECTORY_LIMIT),
})

export type PeopleListRequest = z.infer<typeof peopleListRequest>

// ── people.get ──────────────────────────────────────────────────────────────

/** `contacts.id`, which is what `/person/[id]` carries. */
export const peopleGetRequest = z.object({ contactId: uuidSchema })

export type PeopleGetRequest = z.infer<typeof peopleGetRequest>

// ── people.setVip ───────────────────────────────────────────────────────────

/**
 * Promote or demote one person.
 *
 * `contacts.is_vip` is the flag the whole product reads — `_shared/ingest.ts`
 * loads the VIP addresses from it before every triage — so it is the one this
 * writes. `vip_people` is the separate audit list the feedback flow keeps, and
 * nothing in triage or notification routing consults it.
 */
export const peopleSetVipRequest = z.object({
  contactId: uuidSchema,
  isVip: z.boolean(),
})

export type PeopleSetVipRequest = z.infer<typeof peopleSetVipRequest>
