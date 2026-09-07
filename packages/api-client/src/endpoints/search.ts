import { searchRequestSchema, searchResponseSchema } from '@da/validation'
import { parseRequest } from '../http'
import type { EndpointContext, SearchPage } from '../types'

export type SearchType =
  'email' | 'calendar_event' | 'task' | 'commitment' | 'capture' | 'contact' | 'life_event'

export interface SearchInput {
  query: string
  types?: SearchType[]
  limit?: number
  cursor?: string | null
}

export interface SearchApi {
  query(input: SearchInput): Promise<SearchPage>
}

export function createSearchApi(ctx: EndpointContext): SearchApi {
  return {
    async query(input) {
      const request = parseRequest(searchRequestSchema, {
        query: input.query,
        types: input.types ?? [],
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      })
      const result = await ctx.http.callFunction('search', request, searchResponseSchema)
      return {
        results: result.results,
        nextCursor: result.nextCursor,
        mode: result.mode,
      }
    },
  }
}
