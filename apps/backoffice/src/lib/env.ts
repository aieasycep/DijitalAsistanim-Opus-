import { AppError } from '@da/domain'

/**
 * Server-side configuration.
 *
 * Nothing here is prefixed `NEXT_PUBLIC_`, which is the point: the service-role
 * key bypasses row level security entirely, so a build that inlined it into a
 * client bundle would hand every visitor the whole database. Reading it through
 * this module — which is imported only by `db.ts`, which is server-only — keeps
 * it on the server by construction.
 */
export interface BackofficeEnv {
  supabaseUrl: string
  serviceRoleKey: string
  anonKey: string
}

/** First non-empty of the given variables, or a 500 naming all of them. */
function required(...names: readonly string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  throw new AppError('unknown', {
    detail: `${names.join(' / ')} is not set`,
    status: 500,
  })
}

let cached: BackofficeEnv | null = null

export function readEnv(): BackofficeEnv {
  if (cached) return cached
  cached = {
    supabaseUrl: required('SUPABASE_URL').replace(/\/+$/, ''),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    // The anon key signs staff in through GoTrue and refreshes their token at
    // the edge. It is public by design and is never used for a data read: every
    // read goes through the bo_* views with the service role. The
    // NEXT_PUBLIC_ name is accepted as a fallback so a deployment that already
    // has the project's standard variables set needs no new secret.
    anonKey: required('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
  return cached
}

/** True when the process has everything it needs to reach Supabase. */
export function isConfigured(): boolean {
  try {
    readEnv()
    return true
  } catch {
    return false
  }
}
