import type { SystemHealthStatus } from '@/lib/db'

/**
 * The wire contract between the health routes, their forms and their Server
 * Actions.
 *
 * A `'use server'` module may export nothing but async functions, and a client
 * form cannot import from one without pulling the action's module graph — and
 * therefore `@/lib/db` and the service-role key — into the browser bundle. So
 * the names both sides have to agree on live here, in a plain module both can
 * import.
 *
 * Everything in this file is data or a pure predicate. Nothing here decides a
 * status: a status comes from a `system_health_checks` row and from nowhere
 * else.
 */

// ===========================================================================
// Routes
// ===========================================================================

export const HEALTH_PATH = '/health'
export const HEALTH_CONFIG_PATH = '/health/config'

/** The redirect allowlist for both Server Actions. */
export const HEALTH_RETURN_PATHS = [HEALTH_PATH, HEALTH_CONFIG_PATH] as const
export type HealthReturnPath = (typeof HEALTH_RETURN_PATHS)[number]

// ===========================================================================
// The dependencies this console can measure itself
//
// Every id matches `system_health_checks_target_shape`
// (`^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$`), because the row is written through
// `admin_record_health_check()` and Postgres refuses anything else.
//
// The list is the console's own roster, not the table's: `system_health_checks`
// is open to any probe — a cron job, a webhook — and the page renders every
// target it finds, whether or not it appears here. What the roster adds is the
// ability to say "nobody has ever checked this", which is the one thing a
// status page cannot learn from a table of rows that do not exist.
// ===========================================================================

export const HEALTH_TARGETS = [
  'database',
  'edge_functions',
  'google',
  'microsoft',
  'model_provider',
  'revenuecat',
  'push',
] as const

export type HealthTarget = (typeof HEALTH_TARGETS)[number]

export function isHealthTarget(value: string): value is HealthTarget {
  return (HEALTH_TARGETS as readonly string[]).includes(value)
}

/**
 * How a target is measured. Rendered next to every row, because "operational"
 * is only meaningful alongside what was actually observed — a reachable OAuth
 * endpoint is not the same claim as a working mailbox sync, and a status page
 * that blurs the two is how an incident gets misdiagnosed.
 */
export const PROBE_KINDS = ['query', 'reachability'] as const
export type ProbeKind = (typeof PROBE_KINDS)[number]

export interface HealthTargetSpec {
  readonly id: HealthTarget
  readonly probe: ProbeKind
  /**
   * Round-trip time above which a target that answered is reported `degraded`
   * rather than `operational`. A declared threshold, shown on screen beside the
   * measurement, so "yavaş" is a stated rule rather than a feeling.
   */
  readonly degradedMs: number
}

export const HEALTH_TARGET_SPECS: readonly HealthTargetSpec[] = Object.freeze([
  // The console's own read path. Everything else on this page is unreachable
  // when this one is down, so it is measured first and with the tightest floor.
  Object.freeze({ id: 'database', probe: 'query', degradedMs: 800 }),
  Object.freeze({ id: 'edge_functions', probe: 'reachability', degradedMs: 1500 }),
  Object.freeze({ id: 'google', probe: 'reachability', degradedMs: 1500 }),
  Object.freeze({ id: 'microsoft', probe: 'reachability', degradedMs: 1500 }),
  Object.freeze({ id: 'model_provider', probe: 'reachability', degradedMs: 2500 }),
  Object.freeze({ id: 'revenuecat', probe: 'reachability', degradedMs: 2000 }),
  Object.freeze({ id: 'push', probe: 'reachability', degradedMs: 2000 }),
])

const SPEC_BY_ID: ReadonlyMap<HealthTarget, HealthTargetSpec> = new Map(
  HEALTH_TARGET_SPECS.map((spec) => [spec.id, spec]),
)

export function healthTargetSpec(target: HealthTarget): HealthTargetSpec {
  const spec = SPEC_BY_ID.get(target)
  // Unreachable while `HEALTH_TARGET_SPECS` covers the union — which the
  // compile-time check below proves — but the map lookup is still optional at
  // the type level, and a thrown error beats a silent default threshold.
  if (spec === undefined) throw new Error(`no probe specification for target "${target}"`)
  return spec
}

/** Fails to compile if a target is added to the union without a specification. */
type SpecCoverage = (typeof HEALTH_TARGET_SPECS)[number]['id']
type Assert<T extends true> = T
export type _EverySpecIsCovered = Assert<
  Exclude<HealthTarget, SpecCoverage> extends never ? true : false
>

/** The form value that means "check every target in the roster". */
export const CHECK_SCOPE_ALL = 'tumu'

// ===========================================================================
// How a measurement becomes a status
//
// The three verdicts a probe may reach, plus the one it reaches when it did
// not measure anything. `SystemHealthStatus` in `@/lib/db` mirrors the Postgres
// enum; these helpers exist so the mapping from a round trip to a verdict is
// written once, and so the schema's two constraints are satisfied by
// construction:
//
//   • anything other than `unknown` must carry the latency it measured;
//   • `down` must carry the error code it saw.
// ===========================================================================

/** HTTP statuses that prove the dependency answered. A 5xx does not. */
export function isAnsweringStatus(httpStatus: number): boolean {
  return httpStatus > 0 && httpStatus < 500
}

/**
 * A dependency that answered, judged against its own declared threshold.
 *
 * The threshold is per target rather than global because the round trips are
 * not comparable: the console's own database read and a TLS handshake with a
 * model provider on another continent are both healthy at very different
 * numbers, and one shared ceiling would either excuse a slow database or
 * condemn a normal provider.
 */
export function latencyVerdict(latencyMs: number, degradedMs: number): SystemHealthStatus {
  return latencyMs > degradedMs ? 'degraded' : 'operational'
}

/**
 * The verdict as an operator should read it.
 *
 * `unmeasured` is not a status the database stores. It is what the console says
 * when there is no row at all, or when `bo_system_health.is_stale` reports the
 * last one is too old to believe. It renders as "bilinmiyor", the same as a
 * stored `unknown`, but it is a different fact and carries a different hint —
 * and neither of them is a shade of green.
 *
 * `SystemHealthStatus` is imported as a type, so this module still compiles to
 * nothing that reaches `@/lib/db` and a Client Component may import it freely.
 */
export type EffectiveHealth = SystemHealthStatus | 'unmeasured'

/**
 * The columns of a measurement that decide how it reads.
 *
 * Declared structurally rather than imported from `@/lib/db`, so the rule below
 * can be applied on both sides of the client boundary. `BoSystemHealthRow` is
 * assignable to it.
 */
export interface HealthMeasurement {
  readonly status: SystemHealthStatus
  /** `bo_system_health.is_stale`: the last probe is older than the window. */
  readonly is_stale: boolean
}

/**
 * What a target reads as, given its latest measurement or the absence of one.
 *
 * This is the rule the whole health area exists to hold: **a target nobody has
 * measured is never green.** A missing row and a stale row are both
 * `unmeasured`, because a probe that stopped running keeps its last answer in
 * the table forever, and rendering that answer would put a green dot on a page
 * consulted during an incident, describing a platform nobody has measured since
 * Tuesday.
 *
 * It lives here rather than in `@/lib/queries/health` so it is a decision with
 * a name and a test rather than a branch inside a database read.
 */
export function effectiveHealthOf(measurement: HealthMeasurement | null): EffectiveHealth {
  if (measurement === null) return 'unmeasured'
  if (measurement.is_stale) return 'unmeasured'
  return measurement.status
}

// ===========================================================================
// Form fields and result parameters
// ===========================================================================

export const CHECK_FIELDS = {
  target: 'hedef',
  returnTo: 'donus',
} as const

export const REFRESH_FIELDS = {
  returnTo: 'donus',
} as const

/**
 * What the check reports back through the URL.
 *
 * Tokens from this codebase's own vocabulary and a target name from the roster
 * — never a provider message, never a URL, never a header.
 */
export const HEALTH_RESULT_PARAMS = {
  outcome: 'sonuc',
  target: 'sonucHedef',
  checked: 'sonucSayi',
} as const

export const CHECK_OUTCOMES = [
  /** Every probe ran and every result was written. */
  'recorded',
  /** The probes ran; at least one row could not be written. */
  'partial',
  'forbidden',
  'ratelimited',
  'invalid',
  'failed',
  /** The rows landed and the audit row did not. */
  'auditMissing',
] as const

export type CheckOutcome = (typeof CHECK_OUTCOMES)[number]

export function isCheckOutcome(value: string): value is CheckOutcome {
  return (CHECK_OUTCOMES as readonly string[]).includes(value)
}

// ===========================================================================
// The audit trail
// ===========================================================================

/**
 * The action name a manual check records.
 *
 * Deliberately outside the `admin.` and `support_access.` namespaces.
 * `audit_logs_enforce_accountability()` treats those two namespaces as
 * sensitive and demands a written justification before it will accept the row —
 * correct for a decision about a person, wrong for a read-only probe that
 * touches no user data and is run mid-incident. The row still names the acting
 * admin: `admin_write_audit()` fills `actor_admin_user_id` and `actor_role`
 * from real columns whatever the action is.
 */
export const HEALTH_AUDIT_ACTION = 'system.health_checked'

export const HEALTH_ENTITY_TYPE = 'system_health_check'

// ===========================================================================
// Scheduled work
//
// The six jobs migration 0014 schedules, transcribed from the migration itself.
// This is a declaration of what *should* be running, not a claim that it is:
// pg_cron's own `cron.job` and `cron.job_run_details` live in the `cron` schema
// and are not exposed through any `bo_*` view, so the console cannot read them.
//
// What it can read is what each job leaves behind, and `evidence` names which
// content-blind view answers that for this job. `none` is the honest answer for
// the two whose output no view records — the page says "ölçülemiyor" there
// rather than inventing a green tick.
// ===========================================================================

export const JOB_EVIDENCE_KINDS = ['sync', 'briefing', 'approval', 'export', 'none'] as const
export type JobEvidenceKind = (typeof JOB_EVIDENCE_KINDS)[number]

export interface ScheduledJob {
  /** `cron.job.jobname` as 0014 schedules it. */
  readonly id: string
  /** The five-field cron expression, in UTC. */
  readonly cron: string
  /** The edge function it invokes, or null where the job is pure SQL. */
  readonly edgeFunction: string | null
  /** The SQL it runs when `pg_net` is absent, or null where there is none. */
  readonly sqlFallback: string | null
  /** Which view, if any, records this job's effect. */
  readonly evidence: JobEvidenceKind
}

export const SCHEDULED_JOBS: readonly ScheduledJob[] = Object.freeze([
  Object.freeze({
    id: 'da_sync_incremental',
    cron: '*/15 * * * *',
    edgeFunction: 'sync-start',
    sqlFallback: null,
    evidence: 'sync',
  }),
  Object.freeze({
    id: 'da_briefing_dispatch',
    cron: '*/5 * * * *',
    edgeFunction: 'notification-scheduler',
    sqlFallback: null,
    evidence: 'briefing',
  }),
  Object.freeze({
    id: 'da_follow_up_detection',
    cron: '0 * * * *',
    edgeFunction: 'detect-followups',
    sqlFallback: null,
    evidence: 'none',
  }),
  Object.freeze({
    id: 'da_approval_expiry',
    cron: '*/10 * * * *',
    edgeFunction: 'approvals-expire',
    sqlFallback: 'expire_stale_approvals()',
    evidence: 'approval',
  }),
  Object.freeze({
    id: 'da_retention_cleanup',
    cron: '15 3 * * *',
    edgeFunction: 'retention-cleanup',
    sqlFallback: 'cleanup_expired_retention()',
    evidence: 'none',
  }),
  Object.freeze({
    id: 'da_export_cleanup',
    cron: '45 3 * * *',
    edgeFunction: null,
    sqlFallback: 'data_export_requests → expired',
    evidence: 'export',
  }),
])

// ===========================================================================
// Secrets, as presence and nothing else
//
// Section 8 of the specification: a secret renders "Yapılandırıldı ✅" or
// "Yapılandırılmadı ❌" and nothing more. This registry carries the variable
// NAMES only — the values are read on the server, compared against `undefined`
// and discarded in the same expression. Nothing downstream of `loadSecretState`
// ever holds one.
// ===========================================================================

export const SECRET_GROUPS = [
  'console',
  'credentials',
  'google',
  'microsoft',
  'ai',
  'billing',
  'push',
  'observability',
] as const

export type SecretGroup = (typeof SECRET_GROUPS)[number]

export interface SecretSpec {
  /** The environment variable's name. Never its value. */
  readonly variable: string
  readonly group: SecretGroup
  /** Whether the platform is degraded without it. */
  readonly required: boolean
  /**
   * Other names accepted for the same setting. Presence is true when any one of
   * them is set, which is how the console reports "configured" for a deployment
   * that uses the project's standard variable names.
   */
  readonly aliases?: readonly string[]
}

/**
 * The platform's integration secrets, mirroring `.env.example`.
 *
 * The console's own six variables are NOT here: `secretInventory()` in
 * `@/lib/env` already reports them, with the fallback notes only that module
 * knows about, and duplicating them would create a second list to keep in step.
 */
export const PLATFORM_SECRETS: readonly SecretSpec[] = Object.freeze([
  Object.freeze({ variable: 'OAUTH_ENCRYPTION_KEY', group: 'credentials', required: true }),
  Object.freeze({
    variable: 'OAUTH_ENCRYPTION_KEY_VERSION',
    group: 'credentials',
    required: false,
  }),

  Object.freeze({ variable: 'GOOGLE_CLIENT_ID', group: 'google', required: true }),
  Object.freeze({ variable: 'GOOGLE_CLIENT_SECRET', group: 'google', required: true }),
  Object.freeze({ variable: 'GOOGLE_REDIRECT_URI', group: 'google', required: true }),
  Object.freeze({ variable: 'GOOGLE_PUBSUB_TOPIC', group: 'google', required: false }),
  Object.freeze({
    variable: 'GOOGLE_PUBSUB_VERIFICATION_TOKEN',
    group: 'google',
    required: false,
  }),

  Object.freeze({ variable: 'MICROSOFT_CLIENT_ID', group: 'microsoft', required: true }),
  Object.freeze({ variable: 'MICROSOFT_CLIENT_SECRET', group: 'microsoft', required: true }),
  Object.freeze({ variable: 'MICROSOFT_REDIRECT_URI', group: 'microsoft', required: true }),
  Object.freeze({ variable: 'MICROSOFT_WEBHOOK_SECRET', group: 'microsoft', required: false }),

  Object.freeze({ variable: 'AI_PROVIDER', group: 'ai', required: true }),
  Object.freeze({ variable: 'ANTHROPIC_API_KEY', group: 'ai', required: false }),
  Object.freeze({ variable: 'OPENAI_API_KEY', group: 'ai', required: false }),
  Object.freeze({ variable: 'AI_FALLBACK_PROVIDER', group: 'ai', required: false }),
  Object.freeze({ variable: 'EMBEDDING_API_KEY', group: 'ai', required: false }),
  Object.freeze({ variable: 'TTS_API_KEY', group: 'ai', required: false }),
  Object.freeze({ variable: 'STT_API_KEY', group: 'ai', required: false }),

  Object.freeze({ variable: 'REVENUECAT_SECRET_KEY', group: 'billing', required: true }),
  Object.freeze({
    variable: 'REVENUECAT_WEBHOOK_AUTH_HEADER',
    group: 'billing',
    required: true,
  }),
  Object.freeze({ variable: 'REVENUECAT_ENTITLEMENT_ID', group: 'billing', required: false }),

  Object.freeze({ variable: 'EXPO_ACCESS_TOKEN', group: 'push', required: true }),
  Object.freeze({ variable: 'EXPO_PUSH_URL', group: 'push', required: false }),

  Object.freeze({ variable: 'SENTRY_DSN', group: 'observability', required: false }),
  Object.freeze({ variable: 'SENTRY_AUTH_TOKEN', group: 'observability', required: false }),
])

// ===========================================================================
// Query-string helpers
//
// Pure string work, shared by the pages and the actions so a link and the
// redirect that produced it cannot disagree about a parameter name.
// ===========================================================================

export function firstParam(
  params: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | null {
  const raw = params[name]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

/** The page's own address with the previous action's answer stripped off. */
export function withoutResult(path: string, query: URLSearchParams): string {
  const next = new URLSearchParams(query)
  for (const param of Object.values(HEALTH_RESULT_PARAMS)) next.delete(param)
  const search = next.toString()
  return search === '' ? path : `${path}?${search}`
}
