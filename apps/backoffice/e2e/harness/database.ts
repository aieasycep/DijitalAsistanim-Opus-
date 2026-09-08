import { randomBytes } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { MIGRATIONS_DIR, SUPABASE_SHIM_SQL } from './paths.ts'

/**
 * A throwaway database per run, built from the migrations themselves.
 *
 * The suite is only worth anything if the schema under it is the real one — the
 * content-blind views, the four-eyes check constraint, the accountability
 * trigger and the `sa_reveal_*` functions are the things being tested, and a
 * hand-written fixture schema would test a copy of them. So the harness does
 * what `scripts/validate-supabase.mjs` does: create an empty database, apply the
 * Supabase stand-in, then apply every migration in filename order.
 *
 * The database is named per run and dropped afterwards, so two suites on the
 * same PostgreSQL cannot see each other's rows.
 */

const DEFAULT_ADMIN_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'

/** The server to create the scratch database on. */
export function adminDatabaseUrl(): string {
  const configured = process.env['E2E_DATABASE_URL'] ?? process.env['SUPABASE_DB_URL']
  return configured !== undefined && configured.trim() !== ''
    ? configured.trim()
    : DEFAULT_ADMIN_URL
}

export function scratchDatabaseName(): string {
  return `da_e2e_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}

export function urlForDatabase(baseUrl: string, database: string): string {
  const url = new URL(baseUrl)
  url.pathname = `/${database}`
  return url.toString()
}

async function withClient<T>(connectionString: string, run: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

export function migrationFiles(): readonly string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
}

export async function createScratchDatabase(adminUrl: string, database: string): Promise<string> {
  await withClient(adminUrl, async (client) => {
    // The name is generated above from a timestamp and six hex characters, so it
    // cannot carry an identifier a caller chose; it is still quoted, because a
    // database name is the one place in this harness a value becomes SQL text.
    await client.query(`create database "${database.replace(/"/g, '""')}"`)
  })
  return urlForDatabase(adminUrl, database)
}

export async function dropScratchDatabase(adminUrl: string, database: string): Promise<void> {
  await withClient(adminUrl, async (client) => {
    await client.query(`drop database if exists "${database.replace(/"/g, '""')}" with (force)`)
  })
}

export async function applySchema(databaseUrl: string): Promise<number> {
  return withClient(databaseUrl, async (client) => {
    await client.query(readFileSync(SUPABASE_SHIM_SQL, 'utf8'))
    const files = migrationFiles()
    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      try {
        await client.query(sql)
      } catch (error) {
        throw new Error(
          `migration ${file} failed against the scratch database: ` +
            (error instanceof Error ? error.message : String(error)),
        )
      }
    }
    return files.length
  })
}

/** A pooled connection for seeding and for the specs' own assertions. */
export function connect(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 4 })
}
