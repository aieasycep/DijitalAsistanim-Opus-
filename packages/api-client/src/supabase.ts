import { AppError, isAppError } from '@da/domain'
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import { type ApiClientConfig, resolveFetch } from './config'

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'is'

export interface Filter {
  column: string
  op: FilterOperator
  value: string | number | boolean | null
}

export interface SelectOptions {
  columns?: string
  filters?: readonly Filter[]
  inFilter?: { column: string; values: readonly string[] }
  order?: { column: string; ascending: boolean }
  limit?: number
  range?: { from: number; to: number }
}

/**
 * Direct table access for reads and for narrow state flips (read, seen,
 * snoozed). Anything that inserts a user-owned row or touches a provider goes
 * through an edge function, where identity and side effects are server-owned.
 */
export interface Db {
  client: SupabaseClient
  selectMany<TRow>(table: string, options?: SelectOptions): Promise<TRow[]>
  selectOne<TRow>(table: string, options?: SelectOptions): Promise<TRow | null>
  insertOne<TRow>(table: string, values: Record<string, unknown>): Promise<TRow>
  updateOne<TRow>(table: string, id: string, values: Record<string, unknown>): Promise<TRow>
  deleteOne(table: string, id: string): Promise<void>
}

export function createSupabase(config: ApiClientConfig): SupabaseClient {
  const fetchImpl = resolveFetch(config)
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      // The app owns session storage; this client only borrows the token.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-client-info': 'da-api-client' },
      fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const token = await config.getAccessToken()
        const headers = new Headers(init?.headers)
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return fetchImpl(input, { ...init, headers })
      },
    },
  })
}

export function createDb(client: SupabaseClient): Db {
  async function selectMany<TRow>(table: string, options: SelectOptions = {}): Promise<TRow[]> {
    try {
      let query = client.from(table).select(options.columns ?? '*')
      for (const filter of options.filters ?? []) {
        switch (filter.op) {
          case 'eq':
            query = query.eq(filter.column, filter.value)
            break
          case 'neq':
            query = query.neq(filter.column, filter.value)
            break
          case 'gt':
            query = query.gt(filter.column, filter.value)
            break
          case 'gte':
            query = query.gte(filter.column, filter.value)
            break
          case 'lt':
            query = query.lt(filter.column, filter.value)
            break
          case 'lte':
            query = query.lte(filter.column, filter.value)
            break
          case 'like':
            query = query.ilike(filter.column, `%${String(filter.value)}%`)
            break
          case 'is':
            query = query.is(filter.column, filter.value === null ? null : Boolean(filter.value))
            break
          default:
            break
        }
      }
      if (options.inFilter) query = query.in(options.inFilter.column, [...options.inFilter.values])
      if (options.order) {
        query = query.order(options.order.column, { ascending: options.order.ascending })
      }
      if (options.range) query = query.range(options.range.from, options.range.to)
      else if (options.limit !== undefined) query = query.limit(options.limit)

      const { data, error } = await query
      if (error) throw fromPostgrest(error)
      return (data ?? []) as unknown as TRow[]
    } catch (error) {
      throw toDbError(error)
    }
  }

  return {
    client,
    selectMany,

    async selectOne<TRow>(table: string, options: SelectOptions = {}): Promise<TRow | null> {
      const rows = await selectMany<TRow>(table, { ...options, limit: 1 })
      return rows[0] ?? null
    },

    async insertOne<TRow>(table: string, values: Record<string, unknown>): Promise<TRow> {
      try {
        const { data, error } = await client.from(table).insert(values).select().limit(1)
        if (error) throw fromPostgrest(error)
        const rows = (data ?? []) as unknown as TRow[]
        const row = rows[0]
        if (!row) throw new AppError('not_found', { detail: `${table}: insert returned no row` })
        return row
      } catch (error) {
        throw toDbError(error)
      }
    },

    async updateOne<TRow>(
      table: string,
      id: string,
      values: Record<string, unknown>,
    ): Promise<TRow> {
      try {
        const { data, error } = await client
          .from(table)
          .update(values)
          .eq('id', id)
          .select()
          .limit(1)
        if (error) throw fromPostgrest(error)
        const rows = (data ?? []) as unknown as TRow[]
        const row = rows[0]
        if (!row) throw new AppError('not_found', { detail: `${table}: ${id}` })
        return row
      } catch (error) {
        throw toDbError(error)
      }
    },

    async deleteOne(table: string, id: string): Promise<void> {
      try {
        const { error } = await client.from(table).delete().eq('id', id)
        if (error) throw fromPostgrest(error)
      } catch (error) {
        throw toDbError(error)
      }
    },
  }
}

function fromPostgrest(error: PostgrestError): AppError {
  const detail = `${error.code}: ${error.message}`
  switch (error.code) {
    case 'PGRST116':
      return new AppError('not_found', { detail })
    case 'PGRST301':
      return new AppError('unauthorized', { detail })
    case '42501':
      // Row-level security refused the row: it is not this user's.
      return new AppError('forbidden', { detail })
    case '23505':
    case '23503':
    case '23514':
      return new AppError('validation_failed', { detail })
    case '57014':
      return new AppError('network_timeout', { detail })
    default:
      return new AppError('server_unavailable', { detail, retryable: true })
  }
}

function toDbError(error: unknown): AppError {
  if (isAppError(error)) return error
  return new AppError('network_offline', {
    detail: error instanceof Error ? error.message : 'database request failed',
    cause: error,
  })
}
