'use server'

import { isAppError, systemClock, type Clock } from '@da/domain'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  CHECK_FIELDS,
  CHECK_SCOPE_ALL,
  HEALTH_AUDIT_ACTION,
  HEALTH_ENTITY_TYPE,
  HEALTH_PATH,
  HEALTH_RESULT_PARAMS,
  HEALTH_RETURN_PATHS,
  HEALTH_TARGETS,
  REFRESH_FIELDS,
  healthTargetSpec,
  isAnsweringStatus,
  type CheckOutcome,
  type HealthTarget,
} from '@/components/health/contract'
import { writeAudit, type AuditDetail } from '@/lib/audit'
import {
  assertPermissionAtSource,
  readAdminSession,
  requirePermissionAction,
  type AdminSession,
} from '@/lib/auth'
import { countView, recordHealthCheck, type SystemHealthStatus } from '@/lib/db'
import { isConfigured, readEnv } from '@/lib/env'
import { adminBucket, assertRateLimit } from '@/lib/rate-limit'

/**
 * "Şimdi ölç" — the one privileged operation the health area exposes.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A RUNNER HERE AND NOT A CALL TO `runAdminAction`
 * ---------------------------------------------------------------------------
 *
 * `runAdminAction` in `@/lib/admin-action` is the wrapper every privileged
 * operation is meant to go through, and every guarantee it makes is reproduced
 * below, in the same order — rate limit, validate, authorise at the source, do
 * the work, write the audit row on the success path and on the failure path.
 * What it cannot do is name a health action: its `action` field is typed
 * `AdminAuditAction`, the closed union of the twenty-six names migration 0019
 * seeded into `admin_sensitive_actions`, and none of them is about a probe.
 * Widening it means editing `db.ts`, `permissions.ts` and the migration's seed
 * together — a change this module does not own. The same reasoning, and the
 * same local runner, is documented in `@/lib/actions/tickets`.
 *
 * So this borrows rather than reimplements:
 *
 *   - `requirePermissionAction` (auth.ts) does the same-origin check, the CSRF
 *     comparison and the permission decision;
 *   - `assertPermissionAtSource` (auth.ts) re-asks the database at the moment
 *     of acting, so a role changed while the page was open takes effect on this
 *     click rather than on the next page load;
 *   - `assertRateLimit` (rate-limit.ts) counts the attempt atomically in
 *     Postgres;
 *   - `recordHealthCheck` (db.ts) is the only writer of `system_health_checks`;
 *   - `writeAudit` (audit.ts) is the one call site for an audit row.
 *
 * ---------------------------------------------------------------------------
 * WHY IT NEEDS MORE THAN `system.health.read`
 * ---------------------------------------------------------------------------
 *
 * Reading the page is `system.health.read`, which every role holds. Pressing
 * this button is not a read: it opens outbound connections from the console's
 * server and appends rows that a status light is drawn from. So it additionally
 * demands `integration.resync` — the permission the first pass used to mean
 * "may act on the platform" — which `readonly`, `analyst` and `finance` do not
 * hold. The button is not rendered for them, and this action refuses them
 * anyway, because a hidden control is not an authorization boundary.
 *
 * ---------------------------------------------------------------------------
 * WHAT A PROBE SENDS, AND WHAT IT LEARNS
 * ---------------------------------------------------------------------------
 *
 * Nothing and almost nothing. Every outbound request is an unauthenticated GET
 * to a fixed, public endpoint — no API key, no OAuth token, no `Authorization`
 * header, no service-role key ever leaves this process — and the reply's body
 * is cancelled without being read. The only facts extracted are the round-trip
 * time and the HTTP status code, which is all `system_health_checks` can hold
 * anyway: 0019 refuses a verdict other than `unknown` without a latency, and
 * refuses `down` without an error code, so there is no spelling of this action
 * that writes a green tick nobody measured.
 *
 * That also bounds what a green row may be read to mean, and the page says so
 * beside every row: it is a measurement of this server's reachability of the
 * dependency's front door, not a claim that a mailbox sync — which runs from an
 * edge function, over a different path, with a token — is working.
 */

// ===========================================================================
// Bounds
// ===========================================================================

/**
 * How long a single probe may take before it is called a timeout.
 *
 * Eight seconds is well past any healthy round trip to any of these endpoints
 * and comfortably inside a Server Action's budget even when all seven targets
 * time out at once — they run concurrently, so the worst case is one timeout,
 * not seven.
 */
const PROBE_TIMEOUT_MS = 8_000

/**
 * Manual checks per operator.
 *
 * Generous for a person working an incident, useless for a script: sixty an
 * hour is a check every minute, sustained, and each one is seven outbound
 * requests. The scope matches `admin_rate_limits_scope_shape` in 0019.
 */
const HEALTH_CHECK_LIMIT = { scope: 'admin.health_check', limit: 60, windowSeconds: 60 * 60 }

/** Identifies the probe in a provider's logs. Carries nothing else. */
const PROBE_USER_AGENT = 'da-backoffice-health-probe'

/** Only used to parse a relative path. Never fetched, never rendered. */
const RELATIVE_BASE = 'https://backoffice.invalid'

// ===========================================================================
// The endpoints
//
// Fixed, public and unauthenticated. Each one is the dependency's own front
// door: the OAuth discovery document a connect flow reads, the API host a
// client would call, the gateway a function is invoked through. An
// unauthenticated request to any of them answers with 401, 404 or 405 — which
// is the point. The answer proves DNS, TLS and the service's edge; the status
// code proves nothing else and is not read as if it did.
// ===========================================================================

const GOOGLE_DISCOVERY = 'https://accounts.google.com/.well-known/openid-configuration'
const MICROSOFT_DISCOVERY =
  'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/models'
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/models'
const REVENUECAT_ENDPOINT = 'https://api.revenuecat.com/v1/subscribers'
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send'

/** A probe's plan: run a query, call a URL, or say why neither is possible. */
type ProbePlan =
  | { readonly kind: 'query' }
  | { readonly kind: 'http'; readonly url: string }
  | { readonly kind: 'unconfigured'; readonly code: string }

/**
 * An operator-supplied endpoint is only used when it is an absolute HTTPS URL.
 * A misconfigured `EXPO_PUSH_URL` falls back to Expo's published address rather
 * than turning a health probe into a request to whatever the string says.
 */
function httpsUrlOr(raw: string | undefined, fallback: string): string {
  if (raw === undefined || raw.trim() === '') return fallback
  try {
    const parsed = new URL(raw.trim())
    return parsed.protocol === 'https:' ? parsed.toString() : fallback
  } catch {
    return fallback
  }
}

function planFor(target: HealthTarget): ProbePlan {
  switch (target) {
    case 'database':
      return isConfigured() ? { kind: 'query' } : { kind: 'unconfigured', code: 'not_configured' }
    case 'edge_functions': {
      if (!isConfigured()) return { kind: 'unconfigured', code: 'not_configured' }
      // The gateway, with no function name and no credentials: it answers, and
      // nothing runs. Invoking a real function to see whether the platform is
      // up would start a sync or send a notification.
      return { kind: 'http', url: `${readEnv().supabaseUrl}/functions/v1/` }
    }
    case 'google':
      return { kind: 'http', url: GOOGLE_DISCOVERY }
    case 'microsoft':
      return { kind: 'http', url: MICROSOFT_DISCOVERY }
    case 'model_provider': {
      const provider = process.env['AI_PROVIDER']?.trim().toLowerCase()
      if (provider === 'anthropic') return { kind: 'http', url: ANTHROPIC_ENDPOINT }
      if (provider === 'openai') return { kind: 'http', url: OPENAI_ENDPOINT }
      // No provider selected in this process's environment. Recorded as
      // `unknown`, never as healthy: the console did not measure anything.
      return { kind: 'unconfigured', code: 'provider_not_selected' }
    }
    case 'revenuecat':
      return { kind: 'http', url: REVENUECAT_ENDPOINT }
    case 'push':
      return { kind: 'http', url: httpsUrlOr(process.env['EXPO_PUSH_URL'], EXPO_PUSH_ENDPOINT) }
  }
}

// ===========================================================================
// Running one probe
// ===========================================================================

interface Measurement {
  readonly status: SystemHealthStatus
  readonly latencyMs: number | null
  readonly errorCode: string | null
}

interface ProbeResult extends Measurement {
  readonly target: HealthTarget
  /** Whether the row reached `system_health_checks`. */
  readonly recorded: boolean
}

/**
 * Release the connection without reading the reply.
 *
 * A provider's error body routinely quotes the request that failed. Nothing
 * here needs it, so nothing here reads it — and cancelling rather than
 * buffering also means a large document costs a probe nothing.
 */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // The stream was already consumed or closed; there is nothing to release.
  }
}

/** Answered inside its threshold, answered late, or did not answer. */
function verdict(latencyMs: number, degradedMs: number): SystemHealthStatus {
  return latencyMs > degradedMs ? 'degraded' : 'operational'
}

async function probeHttp(url: string, degradedMs: number, clock: Clock): Promise<Measurement> {
  const started = clock.now().getTime()
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { 'user-agent': PROBE_USER_AGENT },
    })
  } catch (error) {
    const latencyMs = clock.now().getTime() - started
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return {
      status: 'down',
      latencyMs,
      errorCode: timedOut ? 'network_timeout' : 'unreachable',
    }
  }

  const latencyMs = clock.now().getTime() - started
  await discardBody(response)

  if (!isAnsweringStatus(response.status)) {
    return { status: 'down', latencyMs, errorCode: `http_${response.status}` }
  }
  return { status: verdict(latencyMs, degradedMs), latencyMs, errorCode: null }
}

/**
 * The database probe is a real read through the foundation — the same
 * `count=exact` HEAD request every other screen's tiles are built from, so what
 * it measures is the path this console actually depends on rather than a ping.
 */
async function probeDatabase(degradedMs: number, clock: Clock): Promise<Measurement> {
  const started = clock.now().getTime()
  try {
    await countView('bo_system_health', [])
  } catch (error) {
    return {
      status: 'down',
      latencyMs: clock.now().getTime() - started,
      // The domain's own `ErrorCode`, which is token-shaped, never a PostgREST
      // message — those can name the row they failed on.
      errorCode: isAppError(error) ? error.code : 'unknown',
    }
  }
  const latencyMs = clock.now().getTime() - started
  return { status: verdict(latencyMs, degradedMs), latencyMs, errorCode: null }
}

async function probe(target: HealthTarget, clock: Clock): Promise<Measurement> {
  const plan = planFor(target)
  if (plan.kind === 'unconfigured') {
    // `unknown` with no latency is the only honest row for something nobody
    // measured, and the schema permits exactly that shape and no other.
    return { status: 'unknown', latencyMs: null, errorCode: plan.code }
  }
  const { degradedMs } = healthTargetSpec(target)
  return plan.kind === 'query'
    ? probeDatabase(degradedMs, clock)
    : probeHttp(plan.url, degradedMs, clock)
}

/** Probe one target and record the result. Never throws. */
async function measureAndRecord(target: HealthTarget, clock: Clock): Promise<ProbeResult> {
  const measurement = await probe(target, clock)
  try {
    await recordHealthCheck({
      target,
      status: measurement.status,
      latencyMs: measurement.latencyMs,
      errorCode: measurement.errorCode,
      observedBy: 'manual',
    })
    return { target, ...measurement, recorded: true }
  } catch {
    // The measurement happened and the row did not. Reported as `partial` so
    // the operator knows the table they are looking at is behind what was just
    // observed, rather than being told the check succeeded.
    return { target, ...measurement, recorded: false }
  }
}

// ===========================================================================
// Input
// ===========================================================================

/**
 * `tumu`, or one member of the roster. Nothing else reaches a probe.
 *
 * A union rather than a refined string, so the parsed value is typed
 * `'tumu' | HealthTarget` and the target list below needs no cast: a value that
 * reached the probe is one this module declared, proven by the type checker
 * rather than by a comment.
 */
const scopeSchema = z.union([z.literal(CHECK_SCOPE_ALL), z.enum(HEALTH_TARGETS)])

// ===========================================================================
// The audit trail
// ===========================================================================

interface AuditAttempt {
  readonly session: AdminSession
  readonly scope: string
  readonly outcome: 'success' | 'failure'
  readonly detail: AuditDetail
}

/**
 * Write one audit row, reporting whether it landed instead of throwing.
 *
 * `system.health_checked` sits outside the `admin.` and `support_access.`
 * namespaces, so `audit_logs_enforce_accountability()` accepts it without a
 * written reason — correct for a read-only probe run mid-incident, and not a
 * loophole: `admin_write_audit()` still resolves and stores the acting admin
 * and their role in real columns, out of reach of the 400-day metadata sweep.
 */
async function tryAudit(attempt: AuditAttempt): Promise<boolean> {
  try {
    await writeAudit({
      actor: { adminUserId: attempt.session.adminUserId },
      action: HEALTH_AUDIT_ACTION,
      // A health probe is about the platform, never about one person. Naming a
      // subject user here would be both wrong and a privacy regression.
      subjectUserId: null,
      entityType: HEALTH_ENTITY_TYPE,
      entityId: attempt.scope,
      reason: null,
      outcome: attempt.outcome,
      detail: attempt.detail,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Record a refused attempt, when the request carried a live console session.
 *
 * `requirePermissionAction` throws without handing back the session it
 * resolved, so this asks for it again — `readAdminSession` is memoised per
 * request with React's `cache`, so it is the same `admin_touch_session()` call
 * rather than a second one. Anything that is not a live admin session produces
 * no row and no error: the caller's answer is a refusal either way, and a
 * failed audit write must not turn a correct refusal into a 500.
 */
async function auditRefusal(returnTo: URL): Promise<void> {
  try {
    const result = await readAdminSession()
    if (result.kind !== 'admin') return
    await tryAudit({
      session: result.session,
      scope: 'denied',
      outcome: 'failure',
      detail: {
        denied_permission: 'integration.resync',
        // The path only, never the query: a return target is console-owned,
        // but the shape guard would collapse anything else to `unstructured`.
        surface: returnTo.pathname,
      },
    })
  } catch {
    // The refusal stands whether or not the trail could be appended.
  }
}

/** Per-target verdicts as flat scalars, which is all `AuditDetail` admits. */
function resultDetail(results: readonly ProbeResult[]): AuditDetail {
  const detail: AuditDetail = {
    checked: results.length,
    recorded: results.filter((result) => result.recorded).length,
    operational: results.filter((result) => result.status === 'operational').length,
    degraded: results.filter((result) => result.status === 'degraded').length,
    down: results.filter((result) => result.status === 'down').length,
    unknown: results.filter((result) => result.status === 'unknown').length,
  }
  for (const result of results) {
    detail[`status_${result.target}`] = result.status
    detail[`latency_${result.target}`] = result.latencyMs
    if (result.errorCode !== null) detail[`code_${result.target}`] = result.errorCode
  }
  return detail
}

// ===========================================================================
// The action
// ===========================================================================

export async function runHealthCheckAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(String(formData.get(CHECK_FIELDS.returnTo) ?? ''))
  const rawScope = String(formData.get(CHECK_FIELDS.target) ?? '')

  // 1. Session, CSRF, same origin, and both permissions. Reading this page is
  //    `system.health.read`; starting a measurement is an action on the
  //    platform, so it also demands `integration.resync`.
  let session: AdminSession
  try {
    session = await requirePermissionAction(
      { allOf: ['system.health.read', 'integration.resync'] },
      formData,
    )
  } catch {
    // A signed-in operator reaching for something they may not do is exactly
    // what the trail is for, so the refusal is audited when there is somebody
    // to name. A request with no live session — or one that failed the CSRF or
    // same-origin check before a session was resolved — leaves no row, because
    // `admin_write_audit()` has no `admin_users.id` to attribute it to and
    // inventing one would be worse than not recording the attempt.
    await auditRefusal(returnTo)
    finish(returnTo, 'forbidden', null, 0)
  }

  // 2. Validation, before anything outbound happens.
  const scope = scopeSchema.safeParse(rawScope)
  if (!scope.success) {
    await tryAudit({
      session,
      scope: 'invalid',
      outcome: 'failure',
      detail: { refusal: 'unknown_target' },
    })
    finish(returnTo, 'invalid', null, 0)
  }

  // 3. Rate limit, counted in Postgres so it survives a cold start.
  try {
    await assertRateLimit(HEALTH_CHECK_LIMIT, adminBucket(session.adminUserId))
  } catch {
    finish(returnTo, 'ratelimited', null, 0)
  }

  // 4. The permission again, at the source, so a role revoked while this page
  //    was open takes effect on this click. A refusal here is itself audited.
  try {
    await assertPermissionAtSource(session, 'integration.resync')
  } catch {
    await tryAudit({
      session,
      scope: scope.data,
      outcome: 'failure',
      detail: { denied_permission: 'integration.resync' },
    })
    finish(returnTo, 'forbidden', null, 0)
  }

  // 5. The work. Concurrent, so seven probes cost one slow probe's wait.
  const targets: readonly HealthTarget[] =
    scope.data === CHECK_SCOPE_ALL ? HEALTH_TARGETS : [scope.data]
  const clock: Clock = systemClock
  const results = await Promise.all(targets.map((target) => measureAndRecord(target, clock)))

  const recorded = results.filter((result) => result.recorded).length
  const single = scope.data === CHECK_SCOPE_ALL ? null : scope.data

  // 6. The trail. The measurements happened; if the row did not land the
  //    operator is told so plainly rather than reassured.
  const audited = await tryAudit({
    session,
    scope: scope.data,
    outcome: recorded === 0 ? 'failure' : 'success',
    detail: resultDetail(results),
  })

  revalidatePath(returnTo.pathname)

  if (recorded === 0) finish(returnTo, 'failed', single, 0)
  if (!audited) finish(returnTo, 'auditMissing', single, recorded)
  if (recorded < results.length) finish(returnTo, 'partial', single, recorded)
  finish(returnTo, 'recorded', single, recorded)
}

/** Re-runs every query on the current health page, keeping its URL. */
export async function refreshHealthAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(String(formData.get(REFRESH_FIELDS.returnTo) ?? ''))
  await requirePermissionAction('system.health.read', formData)
  revalidatePath(returnTo.pathname)
  redirect(`${returnTo.pathname}${returnTo.search}`)
}

// ===========================================================================
// Where an operator lands afterwards
// ===========================================================================

/**
 * The posted return path, if it is one of ours; the dashboard otherwise.
 *
 * Parsing against a fixed base means an absolute URL to another host lands on a
 * different origin and is rejected, and a path this area does not own is
 * rejected by the allowlist — so there is no field here a crafted form could
 * turn into an open redirect. Any previous answer is stripped so a second check
 * cannot stack its result on top of the first one's.
 */
function safeReturnTo(raw: string): URL {
  const fallback = new URL(HEALTH_PATH, RELATIVE_BASE)
  const trimmed = raw.trim()
  if (trimmed === '') return fallback

  let url: URL
  try {
    url = new URL(trimmed, RELATIVE_BASE)
  } catch {
    return fallback
  }

  if (url.origin !== RELATIVE_BASE) return fallback
  if (!(HEALTH_RETURN_PATHS as readonly string[]).includes(url.pathname)) return fallback

  for (const param of Object.values(HEALTH_RESULT_PARAMS)) url.searchParams.delete(param)
  return url
}

function finish(
  returnTo: URL,
  outcome: CheckOutcome,
  target: string | null,
  checked: number,
): never {
  const url = new URL(returnTo.toString())
  url.searchParams.set(HEALTH_RESULT_PARAMS.outcome, outcome)
  if (target !== null) url.searchParams.set(HEALTH_RESULT_PARAMS.target, target)
  if (checked > 0) url.searchParams.set(HEALTH_RESULT_PARAMS.checked, String(checked))
  redirect(`${url.pathname}${url.search}`)
}
