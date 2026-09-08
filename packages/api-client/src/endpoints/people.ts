import type { Contact } from '@da/domain'
import {
  CONTACT_SEARCH_COLUMNS,
  peopleGetRequest,
  peopleListRequest,
  peopleSetVipRequest,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapContact } from '../mappers'
import type { Filter } from '../supabase'
import type { ContactRow, EndpointContext } from '../types'

export interface PeopleFilter {
  /** Return only the people the user promoted, regardless of how often they write. */
  vipOnly?: boolean
  /** Matches a name or an address; blank asks for the ranked directory. */
  search?: string
  limit?: number
}

export interface PeopleApi {
  list(filter?: PeopleFilter): Promise<Contact[]>
  get(contactId: string): Promise<Contact | null>
  setVip(contactId: string, isVip: boolean): Promise<Contact>
}

/**
 * People the retention sweep has retired are not people.
 *
 * `search/index.ts` already reads the table this way, so without this clause the
 * same contact was absent from search results and present in the directory.
 * `deleted_at` is a query concern rather than a row concern, which is why it is
 * here and not in `ContactRow`.
 */
const LIVING: Filter = { column: 'deleted_at', op: 'is', value: null }

/**
 * One row per person, most-written-to first.
 *
 * A search runs one read per searchable column, and the two overlap whenever an
 * address appears inside a display name, so the union is taken by id. Ranking
 * the merged set again is what keeps a two-read search ordered like the
 * one-read directory it is a subset of.
 */
function mergeRanked(pages: readonly ContactRow[][], limit: number): ContactRow[] {
  const byId = new Map<string, ContactRow>()
  for (const page of pages) {
    for (const row of page) byId.set(row.id, row)
  }
  return [...byId.values()]
    .sort((left, right) => right.interaction_count - left.interaction_count)
    .slice(0, limit)
}

/**
 * The contact directory.
 *
 * Straight table reads under RLS plus one boolean the user flips: a contact is
 * derived from the user's own mail by the ingest pipeline, and nothing in the
 * app authors one, so there is no function to call. `packages/validation`'s
 * `people` contract holds the rules all of it obeys — what counts as a live
 * contact, what a search matches, and what a contact id has to look like.
 */
export function createPeopleApi(ctx: EndpointContext): PeopleApi {
  /** The ranked page a set of filters selects. */
  function page(filters: readonly Filter[], limit: number): Promise<ContactRow[]> {
    return ctx.db.selectMany<ContactRow>('contacts', {
      filters,
      // Interaction volume is the only honest proxy for importance the client
      // has before the user says otherwise, so it orders every directory read.
      order: { column: 'interaction_count', ascending: false },
      limit,
    })
  }

  return {
    async list(filter = {}) {
      const request = parseRequest(peopleListRequest, filter)
      const filters: Filter[] = [LIVING]
      if (request.vipOnly) filters.push({ column: 'is_vip', op: 'eq', value: true })

      const needle = request.search
      if (needle === null) return (await page(filters, request.limit)).map(mapContact)

      const pages = await Promise.all(
        CONTACT_SEARCH_COLUMNS.map((column) =>
          page([...filters, { column, op: 'like', value: needle }], request.limit),
        ),
      )
      return mergeRanked(pages, request.limit).map(mapContact)
    },

    async get(contactId) {
      const request = parseRequest(peopleGetRequest, { contactId })
      const row = await ctx.db.selectOne<ContactRow>('contacts', {
        filters: [{ column: 'id', op: 'eq', value: request.contactId }, LIVING],
      })
      return row ? mapContact(row) : null
    },

    async setVip(contactId, isVip) {
      const request = parseRequest(peopleSetVipRequest, { contactId, isVip })
      // Typed as the two columns it writes, so renaming either one is a compile
      // error here rather than an update that succeeds and changes nothing.
      const values: Pick<ContactRow, 'is_vip' | 'vip_set_at'> = {
        is_vip: request.isVip,
        vip_set_at: request.isVip ? ctx.config.clock.now().toISOString() : null,
      }
      const row = await ctx.db.updateOne<ContactRow>('contacts', request.contactId, values)
      return mapContact(row)
    },
  }
}
