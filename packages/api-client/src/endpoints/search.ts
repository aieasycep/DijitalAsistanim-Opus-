import { searchRequest, searchResponse, type SearchHitType } from '@da/validation'
import { parseRequest } from '../http'
import type { EndpointContext, SearchPage } from '../types'

/**
 * The kinds a search can look for.
 *
 * The contract's own union, re-exported so a screen does not have to reach
 * into `@da/validation` for it. It used to be a second, shorter list declared
 * here: it left out `notification` and `user_input`, which the memory index
 * has always been able to return, so those hits could arrive but never be
 * filtered for or against.
 */
export type SearchType = SearchHitType

export interface SearchInput {
  query: string
  /** Empty or omitted means every kind. */
  types?: readonly SearchType[]
  /** Rows in the single ranked page. The function defaults it to 25. */
  limit?: number
}

export interface SearchApi {
  query(input: SearchInput): Promise<SearchPage>
}

export function createSearchApi(ctx: EndpointContext): SearchApi {
  return {
    async query(input) {
      const request = parseRequest(searchRequest, {
        query: input.query,
        types: input.types ? [...input.types] : [],
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      })
      const result = await ctx.http.callFunction('search', request, searchResponse)
      return {
        results: result.results,
        // Results are one page merged and ranked across eight sources, so there
        // is no position to resume from; the request carries no cursor either.
        nextCursor: null,
        mode: result.mode,
      }
    },
  }
}
