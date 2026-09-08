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
    const match = new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const`, 'm').exec(
      enumsSource,
    )
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
    // The backoffice roster (0017). A staff member may read their own row and
    // nothing else; provisioning is service-role only.
    'staff_members',
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

  // ── Backoffice: the content-blindness guarantee ───────────────────────────
  //
  // The product promises publicly that nobody reads user mail and that support
  // cannot see message content. 0017 makes that structural by giving the staff
  // backoffice a set of `bo_*` views that never select a content column. This
  // block is the machine check on that promise, and it is deliberately not a
  // check on the views' *output* names — a view could rename `body_text` to
  // `note` — but on their actual column dependencies, re-derived from
  // `pg_depend`. Postgres records, per view, exactly which base-table columns
  // the rewrite rule reads. A view that so much as tests `payload is null`
  // shows up here and fails the build.

  const BO_VIEWS = [
    'bo_users',
    'bo_user_detail',
    'bo_accounts',
    'bo_sync_health',
    'bo_approvals',
    'bo_ai_spend',
    'bo_ai_spend_daily',
    'bo_privacy_requests',
    'bo_referrals',
    'bo_audit',
    'bo_staff',
    'bo_briefing_health',
    'bo_notification_health',
    'bo_capture_health',
    'bo_signup_daily',
    'bo_platform_overview',
  ]

  // Every column that carries something a person wrote, received, was told, or
  // that acts as a key to any of it. No backoffice view may depend on one.
  // `profiles.email`, `connected_accounts.email` and `auth.users.email` are
  // absent on purpose: they are readable, but only through bo_redact_email(),
  // which is asserted separately below.
  const CONTENT_COLUMNS = {
    email_threads: [
      'subject',
      'summary',
      'reason_important',
      'deadline_quote',
      'participant_emails',
      'external_thread_id',
    ],
    email_messages: [
      'subject',
      'snippet',
      'body_text',
      'from_email',
      'from_name',
      'to_emails',
      'cc_emails',
      'attachment_meta',
      'content_hash',
      'external_url',
      'external_message_id',
    ],
    calendar_events: [
      'title',
      'description',
      'location',
      'attendees',
      'organizer_email',
      'conference_url',
      'external_url',
      'external_event_id',
    ],
    assistant_messages: ['content', 'citations'],
    assistant_threads: ['title'],
    memory_chunks: ['content', 'topic', 'source_id', 'source_label'],
    captures: ['raw_text', 'extracted', 'storage_path', 'source_url', 'failure_reason'],
    briefings: ['narrative', 'headline', 'audio_url', 'stats', 'content_hash'],
    briefing_items: ['title', 'detail', 'source_label', 'source_id'],
    insights: ['title', 'detail', 'reason_important', 'actions', 'source_label', 'source_id'],
    life_events: ['title', 'detail', 'source_quote', 'reference', 'tracking_url', 'source_id'],
    commitments: ['text', 'source_quote', 'person_name', 'source_id'],
    contacts: ['email', 'name', 'alternate_emails', 'company', 'role', 'avatar_url'],
    vip_people: ['email', 'name'],
    approval_actions: [
      'what',
      'why',
      'payload',
      'original_payload',
      'source_label',
      'source_id',
      'idempotency_key',
      'result_ref',
    ],
    notification_deliveries: ['title', 'body', 'data', 'dedupe_key'],
    device_notifications: ['title', 'text', 'app_name', 'package_name'],
    tasks: ['title', 'notes', 'external_task_id'],
    reminders: ['title', 'body', 'source_id', 'related_entity_id'],
    follow_ups: ['recipient_email', 'recipient_name', 'message_id'],
    priority_rules: ['match_value', 'note'],
    learned_preferences: ['statement', 'match_value'],
    ai_feedback: ['note', 'entity_id'],
    profiles: ['display_name', 'given_name', 'avatar_url'],
    push_tokens: ['token', 'device_id', 'device_name'],
    subscriptions: ['revenuecat_customer_id', 'entitlement', 'product_id'],
    sync_states: ['cursor'],
    connected_accounts: ['display_name', 'external_account_id'],
    data_export_requests: ['storage_path'],
    referral_credits: ['revoked_reason'],
    // Token stores: no column of either is readable, so every column is listed
    // by wildcard below rather than enumerated here.
  }
  const TOKEN_TABLES = ['oauth_credentials', 'oauth_states']
  // 0017 reads four scalars off oauth_credentials to answer "is this grant
  // still usable" — never the ciphertext, nonce or tag.
  const TOKEN_TABLE_READABLE = [
    'connected_account_id',
    'key_version',
    'access_token_expires_at',
    'rotated_at',
    'user_id',
    'id',
  ]

  // A handful of columns are readable, but only through a guard function that
  // narrows what can come out of them. A view that reads one of these without
  // calling the named function fails the build.
  //
  //   bo_redact_email  — an address becomes `y•••@example.com`.
  //   bo_error_code    — a free-text failure becomes a token or 'unstructured'.
  //   bo_identifier    — an identifier that contains whitespace or '@' becomes
  //                      'unstructured', so a sentence cannot ride in on one.
  const GUARDED_READS = {
    'profiles.email': 'bo_redact_email',
    'connected_accounts.email': 'bo_redact_email',
    // auth.users, for a staff member with no profile row yet.
    'users.email': 'bo_redact_email',
    'sync_states.last_error': 'bo_error_code',
    'connected_accounts.last_error_code': 'bo_error_code',
    'approval_actions.failure_reason': 'bo_error_code',
    'approval_actions.failure_code': 'bo_error_code',
    'data_export_requests.failure_reason': 'bo_error_code',
    'notification_deliveries.failure_reason': 'bo_error_code',
    'captures.failure_reason': 'bo_error_code',
    'audit_logs.action': 'bo_identifier',
    'audit_logs.entity_type': 'bo_identifier',
    'audit_logs.entity_id': 'bo_identifier',
  }

  let boProblems = 0

  const existingViews = new Set(
    psql(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'bo\\_%'`,
      { database: dbName },
    )
      .trim()
      .split('\n')
      .filter(Boolean),
  )

  for (const view of BO_VIEWS) {
    if (!existingViews.has(view)) {
      fail(`backoffice view ${view} does not exist`)
      boProblems++
    }
  }

  // Exactly which base columns each bo_* view reads, straight out of the
  // catalogue. This is the whole check: it cannot be fooled by an alias, a
  // CASE expression, a cast or a comment.
  const dependencyRows = psql(
    `select distinct v.relname, rn.nspname, rt.relname, a.attname
     from pg_depend d
     join pg_rewrite r on r.oid = d.objid
     join pg_class v on v.oid = r.ev_class
     join pg_namespace vn on vn.oid = v.relnamespace
     join pg_class rt on rt.oid = d.refobjid
     join pg_namespace rn on rn.oid = rt.relnamespace
     join pg_attribute a on a.attrelid = rt.oid and a.attnum = d.refobjsubid
     where d.classid = 'pg_rewrite'::regclass
       and d.refclassid = 'pg_class'::regclass
       and d.refobjsubid > 0
       and vn.nspname = 'public'
       and v.relkind = 'v'
       and v.relname like 'bo\\_%'`,
    { database: dbName },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'))

  /** view -> the guard functions its definition must contain. */
  const requiredGuards = new Map()

  for (const [view, , table, column] of dependencyRows) {
    const qualified = `${table}.${column}`

    if (TOKEN_TABLES.includes(table) && !TOKEN_TABLE_READABLE.includes(column)) {
      fail(`${view} reads ${qualified} — token stores are unreadable from the backoffice`)
      boProblems++
      continue
    }

    if ((CONTENT_COLUMNS[table] ?? []).includes(column)) {
      fail(`${view} reads the content column ${qualified} — backoffice views must be content-blind`)
      boProblems++
      continue
    }

    const guard = GUARDED_READS[qualified]
    if (guard) {
      if (!requiredGuards.has(view)) requiredGuards.set(view, new Map())
      requiredGuards.get(view).set(guard, qualified)
    }
  }

  // A guarded column may be read only if the same view calls its guard.
  for (const [view, guards] of requiredGuards) {
    const definition = psql(`select pg_get_viewdef('public.${view}'::regclass, true)`, {
      database: dbName,
    })
    for (const [guard, qualified] of guards) {
      if (!definition.includes(guard)) {
        fail(`${view} reads ${qualified} without calling ${guard}()`)
        boProblems++
      }
    }
  }

  // Belt and braces on the projection side: no bo_* view may expose a column
  // whose name reads like content, and no column may be a bare address.
  const FORBIDDEN_OUTPUT =
    /^(email|subject|body|body_text|snippet|summary|narrative|headline|content|payload|original_payload|what|why|title|detail|notes?|statement|quote|source_quote|token|cursor|storage_path|metadata|citations|attendees|participant_emails|display_name|given_name|from_email|recipient_email)$/

  const outputRows = psql(
    `select c.relname, a.attname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'bo\\_%'`,
    { database: dbName },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'))

  for (const [view, column] of outputRows) {
    if (FORBIDDEN_OUTPUT.test(column)) {
      fail(`${view} exposes a column named "${column}" — that name is reserved for content`)
      boProblems++
    }
  }

  // Supabase's default privileges hand new objects in `public` to the client
  // roles. The views are platform-wide aggregates, so the revoke in 0017 is
  // what stops a signed-in user reading statistics about everybody.
  const leakedGrants = psql(
    `select table_name || ' -> ' || grantee
     from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name like 'bo\\_%'
       and grantee in ('anon', 'authenticated', 'PUBLIC')`,
    { database: dbName },
  )
    .trim()
    .split('\n')
    .filter(Boolean)

  if (leakedGrants.length > 0) {
    fail(`backoffice views granted to a client role: ${leakedGrants.join(', ')}`)
    boProblems++
  }

  const staffHelper = psql(
    `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('bo_is_staff', 'bo_staff_role', 'bo_redact_email', 'bo_error_code')`,
    { database: dbName },
  ).trim()

  if (staffHelper !== '4') {
    fail(`expected 4 backoffice helper functions, found ${staffHelper}`)
    boProblems++
  }

  // The redaction must actually redact: first character, three bullets, domain.
  const redacted = psql(`select public.bo_redact_email('yunus.emre@example.com')`, {
    database: dbName,
  }).trim()
  if (redacted !== `y${'•'.repeat(3)}@example.com`) {
    fail(`bo_redact_email produced "${redacted}"`)
    boProblems++
  }

  // A sentence-shaped provider error must be classified, never echoed.
  const classified = psql(
    `select public.bo_error_code('Recipient address rejected: ali@example.com')`,
    { database: dbName },
  ).trim()
  if (classified !== 'unstructured') {
    fail(`bo_error_code echoed a free-text error as "${classified}"`)
    boProblems++
  }

  if (boProblems === 0) {
    ok(`${BO_VIEWS.length} backoffice views are content-blind and service-role only`)
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
