import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AppError } from './domain.ts'

/**
 * Database access for edge functions.
 *
 * Two clients, and the distinction is load-bearing:
 *
 *   - `serviceClient()` bypasses RLS. It is required for anything the assistant
 *     writes on the user's behalf (insights, briefings, approvals) because
 *     those must not be forgeable by a client. Every query made with it must
 *     filter by `user_id` explicitly — RLS is not there to catch a mistake.
 *   - `userClient(request)` runs as the caller with their JWT, so RLS applies.
 *     Prefer it whenever the operation is something the user could legitimately
 *     do themselves.
 */

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new AppError('server_unavailable', { detail: `missing_env:${name}` })
  return value
}

let cachedServiceClient: SupabaseClient | null = null

export function serviceClient(): SupabaseClient {
  if (cachedServiceClient) return cachedServiceClient
  cachedServiceClient = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'dijital-asistan-edge' } },
    },
  )
  return cachedServiceClient
}

export function userClient(accessToken: string): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export interface AuthenticatedUser {
  id: string
  email: string | null
  accessToken: string
}

/**
 * Resolve the caller from the `Authorization` header.
 *
 * The token is verified against Supabase Auth rather than merely decoded: a
 * function that trusted an unverified JWT would accept a forged `sub` and
 * happily operate on another user's data.
 */
export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new AppError('unauthorized', { detail: 'missing_bearer_token' })

  const { data, error } = await serviceClient().auth.getUser(token)
  if (error || !data.user) {
    throw new AppError('unauthorized', { detail: 'invalid_token' })
  }

  return { id: data.user.id, email: data.user.email ?? null, accessToken: token }
}

/**
 * Authorise a machine-to-machine caller (pg_cron, a provider webhook) using a
 * shared secret. Compared in constant time; a plain equality check would leak
 * the secret one byte at a time.
 */
export async function requireServiceSecret(request: Request, envName: string): Promise<void> {
  const { timingSafeEqual } = await import('./crypto.ts')
  const expected = Deno.env.get(envName)
  if (!expected) throw new AppError('server_unavailable', { detail: `missing_env:${envName}` })
  const provided =
    request.headers.get('x-service-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  if (!timingSafeEqual(provided, expected)) {
    throw new AppError('forbidden', { detail: 'bad_service_secret' })
  }
}

/** Translate a PostgREST error into an `AppError` with a sensible code. */
export function dbError(error: { code?: string; message?: string } | null): AppError {
  if (!error) return new AppError('unknown')
  switch (error.code) {
    case '23505':
      return new AppError('sync_conflict', { detail: 'unique_violation' })
    case '23503':
      return new AppError('validation_failed', { detail: 'foreign_key_violation' })
    case '42501':
      return new AppError('forbidden', { detail: 'rls_denied' })
    case 'PGRST116':
      return new AppError('not_found', { detail: 'no_rows' })
    default:
      return new AppError('server_unavailable', {
        detail: error.code ? `pg:${error.code}` : 'db_error',
      })
  }
}

/** Throw on a PostgREST error, otherwise return the data. */
export function unwrap<T>(result: { data: T | null; error: { code?: string; message?: string } | null }): T {
  if (result.error) throw dbError(result.error)
  if (result.data === null) throw new AppError('not_found')
  return result.data
}

export interface UserContext {
  userId: string
  timeZone: string
  locale: 'tr' | 'en'
  displayName: string | null
  givenName: string | null
}

/**
 * Load the profile fields every function needs to render or schedule anything.
 * Cached per invocation by the caller, not here — an edge instance is reused
 * across users, so caching by module scope would be a data leak.
 */
export async function loadUserContext(userId: string): Promise<UserContext> {
  const client = serviceClient()
  const { data, error } = await client
    .from('profiles')
    .select('id, time_zone, locale, display_name, given_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) throw new AppError('not_found', { detail: 'profile_missing' })

  return {
    userId,
    timeZone: (data.time_zone as string | null) ?? 'Europe/Istanbul',
    locale: ((data.locale as string | null) ?? 'tr') === 'en' ? 'en' : 'tr',
    displayName: (data.display_name as string | null) ?? null,
    givenName: (data.given_name as string | null) ?? null,
  }
}
