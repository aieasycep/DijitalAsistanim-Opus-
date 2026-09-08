import { expect, test as base, type Page } from '@playwright/test'
import type { Pool } from 'pg'
import { connect } from '../harness/database.ts'
import {
  readStackState,
  type AdminFixture,
  type AdminKey,
  type StackState,
} from '../harness/state.ts'

/**
 * What every spec starts from: the run's own state, a connection to the very
 * database the console is reading, and a way to become one of the seeded
 * operators.
 *
 * The database handle matters more than it looks. Half of what this suite claims
 * is about rows — that an audit entry names the actor and the reason in real
 * columns, that a reveal was logged, that a refused request created nothing — and
 * checking those through the console's own screens would only prove the console
 * is self-consistent. Every such assertion goes to Postgres directly.
 */

interface ConsoleFixtures {
  readonly state: StackState
  readonly db: Pool
  readonly signIn: (admin: AdminFixture) => Promise<void>
  readonly signOut: () => Promise<void>
}

export const test = base.extend<ConsoleFixtures, { workerDb: Pool }>({
  // The console's port is only known once global setup has chosen one, so the
  // base URL is read at test time rather than baked into the config.
  baseURL: async ({}, use) => {
    await use(readStackState().baseUrl)
  },

  state: async ({}, use) => {
    await use(readStackState())
  },

  workerDb: [
    async ({}, use) => {
      const pool = connect(readStackState().databaseUrl)
      await use(pool)
      await pool.end()
    },
    { scope: 'worker' },
  ],

  db: async ({ workerDb }, use) => {
    await use(workerDb)
  },

  signIn: async ({ page, workerDb }, use) => {
    await use(async (admin: AdminFixture) => {
      await clearSignInLimit(workerDb)
      await signInAs(page, admin)
    })
  },

  signOut: async ({ page }, use) => {
    await use(async () => {
      await page.context().clearCookies()
    })
  },
})

export { expect }

/**
 * Sign in through the form, the way an operator does.
 *
 * Deliberately not a cookie injection: the console session is a row in
 * `admin_sessions` created by the sign-in action, and a test that forged the
 * cookie would skip the only code path that creates one.
 */
export async function signInAs(page: Page, admin: AdminFixture): Promise<void> {
  await page.goto('/sign-in')
  await page.locator('input[name="email"]').fill(admin.email)
  await page.locator('input[name="password"]').fill(admin.password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30_000 })
}

export function admin(state: StackState, key: AdminKey): AdminFixture {
  return state.admins[key]
}

/**
 * Forget how often the suite has signed in.
 *
 * `signInAdmin()` allows eight attempts per address per fifteen minutes, which
 * is generous for a person and far too few for a suite that compresses a week of
 * an operator's sign-ins into two minutes. Without this, the thirtieth test
 * would be testing the rate limiter rather than what it came to test — so the
 * window is cleared before each scripted sign-in, and the limiter gets a spec of
 * its own in `sign-in.spec.ts` instead of silently governing every other one.
 */
export async function clearSignInLimit(db: Pool): Promise<void> {
  await db.query("delete from public.admin_rate_limits where scope = 'admin.sign_in'")
}

/**
 * The permissions a role holds according to the database, not according to the
 * TypeScript mirror of it.
 *
 * `permissions.ts` documents `admin_role_permissions` as the authority and
 * itself as a mirror; a suite that asserted against the mirror would be checking
 * the console against its own copy of the rules.
 */
export async function permissionsForRole(db: Pool, role: string): Promise<ReadonlySet<string>> {
  const result = await db.query<{ permission: string }>(
    'select permission::text as permission from public.admin_role_permissions where role = $1',
    [role],
  )
  return new Set(result.rows.map((row) => row.permission))
}
