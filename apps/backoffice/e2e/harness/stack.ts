import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import {
  adminDatabaseUrl,
  applySchema,
  connect,
  createScratchDatabase,
  dropScratchDatabase,
  scratchDatabaseName,
  urlForDatabase,
} from './database.ts'
import { ARTIFACTS_DIR, BACKOFFICE_ROOT, FIXTURE_SUPABASE_ENTRY } from './paths.ts'
import { newSentinel, seedFixtures } from './seed.ts'
import { writeStackState, type StackState } from './state.ts'

/**
 * Everything the suite needs, brought up and taken down as one unit.
 *
 * The order is the whole design: a scratch database, the real migrations, the
 * fixture data, the Supabase stand-in, then the console pointed at it. Each step
 * depends on the one before, which is why this is a `globalSetup` rather than a
 * list of `webServer` entries — Playwright starts those in parallel with no way
 * to say that the console must not boot before the schema exists.
 *
 * The console is built and served rather than run in development mode. A
 * development server compiles a route the first time it is asked for, and the
 * content-blindness spec asks for every route in the console; a build costs a
 * minute once and then answers every one of them the way production would.
 */

const RUNTIME_FILE = path.join(ARTIFACTS_DIR, 'runtime.json')

/** Where `next build` writes for this suite. Gitignored, never `.next`. */
const E2E_DIST_DIR = '.next-e2e'

/**
 * Progress goes to stdout rather than through `console`: the repository's ESLint
 * configuration allows only `warn` and `error` there, and a harness saying which
 * database it built is neither.
 */
function note(message: string): void {
  process.stdout.write(`[e2e] ${message}\n`)
}

interface RuntimeState {
  readonly adminDatabaseUrl: string
  readonly database: string
  readonly fixturePid: number
  readonly consolePid: number
}

/** A port nobody is listening on, asked of the kernel rather than guessed. */
async function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close()
        reject(new Error('could not reserve a local port'))
        return
      }
      const { port } = address
      probe.close(() => {
        resolve(port)
      })
    })
  })
}

async function waitForHttp(url: string, label: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = 'no attempt made'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status < 500) return
      lastError = `status ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${label} did not become reachable at ${url}: ${lastError}`)
}

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: BACKOFFICE_ROOT,
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${String(code)}`))
    })
  })
}

/**
 * Started in its own process group so teardown can end the whole tree.
 *
 * `next start` supervises workers of its own, and killing only the parent leaves
 * them holding the port — which is how the second run of a suite fails for a
 * reason that has nothing to do with the code under test.
 */
function spawnDetached(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const child = spawn(command, [...args], {
    cwd: BACKOFFICE_ROOT,
    env,
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  child.unref()
  return child
}

/**
 * Build, then put `next-env.d.ts` back the way the repository stores it.
 *
 * `next build` rewrites that file to reference the output directory it was
 * given, so building into `.next-e2e` leaves the tree dirty and pointing at a
 * directory that only exists after this suite has run — which would then fail
 * `pnpm typecheck` for the next person. Next owns the file's contents; the
 * suite borrows it for ninety seconds and hands it back.
 */
async function withUntouchedNextEnv(build: () => Promise<void>): Promise<void> {
  const file = path.join(BACKOFFICE_ROOT, 'next-env.d.ts')
  const before = existsSync(file) ? readFileSync(file, 'utf8') : null
  try {
    await build()
  } finally {
    // Guarded so a failure here cannot mask the build failure that caused it.
    if (before !== null && (!existsSync(file) || readFileSync(file, 'utf8') !== before)) {
      writeFileSync(file, before, 'utf8')
    }
  }
}

function killGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    // Already gone, which is the state we were asking for.
  }
}

function writeRuntime(runtime: RuntimeState): void {
  writeFileSync(RUNTIME_FILE, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8')
}

export async function startStack(): Promise<void> {
  mkdirSync(ARTIFACTS_DIR, { recursive: true })

  const adminUrl = adminDatabaseUrl()
  const database = scratchDatabaseName()

  // Recorded before the database exists rather than after everything is up: a
  // setup that dies half way — a migration that will not apply, a fixture
  // server that will not boot — must still leave teardown able to drop what it
  // had already created. Otherwise the failures accumulate as abandoned
  // databases on somebody's PostgreSQL.
  let runtime: RuntimeState = {
    adminDatabaseUrl: adminUrl,
    database,
    fixturePid: 0,
    consolePid: 0,
  }
  writeRuntime(runtime)

  const databaseUrl = await createScratchDatabase(adminUrl, database)
  const applied = await applySchema(databaseUrl)
  note(`applied ${applied} migrations to ${database}`)

  const sentinel = newSentinel()
  const pool = connect(databaseUrl)
  let seeded
  try {
    seeded = await seedFixtures(pool, sentinel)
  } finally {
    await pool.end()
  }

  // Generated per run. None of these values is written to a tracked file, and
  // none of them unlocks anything outside this process tree.
  const jwtSecret = randomBytes(32).toString('hex')
  const anonKey = `fixture-anon-${randomBytes(12).toString('hex')}`
  const serviceRoleKey = `fixture-service-${randomBytes(12).toString('hex')}`
  const hashSalt = `fixture-salt-${randomBytes(12).toString('hex')}`

  const fixturePort = await freePort()
  const consolePort = await freePort()
  const supabaseUrl = `http://127.0.0.1:${fixturePort}`
  const baseUrl = `http://127.0.0.1:${consolePort}`
  const environment = 'staging'

  const fixture = spawnDetached(
    process.execPath,
    // Node runs the TypeScript directly; the warning it prints about a package
    // without a `type` field is noise in the middle of the suite's own output.
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', FIXTURE_SUPABASE_ENTRY],
    {
      ...process.env,
      E2E_FIXTURE_DATABASE_URL: urlForDatabase(adminUrl, database),
      E2E_FIXTURE_JWT_SECRET: jwtSecret,
      E2E_FIXTURE_ANON_KEY: anonKey,
      E2E_FIXTURE_SERVICE_ROLE_KEY: serviceRoleKey,
      E2E_FIXTURE_PORT: String(fixturePort),
    },
  )
  runtime = { ...runtime, fixturePid: fixture.pid ?? 0 }
  writeRuntime(runtime)
  await waitForHttp(`${supabaseUrl}/__fixture/health`, 'fixture Supabase', 30_000)

  const consoleEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    BACKOFFICE_ENV: environment,
    BACKOFFICE_HASH_SALT: hashSalt,
    PORT: String(consolePort),
    NEXT_TELEMETRY_DISABLED: '1',
    // The suite's own build output. `next.config.mjs` reads this, so the build
    // and the server it serves cannot be overwritten by a `next dev` or another
    // build sharing the working tree — a collision whose symptom is a missing
    // chunk in a page nobody changed.
    BACKOFFICE_DIST_DIR: E2E_DIST_DIR,
  }

  const nextBin = path.join(BACKOFFICE_ROOT, 'node_modules', '.bin', 'next')
  const buildId = path.join(BACKOFFICE_ROOT, E2E_DIST_DIR, 'BUILD_ID')
  // CI always builds. Locally, re-running the suite against source that has not
  // changed should not cost a minute of compilation, so an explicit opt-in
  // reuses the build that is already on disk.
  const reuse = process.env['BACKOFFICE_E2E_REUSE_BUILD'] === '1' && existsSync(buildId)
  if (reuse) note(`reusing the existing ${E2E_DIST_DIR} build`)
  else await withUntouchedNextEnv(() => run(nextBin, ['build'], consoleEnv))

  const consoleServer = spawnDetached(
    nextBin,
    ['start', '--port', String(consolePort), '--hostname', '127.0.0.1'],
    consoleEnv,
  )
  runtime = { ...runtime, consolePid: consoleServer.pid ?? 0 }
  writeRuntime(runtime)
  await waitForHttp(`${baseUrl}/sign-in`, 'backoffice console')

  const state: StackState = {
    databaseUrl,
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    baseUrl,
    environment,
    sentinel,
    admins: seeded.admins,
    subjectUser: {
      userId: seeded.subjectUserId,
      email: seeded.subjectEmail,
      emailDomain: seeded.subjectEmail.split('@')[1] ?? '',
    },
    otherUser: {
      userId: seeded.otherUserId,
      email: seeded.otherEmail,
      emailDomain: seeded.otherEmail.split('@')[1] ?? '',
    },
    entities: seeded.entities,
  }
  writeStackState(state)
  note(`console on ${baseUrl}, fixture Supabase on ${supabaseUrl}`)
}

export async function stopStack(): Promise<void> {
  let runtime: RuntimeState | null = null
  try {
    runtime = JSON.parse(readFileSync(RUNTIME_FILE, 'utf8')) as RuntimeState
  } catch {
    // Setup never got far enough to record anything; there is nothing to stop.
  }
  if (runtime === null) return

  if (runtime.consolePid > 0) killGroup(runtime.consolePid)
  if (runtime.fixturePid > 0) killGroup(runtime.fixturePid)
  // The fixture server holds a pool against the scratch database; `with (force)`
  // in `dropScratchDatabase` covers the case where it has not let go yet.
  await new Promise((resolve) => setTimeout(resolve, 250))
  await dropScratchDatabase(runtime.adminDatabaseUrl, runtime.database)
  rmSync(RUNTIME_FILE, { force: true })
}
