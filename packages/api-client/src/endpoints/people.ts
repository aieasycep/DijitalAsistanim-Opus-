import type { Contact } from '@da/domain'
import { mapContact } from '../mappers'
import type { Filter } from '../supabase'
import type { ContactRow, EndpointContext } from '../types'

export interface PeopleFilter {
  vipOnly?: boolean
  search?: string
  limit?: number
}

export interface PeopleApi {
  list(filter?: PeopleFilter): Promise<Contact[]>
  get(contactId: string): Promise<Contact | null>
  setVip(contactId: string, isVip: boolean): Promise<Contact>
}

export function createPeopleApi(ctx: EndpointContext): PeopleApi {
  return {
    async list(filter = {}) {
      const filters: Filter[] = []
      if (filter.vipOnly) filters.push({ column: 'is_vip', op: 'eq', value: true })
      if (filter.search) filters.push({ column: 'name', op: 'like', value: filter.search })
      const rows = await ctx.db.selectMany<ContactRow>('contacts', {
        filters,
        order: { column: 'interaction_count', ascending: false },
        limit: filter.limit ?? 100,
      })
      return rows.map(mapContact)
    },

    async get(contactId) {
      const row = await ctx.db.selectOne<ContactRow>('contacts', {
        filters: [{ column: 'id', op: 'eq', value: contactId }],
      })
      return row ? mapContact(row) : null
    },

    async setVip(contactId, isVip) {
      const row = await ctx.db.updateOne<ContactRow>('contacts', contactId, {
        is_vip: isVip,
        vip_set_at: isVip ? ctx.config.clock.now().toISOString() : null,
      })
      return mapContact(row)
    },
  }
}
