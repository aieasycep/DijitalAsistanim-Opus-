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
 *     supposed to be client-readable actually has a policy;
 *   - the backoffice views (0017) are content-blind and service-role only;
 *   - the admin platform (0019) actually enforces its invariants — the last
 *     super_admin cannot be removed, a feature has at most one active prompt,
 *     a sensitive audit row cannot be written without an actor and a reason,
 *     and user content cannot be revealed without an approved, unexpired,
 *     four-eyes Support Access grant that logs the reveal.
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

/**
 * Run `sql` expecting the database to REFUSE it.
 *
 * The admin platform's guarantees are triggers and constraints, and a trigger
 * that was dropped, or a constraint written with a typo that makes it always
 * true, both look perfectly healthy in the catalogue. The only honest test is to
 * attempt the forbidden thing and require an error mentioning the rule that
 * should have stopped it.
 *
 * Returns null when the statement was correctly rejected, or a message
 * describing what went wrong.
 */
function expectRejected(sql, expectedFragment, database) {
  try {
    psql(sql, { database })
    return `was accepted; expected a rejection mentioning "${expectedFragment}"`
  } catch (error) {
    const text = String(error.stderr ?? error.message)
    if (!text.includes(expectedFragment)) {
      return `was rejected, but not by "${expectedFragment}":\n      ${text.trim().split('\n')[0]}`
    }
    return null
  }
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

  // ── Admin platform enums (0019) ───────────────────────────────────────────
  //
  // These are asserted against a literal list rather than against a TypeScript
  // constant, because this file IS the contract the app packages are written
  // against. Where the matching constant already exists in packages/domain the
  // two are compared as well, so the day someone adds `ADMIN_ROLES` with the
  // members in a different order, the build says so instead of the decoder
  // silently mapping `finance` onto `ai_ops`.
  const ADMIN_ENUMS = {
    admin_role: {
      tsConst: 'ADMIN_ROLES',
      members: ['super_admin', 'operations', 'support', 'finance', 'ai_ops', 'analyst', 'readonly'],
    },
    admin_status: { tsConst: 'ADMIN_STATUSES', members: ['invited', 'active', 'disabled'] },
    support_ticket_status: {
      tsConst: 'SUPPORT_TICKET_STATUSES',
      members: ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'],
    },
    support_ticket_priority: {
      tsConst: 'SUPPORT_TICKET_PRIORITIES',
      members: ['low', 'normal', 'high', 'critical'],
    },
    support_ticket_category: {
      tsConst: 'SUPPORT_TICKET_CATEGORIES',
      members: [
        'account',
        'integration',
        'sync',
        'billing',
        'ai_quality',
        'notification',
        'privacy',
        'other',
      ],
    },
    app_platform: { tsConst: 'APP_PLATFORMS', members: ['ios', 'android', 'web'] },
    app_plan: { tsConst: 'APP_PLANS', members: ['free', 'pro'] },
    announcement_audience: {
      tsConst: 'ANNOUNCEMENT_AUDIENCES',
      members: ['all', 'free', 'pro', 'ios', 'android'],
    },
    prompt_status: { tsConst: 'PROMPT_STATUSES', members: ['draft', 'active', 'archived'] },
    system_health_status: {
      tsConst: 'SYSTEM_HEALTH_STATUSES',
      members: ['operational', 'degraded', 'down', 'unknown'],
    },
    admin_grant_kind: {
      tsConst: 'ADMIN_GRANT_KINDS',
      members: ['trial_extension', 'goodwill', 'compensation', 'beta_access'],
    },
    support_access_scope: {
      tsConst: 'SUPPORT_ACCESS_SCOPES',
      members: [
        'identity',
        'email_subject',
        'email_body',
        'calendar_detail',
        'assistant_conversation',
        'capture_content',
        'approval_payload',
        'notification_content',
      ],
    },
    support_access_status: {
      tsConst: 'SUPPORT_ACCESS_STATUSES',
      members: ['pending_approval', 'active', 'denied', 'expired', 'revoked'],
    },
  }

  let adminEnumProblems = 0
  for (const [pgEnum, spec] of Object.entries(ADMIN_ENUMS)) {
    const actual = psql(
      `select string_agg(e.enumlabel, ',' order by e.enumsortorder)
       from pg_type t join pg_enum e on e.enumtypid = t.oid
       where t.typname = '${pgEnum}'`,
      { database: dbName },
    ).trim()

    if (!actual) {
      fail(`enum ${pgEnum} does not exist in the database`)
      adminEnumProblems++
      continue
    }
    if (actual !== spec.members.join(',')) {
      fail(`enum ${pgEnum} drifted\n      pg: ${actual}\n      expected: ${spec.members.join(',')}`)
      adminEnumProblems++
      continue
    }

    const ts = tsUnion(spec.tsConst)
    if (ts && ts.join(',') !== spec.members.join(',')) {
      fail(
        `enum ${pgEnum} does not match packages/domain ${spec.tsConst}` +
          `\n      pg: ${spec.members.join(',')}\n      ts: ${ts.join(',')}`,
      )
      adminEnumProblems++
    }
  }

  // Every permission the schema knows about must be granted to super_admin and
  // to nobody by accident: an enum member with no role behind it is a screen
  // that can never be opened.
  const orphanPermissions = psql(
    `select string_agg(p::text, ', ')
     from unnest(enum_range(null::admin_permission)) p
     where not exists (
       select 1 from public.admin_role_permissions rp where rp.permission = p
     )`,
    { database: dbName },
  ).trim()

  if (orphanPermissions) {
    fail(`admin_permission members granted to no role: ${orphanPermissions}`)
    adminEnumProblems++
  }

  if (adminEnumProblems === 0) {
    ok(
      `${Object.keys(ADMIN_ENUMS).length} admin-platform enums match 0019 and every permission is assigned`,
    )
  }

  // ── The role labels an operator reads ─────────────────────────────────────
  //
  // `admin_roles` is a readable relation, so `label_tr` and `description_tr`
  // can reach a screen; `permissions.ts` carries copies for the paths with no
  // database round trip. They had drifted — the seed said "Yapay Zeka Ops" for
  // a role the console called "Yapay Zekâ Operasyonları", every description was
  // written without Turkish characters, and the analyst's omitted the part that
  // matters (that `redact.ts` puts it alone at the aggregate level, so it
  // cannot see who a row is about).
  //
  // This check lives here, and not in the migration that fixed them, because a
  // check placed after that migration's own UPDATEs is unreachable: they repair
  // exactly what it would test. Running after every migration is the only point
  // where drift introduced by a *later* one is still visible.
  const permissionsSource = readFileSync(
    path.join(root, 'apps/backoffice/src/lib/permissions.ts'),
    'utf8',
  )

  /** `{ role: text }` from a frozen `Record<AdminRole, string>` literal. */
  function tsRoleMap(constName) {
    const start = permissionsSource.indexOf(`export const ${constName}`)
    if (start === -1) return null
    const open = permissionsSource.indexOf('{', start)
    const close = permissionsSource.indexOf('})', open)
    const body = permissionsSource.slice(open, close)
    const entries = [...body.matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)]
    return Object.fromEntries(entries.map((m) => [m[1], m[2].replace(/\\'/g, "'")]))
  }

  const tsLabels = tsRoleMap('ROLE_LABELS_TR')
  const tsDescriptions = tsRoleMap('ROLE_DESCRIPTIONS_TR')
  let labelProblems = 0

  if (!tsLabels || !tsDescriptions) {
    fail('permissions.ts: ROLE_LABELS_TR or ROLE_DESCRIPTIONS_TR could not be read')
    labelProblems++
  } else {
    const rows = psql(
      `select role::text || '\t' || label_tr || '\t' || description_tr
       from public.admin_roles order by role`,
      { database: dbName },
    )
      .trim()
      .split('\n')
      .filter(Boolean)

    for (const row of rows) {
      const [role, label, description] = row.split('\t')
      if (tsLabels[role] !== label) {
        fail(
          `admin_roles.${role}.label_tr is ${JSON.stringify(label)}; ROLE_LABELS_TR says ${JSON.stringify(tsLabels[role])}`,
        )
        labelProblems++
      }
      if (tsDescriptions[role] !== description) {
        fail(
          `admin_roles.${role}.description_tr is ${JSON.stringify(description)}; ROLE_DESCRIPTIONS_TR says ${JSON.stringify(tsDescriptions[role])}`,
        )
        labelProblems++
      }
    }

    if (labelProblems === 0) {
      ok(`${rows.length} role labels and descriptions match permissions.ts`)
    }
  }

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
    // The admin platform (0019). None of these is part of the product, so all
    // of them appear in SERVICE_ROLE_ONLY below as well: RLS on, zero policies.
    'admin_roles',
    'admin_role_permissions',
    'admin_users',
    'admin_invites',
    'admin_sessions',
    'admin_rate_limits',
    'admin_sensitive_actions',
    'support_tickets',
    'support_notes',
    'feature_flags',
    'feature_flag_overrides',
    'announcements',
    'prompt_versions',
    'system_health_checks',
    'admin_entitlement_grants',
    'support_access_grants',
    'support_access_reveals',
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
    // The admin platform is not part of the product. A signed-in Dijital
    // Asistan user must reach none of it — that separation IS the admin
    // authorization layer, so a policy appearing on any of these is a defect,
    // not a feature.
    'admin_roles',
    'admin_role_permissions',
    'admin_users',
    'admin_invites',
    'admin_sessions',
    'admin_rate_limits',
    'admin_sensitive_actions',
    'support_tickets',
    'support_notes',
    'feature_flags',
    'feature_flag_overrides',
    'announcements',
    'prompt_versions',
    'system_health_checks',
    'admin_entitlement_grants',
    'support_access_grants',
    'support_access_reveals',
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
    // 0019 keeps the same prefix and the same rule: the admin platform's own
    // views are blind too, so an operator reading the console never picks up a
    // ticket body or a prompt through a side door.
    'bo_admin_users',
    'bo_admin_permissions',
    'bo_admin_sessions',
    'bo_support_ticket_stats',
    'bo_support_access_grants',
    'bo_support_access_reveals',
    'bo_feature_flags',
    'bo_feature_flag_overrides',
    'bo_prompt_versions',
    'bo_system_health',
    'bo_entitlement_grants',
    'bo_entitlement_sources',
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
    // ── 0019 ────────────────────────────────────────────────────────────────
    // A support ticket's subject and body are written by a person about their
    // own problem and routinely quote a subject line or an address. They are
    // readable from the ticket table by an operator working that ticket, and
    // are never aggregated into a dashboard view.
    support_tickets: ['subject', 'body', 'resolution_note', 'external_ref'],
    support_notes: ['body'],
    // The prompt body is company IP rather than user content, but it is long
    // and has no business being carried in a list query.
    prompt_versions: ['body'],
    // Announcement copy is authored by the company and served to users by the
    // app, not summarised in the operations console.
    announcements: ['title', 'body'],
    // A session token hash is a replayable secret if it ever leaves the server,
    // and the user agent plus the IP hash are a device fingerprint.
    admin_sessions: ['token_hash', 'ip_hash', 'user_agent'],
    // An invite token hash is the invite. Projecting it would let a reader of
    // the console mint an admin account.
    admin_invites: ['token_hash'],
    // Rate-limit subject keys are hashed identifiers; they are the limiter's
    // business and nobody else's.
    admin_rate_limits: ['subject_key'],
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
    // 0019. An admin is a person too: their address is redacted in the console
    // exactly as a user's is.
    'admin_users.email': 'bo_redact_email',
    // A probe failure quotes the request that failed, so it is classified.
    'system_health_checks.error_code': 'bo_error_code',
    // The reveal log records which record was opened. bo_identifier is what
    // stops that column becoming a place to stash the content instead.
    'support_access_reveals.entity_id': 'bo_identifier',
    'support_access_reveals.entity_type': 'bo_identifier',
    'support_access_reveals.request_id': 'bo_identifier',
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

  // ── Admin platform: the invariants, exercised rather than inspected ───────
  //
  // 0019 makes four promises the product owner asked for by name, and every one
  // of them is a trigger, a constraint or a partial index. A dropped trigger and
  // a constraint written with a typo that makes it always true both look
  // perfectly healthy in the catalogue, so this block attempts each forbidden
  // thing against the throwaway database and requires the database to refuse it.

  let adminProblems = 0

  const adminFail = (message) => {
    fail(message)
    adminProblems++
  }

  // Columns whose NOT NULL is the whole point: an action nobody can justify in
  // writing is an action that should not have a button.
  const REQUIRED_NOT_NULL = [
    ['support_access_grants', 'reason'],
    ['admin_entitlement_grants', 'reason'],
    ['feature_flag_overrides', 'reason'],
    ['support_tickets', 'subject'],
    ['support_notes', 'body'],
    ['admin_users', 'email'],
    ['admin_invites', 'token_hash'],
    ['admin_sessions', 'token_hash'],
    ['admin_sessions', 'expires_at'],
    ['admin_sessions', 'absolute_expires_at'],
    ['support_access_grants', 'expires_at'],
    ['admin_entitlement_grants', 'granted_by'],
    ['support_access_reveals', 'grant_id'],
    ['support_access_reveals', 'admin_user_id'],
    ['support_access_reveals', 'scope'],
  ]

  const nullableRows = new Set(
    psql(
      `select table_name || '.' || column_name
       from information_schema.columns
       where table_schema = 'public' and is_nullable = 'YES'`,
      { database: dbName },
    )
      .trim()
      .split('\n')
      .filter(Boolean),
  )

  for (const [table, column] of REQUIRED_NOT_NULL) {
    if (nullableRows.has(`${table}.${column}`)) {
      adminFail(`${table}.${column} must be NOT NULL`)
    }
  }

  // The one-active-prompt rule is a partial unique index, not application code.
  const activePromptIndex = psql(
    `select coalesce(pg_get_indexdef(i.indexrelid), '')
     from pg_index i
     join pg_class c on c.oid = i.indexrelid
     where c.relname = 'prompt_versions_one_active_per_feature'`,
    { database: dbName },
  ).trim()

  if (
    !/unique/i.test(activePromptIndex) ||
    !/where.*status.*=.*'active'/is.test(activePromptIndex)
  ) {
    adminFail(
      `prompt_versions_one_active_per_feature is not a partial unique index on status = 'active': ${activePromptIndex || 'missing'}`,
    )
  }

  // Nothing in the admin platform may be reachable from a client role — not the
  // tables, and not the functions that decide authorization or return content.
  const leakedAdminGrants = psql(
    `select table_name || ' -> ' || grantee
     from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated', 'PUBLIC')
       and table_name in (
         'admin_roles', 'admin_role_permissions', 'admin_users', 'admin_invites',
         'admin_sessions', 'admin_rate_limits', 'admin_sensitive_actions',
         'support_tickets', 'support_notes', 'feature_flags', 'feature_flag_overrides',
         'announcements', 'prompt_versions', 'system_health_checks',
         'admin_entitlement_grants', 'support_access_grants', 'support_access_reveals'
       )`,
    { database: dbName },
  )
    .trim()
    .split('\n')
    .filter(Boolean)

  if (leakedAdminGrants.length > 0) {
    adminFail(`admin platform tables granted to a client role: ${leakedAdminGrants.join(', ')}`)
  }

  const leakedFunctions = psql(
    `select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (
         p.proname like 'sa\\_%'
         or p.proname like 'admin\\_%'
         or p.proname like 'bo\\_%'
         or p.proname like 'support\\_access\\_%'
         or p.proname like 'audit\\_logs\\_%'
         or p.proname like 'feature\\_flag\\_%'
       )
       and (
         has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       )`,
    { database: dbName },
  ).trim()

  if (leakedFunctions) {
    adminFail(`admin platform functions executable by a client role: ${leakedFunctions}`)
  }

  // Every one of the actions the specification names must be classified as
  // sensitive, or the accountability trigger will wave it through.
  const REQUIRED_SENSITIVE_ACTIONS = [
    'admin.signed_in',
    'admin.role_changed',
    'admin.disabled',
    'user.disabled',
    'integration.disconnected',
    'integration.force_resync',
    'entitlement.granted',
    'feature_flag.changed',
    'prompt.activated',
    'ai.model_changed',
    'deletion.retried',
    'support_access.revealed',
  ]

  const knownSensitive = new Set(
    psql(`select action from public.admin_sensitive_actions`, { database: dbName })
      .trim()
      .split('\n')
      .filter(Boolean),
  )

  for (const action of REQUIRED_SENSITIVE_ACTIONS) {
    if (!knownSensitive.has(action)) {
      adminFail(
        `admin_sensitive_actions is missing "${action}" — it would be audited without a reason`,
      )
    }
  }

  // ── Live probes ──────────────────────────────────────────────────────────
  const SA1 = '00000000-0000-4000-9000-000000000001'
  const SA2 = '00000000-0000-4000-9000-000000000002'
  const SUP = '00000000-0000-4000-9000-000000000003'
  const SUBJECT = '00000000-0000-4000-8000-000000000009'
  const GRANT = '00000000-0000-4000-a000-000000000001'
  const REVEAL_REASON = 'Kullanici mail senkronu calismiyor, DA-001 numarali talep'

  psql(
    `insert into auth.users (id, email) values
       ('00000000-0000-4000-8000-000000000001', 'sa1@example.com'),
       ('00000000-0000-4000-8000-000000000002', 'sa2@example.com'),
       ('00000000-0000-4000-8000-000000000003', 'support@example.com'),
       ('${SUBJECT}', 'kullanici@example.com');
     insert into public.admin_users (id, user_id, email, role, status) values
       ('${SA1}', '00000000-0000-4000-8000-000000000001', 'sa1@example.com', 'super_admin', 'active'),
       ('${SA2}', '00000000-0000-4000-8000-000000000002', 'sa2@example.com', 'operations', 'active'),
       ('${SUP}', '00000000-0000-4000-8000-000000000003', 'support@example.com', 'support', 'active');`,
    { database: dbName },
  )

  /** Each probe attempts something the database must refuse. */
  const REJECTIONS = [
    [
      'the last super_admin cannot be demoted',
      `update public.admin_users set role = 'operations' where id = '${SA1}'`,
      'admin_last_super_admin',
    ],
    [
      'the last super_admin cannot be disabled',
      `update public.admin_users set status = 'disabled', disabled_at = now(), disabled_reason = 'test' where id = '${SA1}'`,
      'admin_last_super_admin',
    ],
    [
      'the last super_admin cannot be deleted',
      `delete from public.admin_users where id = '${SA1}'`,
      'admin_last_super_admin',
    ],
    [
      'the last super_admin cannot be unbound from its auth account',
      `delete from auth.users where id = '00000000-0000-4000-8000-000000000001'`,
      'admin_last_super_admin',
    ],
    [
      'a sensitive action cannot be audited without an actor',
      `insert into public.audit_logs (action) values ('entitlement.granted')`,
      'audit_actor_required',
    ],
    [
      'a destructive action cannot be audited without a reason',
      `insert into public.audit_logs (action, actor_admin_user_id) values ('prompt.activated', '${SA1}')`,
      'audit_reason_required',
    ],
    [
      'an unlisted action in the admin. namespace is still accountable',
      `insert into public.audit_logs (action) values ('admin.something_invented_later')`,
      'audit_actor_required',
    ],
    [
      'an unlisted action in the support_access. namespace is still accountable',
      `insert into public.audit_logs (action, actor_admin_user_id) values ('support_access.exported', '${SA1}')`,
      'audit_reason_required',
    ],
    [
      'a Support Access reason shorter than a sentence is refused',
      `insert into public.support_access_grants (admin_user_id, subject_user_id, scopes, reason, expires_at)
       values ('${SUP}', '${SUBJECT}', array['identity']::support_access_scope[], 'gerekli', now() + interval '1 hour')`,
      'support_access_grants_reason_is_written',
    ],
    [
      'a Support Access window longer than 24 hours is refused',
      `insert into public.support_access_grants (admin_user_id, subject_user_id, scopes, reason, expires_at)
       values ('${SUP}', '${SUBJECT}', array['identity']::support_access_scope[], '${REVEAL_REASON}', now() + interval '25 hours')`,
      'support_access_grants_window_is_short',
    ],
    [
      'a Support Access grant cannot be approved by its own requester',
      `insert into public.support_access_grants
         (admin_user_id, subject_user_id, scopes, reason, expires_at, status, approved_by, approved_at, granted_at)
       values ('${SUP}', '${SUBJECT}', array['identity']::support_access_scope[], '${REVEAL_REASON}',
               now() + interval '1 hour', 'active', '${SUP}', now(), now())`,
      'support_access_grants_four_eyes',
    ],
    [
      'a temporary Pro grant cannot be made without a reason',
      `insert into public.admin_entitlement_grants (user_id, days, granted_by, expires_at, reason)
       values ('${SUBJECT}', 7, '${SA1}', now() + interval '7 days', '  ')`,
      'admin_entitlement_grants_reason_not_blank',
    ],
    [
      'a feature flag override cannot be pinned without a reason',
      `insert into public.feature_flag_overrides (flag_id, user_id, enabled, reason, created_by)
       values (gen_random_uuid(), '${SUBJECT}', true, '', '${SA1}')`,
      'feature_flag_overrides_reason_not_blank',
    ],
    [
      'a health check cannot claim operational without a measurement',
      `insert into public.system_health_checks (target, status) values ('google_gmail', 'operational')`,
      'system_health_checks_verdict_needs_measurement',
    ],
    [
      'a health check cannot claim down without an error code',
      `insert into public.system_health_checks (target, status, latency_ms) values ('google_gmail', 'down', 12)`,
      'system_health_checks_down_needs_code',
    ],
    [
      'an admin rate-limit subject must be a hash, never a raw identifier',
      `select public.admin_enforce_rate_limit('admin.sign_in', 'ali@example.com', 5, interval '15 minutes')`,
      'admin_rate_limits_subject_is_hash',
    ],
    [
      'revoking every session requires a written reason',
      `select public.admin_revoke_sessions('${SA1}', '')`,
      'admin_reason_required',
    ],
    [
      'an invite token must be stored as a sha256 digest',
      `insert into public.admin_invites (email, role, token_hash, invited_by, expires_at)
       values ('yeni@example.com', 'support', 'plain-token'::bytea, '${SA1}', now() + interval '1 day')`,
      'admin_invites_token_hash_is_sha256',
    ],
  ]

  for (const [label, sql, expected] of REJECTIONS) {
    const problem = expectRejected(sql, expected, dbName)
    if (problem) adminFail(`${label}: ${problem}`)
  }

  // The accountability trigger must not reach past the admin console. Product
  // events are written by edge functions that have no admin actor and no reason
  // to give; if this insert ever starts failing, syncing and approvals stop
  // recording anything at all.
  try {
    psql(
      `insert into public.audit_logs (user_id, action, entity_type, metadata)
       values ('${SUBJECT}', 'sync.failed', 'connected_account', '{"outcome":"provider_error"}'::jsonb)`,
      { database: dbName },
    )
  } catch (error) {
    adminFail(
      `an edge-function audit event was refused by the admin accountability trigger: ${
        String(error.stderr ?? error.message)
          .trim()
          .split('\n')[0]
      }`,
    )
  }

  // Two active prompt versions for one feature.
  psql(
    `insert into public.prompt_versions (feature, version, status, body, created_by, activated_by, activated_at)
     values ('email_analysis', 1, 'active', 'ilk sürüm', '${SA1}', '${SA1}', now())`,
    { database: dbName },
  )
  const twoActive = expectRejected(
    `insert into public.prompt_versions (feature, version, status, body, created_by, activated_by, activated_at)
     values ('email_analysis', 2, 'active', 'ikinci sürüm', '${SA1}', '${SA1}', now())`,
    'prompt_versions_one_active_per_feature',
    dbName,
  )
  if (twoActive) adminFail(`a feature cannot have two active prompt versions: ${twoActive}`)

  // A second super_admin unlocks the demotion the floor was refusing.
  psql(`update public.admin_users set role = 'super_admin' where id = '${SA2}'`, {
    database: dbName,
  })
  try {
    psql(`update public.admin_users set role = 'operations' where id = '${SA1}'`, {
      database: dbName,
    })
    psql(`update public.admin_users set role = 'super_admin' where id = '${SA1}'`, {
      database: dbName,
    })
  } catch (error) {
    adminFail(
      `demoting a super_admin while another remains was refused: ${
        String(error.stderr ?? error.message)
          .trim()
          .split('\n')[0]
      }`,
    )
  }

  // The reveal path, end to end.
  psql(
    `insert into public.support_access_grants
       (id, admin_user_id, subject_user_id, scopes, reason, expires_at, status, approved_by, approved_at, granted_at)
     values ('${GRANT}', '${SUP}', '${SUBJECT}', array['identity']::support_access_scope[],
             '${REVEAL_REASON}', now() + interval '1 hour', 'active', '${SA2}', now(), now())`,
    { database: dbName },
  )

  const revealProbes = [
    [
      'a reveal outside the granted scope is refused',
      `select * from public.sa_reveal_email_message('${GRANT}', '${SUP}', gen_random_uuid())`,
      'support_access_scope_denied',
    ],
    [
      'a reveal by an admin the grant does not name is refused',
      `select * from public.sa_reveal_identity('${GRANT}', '${SA1}')`,
      'support_access_wrong_admin',
    ],
    [
      'a reveal against an unknown grant is refused',
      `select * from public.sa_reveal_identity(gen_random_uuid(), '${SUP}')`,
      'support_access_unknown_grant',
    ],
  ]

  for (const [label, sql, expected] of revealProbes) {
    const problem = expectRejected(sql, expected, dbName)
    if (problem) adminFail(`${label}: ${problem}`)
  }

  // The permitted reveal must succeed AND must have logged itself.
  try {
    psql(`select * from public.sa_reveal_identity('${GRANT}', '${SUP}', 'probe-1')`, {
      database: dbName,
    })
  } catch (error) {
    adminFail(
      `an in-scope reveal was refused: ${
        String(error.stderr ?? error.message)
          .trim()
          .split('\n')[0]
      }`,
    )
  }

  const revealLog = psql(
    `select count(*) from public.support_access_reveals
     where grant_id = '${GRANT}' and admin_user_id = '${SUP}' and scope = 'identity'`,
    { database: dbName },
  ).trim()

  if (revealLog !== '1') {
    adminFail(
      `a reveal did not write exactly one row to support_access_reveals (found ${revealLog})`,
    )
  }

  const revealCount = psql(
    `select reveal_count from public.support_access_grants where id = '${GRANT}'`,
    { database: dbName },
  ).trim()

  if (revealCount !== '1') {
    adminFail(`support_access_grants.reveal_count did not follow the reveal (found ${revealCount})`)
  }

  // Once revoked, neither the function nor a hand-written INSERT may proceed.
  psql(
    `update public.support_access_grants
     set status = 'revoked', revoked_at = now(), revoked_by = '${SA2}', revoked_reason = 'inceleme tamamlandi'
     where id = '${GRANT}'`,
    { database: dbName },
  )

  const afterRevoke = [
    [
      'a revoked grant cannot reveal',
      `select * from public.sa_reveal_identity('${GRANT}', '${SUP}')`,
      'support_access_grant_not_live',
    ],
    [
      'a reveal row cannot be forged against a revoked grant',
      `insert into public.support_access_reveals (grant_id, admin_user_id, subject_user_id, scope, entity_type)
       values ('${GRANT}', '${SUP}', '${SUBJECT}', 'identity', 'profile')`,
      'support_access_grant_not_live',
    ],
  ]

  for (const [label, sql, expected] of afterRevoke) {
    const problem = expectRejected(sql, expected, dbName)
    if (problem) adminFail(`${label}: ${problem}`)
  }

  // Session expiry is decided server-side, not by a cookie.
  psql(
    `insert into public.admin_sessions (admin_user_id, token_hash, issued_at, expires_at, absolute_expires_at)
     values ('${SA1}', sha256('live'::bytea), now() - interval '5 minutes', now() + interval '1 hour', now() + interval '8 hours'),
            ('${SA1}', sha256('idle'::bytea), now() - interval '5 hours', now() - interval '1 minute', now() + interval '8 hours')`,
    { database: dbName },
  )

  const sessionAnswers = psql(
    `select concat_ws(
       ',',
       (select count(*) from public.admin_touch_session(sha256('live'::bytea))),
       (select count(*) from public.admin_touch_session(sha256('idle'::bytea))),
       (select count(*) from public.admin_touch_session(sha256('unknown'::bytea)))
     )`,
    { database: dbName },
  ).trim()

  if (sessionAnswers !== '1,0,0') {
    adminFail(
      `admin_touch_session should resolve only the live session (live,idle,unknown = ${sessionAnswers})`,
    )
  }

  psql(`select public.admin_revoke_sessions('${SA1}', 'Cihaz kaybi bildirildi')`, {
    database: dbName,
  })

  const afterRevokeAll = psql(
    `select count(*) from public.admin_touch_session(sha256('live'::bytea))`,
    { database: dbName },
  ).trim()

  if (afterRevokeAll !== '0') {
    adminFail(`"log out all sessions" left a session resolvable (${afterRevokeAll})`)
  }

  // A disabled admin holds nothing, and the flag evaluator fails closed.
  const denyByDefault = psql(
    `select concat_ws(
       ',',
       (select count(*) from public.admin_permissions_for('${SUP}')) > 0,
       public.admin_has_permission('${SUP}', 'users.delete'),
       public.admin_has_permission('${SUP}', 'support.access.approve'),
       public.feature_flag_is_enabled('nonexistent.flag', '${SUBJECT}')
     )`,
    { database: dbName },
  ).trim()

  if (denyByDefault !== 't,f,f,f') {
    adminFail(
      `deny-by-default is not holding (support has perms, support can delete users, support can self-approve, unknown flag = ${denyByDefault})`,
    )
  }

  psql(
    `update public.admin_users set status = 'disabled', disabled_at = now(), disabled_reason = 'ayrildi' where id = '${SUP}'`,
    { database: dbName },
  )

  const disabledPermissions = psql(`select count(*) from public.admin_permissions_for('${SUP}')`, {
    database: dbName,
  }).trim()

  if (disabledPermissions !== '0') {
    adminFail(`a disabled admin still holds ${disabledPermissions} permissions`)
  }

  if (adminProblems === 0) {
    ok(
      `admin platform invariants hold: last super_admin protected, one active prompt per feature, ` +
        `audited reasons required, Support Access is four-eyes, short-lived and logs every reveal`,
    )
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
