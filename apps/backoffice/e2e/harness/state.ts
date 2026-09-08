import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { ARTIFACTS_DIR, STATE_FILE } from './paths.ts'

/**
 * What the harness built, handed to the specs.
 *
 * Playwright runs `globalSetup` in its own process and every worker in another,
 * so the two cannot share a variable. The state goes to a file under
 * `e2e/.artifacts/`, which is gitignored — it carries the run's generated
 * passwords, and a password that lands in a repository is a password that has to
 * be rotated. Nothing in it outlives the run.
 */

export const ADMIN_KEYS = ['owner', 'ops', 'helpdesk', 'money', 'viewer'] as const
export type AdminKey = (typeof ADMIN_KEYS)[number]

export interface AdminFixture {
  readonly key: AdminKey
  readonly adminUserId: string
  readonly authUserId: string
  readonly email: string
  readonly password: string
  /** A member of the `admin_role` enum. */
  readonly role: string
  readonly displayName: string
}

export interface UserFixture {
  readonly userId: string
  readonly email: string
  readonly emailDomain: string
}

export interface EntityFixtures {
  readonly ticketId: string
  readonly ticketReference: string
  /** Pending approval, opened by `helpdesk` about the sentinel user. */
  readonly pendingGrantId: string
  readonly flagId: string
  readonly flagKey: string
  readonly promptId: string
  readonly announcementId: string
  readonly entitlementGrantId: string
  readonly emailMessageId: string
  readonly emailThreadId: string
}

export interface StackState {
  /** Connection string for the scratch database, for assertions in specs. */
  readonly databaseUrl: string
  readonly supabaseUrl: string
  /**
   * The run's own project keys, so a spec can reach the fixture Supabase the
   * same way the console does. Generated per run and never committed; they
   * unlock one scratch database that is dropped when the suite ends.
   */
  readonly anonKey: string
  readonly serviceRoleKey: string
  readonly baseUrl: string
  /** `BACKOFFICE_ENV` the console was started with. */
  readonly environment: string
  /**
   * A string that exists nowhere but inside one seeded user's own words. If it
   * ever appears in a console response, the content-blindness promise is broken.
   */
  readonly sentinel: string
  readonly admins: Readonly<Record<AdminKey, AdminFixture>>
  readonly subjectUser: UserFixture
  readonly otherUser: UserFixture
  readonly entities: EntityFixtures
}

export function writeStackState(state: StackState): void {
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export function readStackState(): StackState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as StackState
  } catch (error) {
    throw new Error(
      `the end-to-end stack state is missing at ${path.relative(process.cwd(), STATE_FILE)}; ` +
        'run the suite through `pnpm run test:backoffice-e2e` so global setup builds it first ' +
        `(${error instanceof Error ? error.message : String(error)})`,
    )
  }
}
