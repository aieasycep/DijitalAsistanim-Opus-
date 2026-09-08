import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Where everything the harness touches lives.
 *
 * Found by walking up from the working directory to the workspace manifest,
 * rather than from `__dirname` or `import.meta.url`: these modules are loaded
 * both by Playwright, which transpiles them, and by Node directly when the
 * fixture server is spawned, and only one of those two has each of those names.
 * The suite therefore behaves the same started from the repository root, from
 * `apps/backoffice`, or from an editor that picked its own directory.
 */

function findRepoRoot(start: string): string {
  let directory = path.resolve(start)
  for (;;) {
    if (existsSync(path.join(directory, 'pnpm-workspace.yaml'))) return directory
    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error(`no pnpm-workspace.yaml above ${start}; run the suite inside the repository`)
    }
    directory = parent
  }
}

export const REPO_ROOT = findRepoRoot(process.cwd())
export const BACKOFFICE_ROOT = path.join(REPO_ROOT, 'apps', 'backoffice')
export const E2E_ROOT = path.join(BACKOFFICE_ROOT, 'e2e')

export const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations')

/**
 * The same stand-in `scripts/validate-supabase.mjs` applies before the
 * migrations: a plain PostgreSQL has no `auth.users`, no `storage.*` and none of
 * the three Supabase roles the RLS policies grant to.
 */
export const SUPABASE_SHIM_SQL = path.join(REPO_ROOT, 'scripts', 'sql', 'supabase-shim.sql')

/** Per-run state: generated credentials and seeded ids. Never committed. */
export const ARTIFACTS_DIR = path.join(E2E_ROOT, '.artifacts')
export const STATE_FILE = path.join(ARTIFACTS_DIR, 'stack.json')

export const FIXTURE_SUPABASE_ENTRY = path.join(E2E_ROOT, 'fixture-supabase', 'main.ts')

/** Where the crawl reads the console's own route tree from. */
export const APP_DIR = path.join(BACKOFFICE_ROOT, 'src', 'app')
