import { startFixtureSupabase } from './server.ts'

/**
 * The fixture Supabase project as its own process.
 *
 * It runs beside the console rather than inside the test worker because the
 * console is a separate `next start`, and both of them have to be talking to the
 * same server. Everything it needs arrives through the environment, so this file
 * holds no configuration and no credential of its own — the harness generates
 * them per run and passes them down.
 */

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    throw new Error(`fixture-supabase needs ${name} in its environment`)
  }
  return value.trim()
}

const supabase = await startFixtureSupabase({
  databaseUrl: required('E2E_FIXTURE_DATABASE_URL'),
  jwtSecret: required('E2E_FIXTURE_JWT_SECRET'),
  anonKey: required('E2E_FIXTURE_ANON_KEY'),
  serviceRoleKey: required('E2E_FIXTURE_SERVICE_ROLE_KEY'),
  port: Number(process.env['E2E_FIXTURE_PORT'] ?? '0'),
})

console.error(`[fixture-supabase] listening on ${supabase.url}`)

function stop(): void {
  void supabase.close().then(() => {
    process.exit(0)
  })
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
