#!/usr/bin/env node
/**
 * Applies every migration to a throwaway PostgreSQL database and asserts the
 * result, so a broken migration fails CI rather than a deploy.
 *
 * What it checks:
 *   - every migration applies cleanly, in order, from an empty database;
 *   - applying the whole set a second time is a no-op (migrations are
 *     re-runnable, which is what makes a partial failure recoverable);
 *   - every Postgres enum matches the TypeScript union it mirrors;
 *   - RLS is enabled and forced on every user table, and every table that is
 *     supposed to be client-readable actually has a policy.
 *
 * It needs a reachable PostgreSQL 15+ (`SUPABASE_DB_URL`, or the local
 * defaults). Without one it skips with a clear message rather than failing —
 * a contributor without a database should still be able to run `pnpm verify`.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')

const DB_URL =
  process.env.SUPABASE_VALIDATE_DB_URL ??
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres@/postgres?host=/tmp&port=55432'

function psql(sql, { database } = {}) {
  const url = database ? DB_URL.replace(/\/postgres(\?|$)/, `/${database}$1`) : DB_URL
  return execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function psqlFile(file, database) {
  const url = DB_URL.replace(/\/postgres(\?|$)/, `/${database}$1`)
  return execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-f', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function canConnect() {
  try {
    psql('select 1')
    return true
  } catch {
    return false
  }
}

if (!canConnect()) {
  console.warn(
    '[validate-supabase] No PostgreSQL reachable at ' +
      DB_URL.replace(/:[^:@/]*@/, ':***@') +
      ' — skipping migration validation.\n' +
      '  Start one with `supabase start`, or set SUPABASE_VALIDATE_DB_URL.',
  )
  process.exit(0)
}

const dbName = `da_validate_${Date.now().toString(36)}`
let failed = false

function fail(message) {
  failed = true
  console.error(`  ✗ ${message}`)
}

function ok(message) {
  console.log(`  ✓ ${message}`)
}

try {
  psql(`drop database if exists ${dbName}`)
  psql(`create database ${dbName}`)

  // Supabase provides `auth.users` and `storage.*`; a bare Postgres does not,
  // so the minimum surface the migrations reference is stubbed in first.
  psqlFile(path.join(root, 'scripts/sql/supabase-shim.sql'), dbName)

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    fail('no migrations found')
  }

  for (const file of files) {
    try {
      psqlFile(path.join(migrationsDir, file), dbName)
    } catch (error) {
      fail(`${file} failed to apply:\n${String(error.stderr ?? error.message).trim()}`)
      throw error
    }
  }
  ok(`${files.length} migrations applied`)

  // Re-runnability: a migration set that cannot be re-applied leaves a project
  // stuck after any partial failure.
  for (const file of files) {
    try {
      psqlFile(path.join(migrationsDir, file), dbName)
    } catch (error) {
      fail(`${file} is not safe to re-run:\n${String(error.stderr ?? error.message).trim()}`)
    }
  }
  if (!failed) ok('migrations are re-runnable')

  // ── Enum parity with the TypeScript unions ────────────────────────────────
  const enumsSource = readFileSync(path.join(root, 'packages/domain/src/enums.ts'), 'utf8')

  const tsUnion = (constName) => {
    const match = new RegExp(
      `export const ${constName} = \\[([\\s\\S]*?)\\] as const`,
      'm',
    ).exec(enumsSource)
    if (!match) return null
    return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  }

  const ENUM_MAP = {
    importance_level: 'IMPORTANCE_LEVELS',
    email_category: 'EMAIL_CATEGORIES',
    provider_kind: 'PROVIDERS',
    account_kind: 'ACCOUNT_KINDS',
    connection_status: 'CONNECTION_STATUSES',
    approval_status: 'APPROVAL_STATUSES',
    approval_action_type: 'APPROVAL_ACTION_TYPES',
    life_event_type: 'LIFE_EVENT_TYPES',
    briefing_kind: 'BRIEFING_KINDS',
    briefing_status: 'BRIEFING_STATUSES',
    commitment_direction: 'COMMITMENT_DIRECTIONS',
    commitment_status: 'COMMITMENT_STATUSES',
    task_status: 'TASK_STATUSES',
    priority_rule_kind: 'PRIORITY_RULE_KINDS',
    capture_kind: 'CAPTURE_KINDS',
    capture_status: 'CAPTURE_STATUSES',
    capture_intent: 'CAPTURE_INTENTS',
    notification_category: 'NOTIFICATION_CATEGORIES',
    lock_screen_privacy: 'LOCK_SCREEN_PRIVACY',
    retention_window: 'RETENTION_WINDOWS',
    source_type: 'SOURCE_TYPES',
    reply_tone: 'REPLY_TONES',
    subscription_status: 'SUBSCRIPTION_STATUSES',
    export_status: 'EXPORT_STATUSES',
    sync_status: 'SYNC_STATUSES',
    app_locale: 'LOCALES',
    feedback_signal: 'FEEDBACK_SIGNALS',
  }

  let enumMismatches = 0
  for (const [pgEnum, tsConst] of Object.entries(ENUM_MAP)) {
    const expected = tsUnion(tsConst)
    if (!expected) {
      fail(`enum ${pgEnum}: TypeScript constant ${tsConst} not found`)
      enumMismatches++
      continue
    }
    const actual = psql(
      `select string_agg(e.enumlabel, ',' order by e.enumsortorder)
       from pg_type t join pg_enum e on e.enumtypid = t.oid
       where t.typname = '${pgEnum}'`,
      { database: dbName },
    ).trim()

    if (!actual) {
      fail(`enum ${pgEnum} does not exist in the database`)
      enumMismatches++
    } else if (actual !== expected.join(',')) {
      fail(`enum ${pgEnum} drifted\n      pg: ${actual}\n      ts: ${expected.join(',')}`)
      enumMismatches++
    }
  }
  if (enumMismatches === 0) ok(`${Object.keys(ENUM_MAP).length} enums match packages/domain`)

  // ── Row Level Security ────────────────────────────────────────────────────
  const USER_TABLES = [
    'profiles',
    'user_preferences',
    'notification_preferences',
    'subscriptions',
    'connected_accounts',
    'oauth_credentials',
    'oauth_states',
    'sync_states',
    'email_threads',
    'email_messages',
    'calendar_events',
    'tasks',
    'commitments',
    'reminders',
    'contacts',
    'vip_people',
    'priority_rules',
    'learned_preferences',
    'insights',
    'life_events',
    'follow_ups',
    'briefings',
    'briefing_items',
    'approval_actions',
    'assistant_threads',
    'assistant_messages',
    'memory_chunks',
    'captures',
    'push_tokens',
    'notification_deliveries',
    'device_notifications',
    'referrals',
    'referral_credits',
    'ai_feedback',
    'ai_usage_events',
    'rate_limit_counters',
    'audit_logs',
    'data_export_requests',
  ]

  const rlsRows = psql(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'`,
    { database: dbName },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'))

  const rlsByTable = new Map(rlsRows.map(([name, enabled, forced]) => [name, { enabled, forced }]))

  let rlsProblems = 0
  for (const table of USER_TABLES) {
    const state = rlsByTable.get(table)
    if (!state) {
      fail(`table ${table} does not exist`)
      rlsProblems++
      continue
    }
    if (state.enabled !== 't') {
      fail(`table ${table} does not have RLS enabled`)
      rlsProblems++
    }
    if (state.forced !== 't') {
      fail(`table ${table} does not FORCE row level security`)
      rlsProblems++
    }
  }
  if (rlsProblems === 0) ok(`RLS enabled and forced on ${USER_TABLES.length} tables`)

  // Tables that must be unreachable by a client under any policy.
  const SERVICE_ROLE_ONLY = [
    'oauth_credentials',
    // A client that could read or write this table could bind another user's
    // consent to its own account, so it carries RLS with no policies at all.
    'oauth_states',
    'audit_logs',
    'ai_usage_events',
    'rate_limit_counters',
    'notification_deliveries',
  ]

  let policyProblems = 0
  const policyRows = psql(
    `select tablename, count(*) from pg_policies where schemaname = 'public' group by tablename`,
    { database: dbName },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'))

  const policyCount = new Map(policyRows.map(([name, count]) => [name, Number(count)]))

  for (const table of SERVICE_ROLE_ONLY) {
    if ((policyCount.get(table) ?? 0) > 0) {
      fail(`${table} must have no policies (service-role only) but has ${policyCount.get(table)}`)
      policyProblems++
    }
  }

  for (const table of USER_TABLES) {
    if (SERVICE_ROLE_ONLY.includes(table)) continue
    if ((policyCount.get(table) ?? 0) === 0) {
      fail(`${table} has RLS enabled but no policies — it is unreadable by every client`)
      policyProblems++
    }
  }
  if (policyProblems === 0) ok('policy coverage is correct')

  // Every policy must actually constrain by the current user; a policy whose
  // qualifier does not mention auth.uid() would expose other users' rows.
  const looseRows = psql(
    `select tablename || '.' || policyname
     from pg_policies
     where schemaname = 'public'
       and coalesce(qual, '') not like '%auth.uid()%'
       and coalesce(with_check, '') not like '%auth.uid()%'`,
    { database: dbName },
  )
    .trim()
    .split('\n')
    .filter(Boolean)

  if (looseRows.length > 0) {
    fail(`policies not scoped to auth.uid(): ${looseRows.join(', ')}`)
  } else {
    ok('every policy is scoped to auth.uid()')
  }
} catch (error) {
  if (!failed) {
    console.error(`[validate-supabase] ${String(error.stderr ?? error.message).trim()}`)
    failed = true
  }
} finally {
  try {
    psql(`drop database if exists ${dbName}`)
  } catch {
    // The temp database is disposable; a failure to drop it is not a build error.
  }
}

if (failed) {
  console.error('\n[validate-supabase] FAILED')
  process.exit(1)
}
console.log('\n[validate-supabase] OK')
