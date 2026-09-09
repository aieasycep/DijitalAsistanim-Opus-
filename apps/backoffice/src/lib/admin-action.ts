import 'server-only'

import { AppError, isAppError, systemClock, type Clock, type ErrorCode } from '@da/domain'
import { describeEnvironment, type DeploymentEnvironment } from './env'
import {
  adminHasPermission,
  adminPermissions,
  databaseHint,
  enforceRateLimit,
  loadSensitiveActions,
  writeAdminAudit,
  type AdminActor,
  type AdminAuditAction,
  type AdminPermission,
  type AuditDetail,
  type DatabaseHint,
} from './db'
import { MAX_REASON_LENGTH as REASON_CEILING } from './permissions.ts'

/**
 * The wrapper every privileged operation in the console goes through.
 *
 * ---------------------------------------------------------------------------
 * WHY A WRAPPER AND NOT A CHECKLIST
 * ---------------------------------------------------------------------------
 *
 * A sensitive admin operation has to do five things before it does its own job:
 * establish who is acting, confirm they still hold the permission, stay inside a
 * rate limit, validate its input, and leave an audit row naming the actor, the
 * subject and the written reason. Five separate obligations, repeated across
 * every module, is five chances for one to be forgotten — and the one that gets
 * forgotten is always the audit, because it is the only one whose absence
 * nothing complains about at the time.
 *
 * So they are not five obligations here. They are one call. `runAdminAction`
 * cannot be invoked without an `AdminActor`, and the actor type is branded
 * inside `db.ts` — there is no object literal that produces one. It cannot be
 * invoked without a permission, because the field is required. It refuses to run
 * the handler until the input has parsed and, where the database says the action
 * demands one, a written reason has arrived. And it writes the audit row itself,
 * on the success path and on the failure path, so an endpoint cannot skip it by
 * returning early.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE RULES ACTUALLY LIVE
 * ---------------------------------------------------------------------------
 *
 * Nothing here is the last line of defence, and none of it is duplicated policy.
 *
 *   - Whether an action needs a reason is read from `admin_sensitive_actions`,
 *     the same table 0019's `audit_logs` trigger consults. This module refuses
 *     early so the operator sees a field error instead of a database exception;
 *     if it ever disagreed with the trigger, the trigger still wins and the row
 *     is still refused.
 *   - Whether a role holds a permission is answered by `admin_has_permission`,
 *     against `admin_role_permissions`. This module never compares two roles:
 *     the roles are not nested, and `finance` is not a weaker `support`.
 *   - The rate limit is one atomic statement in Postgres, so two concurrent
 *     attempts cannot both read n and both write n + 1.
 *
 * ---------------------------------------------------------------------------
 * WHY IT RETURNS INSTEAD OF THROWING
 * ---------------------------------------------------------------------------
 *
 * A Server Action's caller is a form. A thrown error becomes an error boundary,
 * which loses the operator's typed input and tells them nothing about which
 * field was wrong. Every outcome below is a serialisable value a form can render
 * — including the failure, which carries the database's own hint so a screen can
 * say "son süper yönetici kaldırılamaz" rather than "bir hata oluştu".
 */

// ===========================================================================
// Input validation
// ===========================================================================

/**
 * Anything that validates unknown input into a typed value.
 *
 * Every Zod schema satisfies this structurally, which is how the console's
 * contracts — those in `@da/validation` and those a module defines for its own
 * form — plug in without this module importing Zod itself.
 */
export interface Parser<T> {
  parse(input: unknown): T
}

/** One field-level complaint, ready to render next to the input that caused it. */
export interface FieldIssue {
  /** Dotted path into the input, or `''` for a whole-form problem. */
  path: string
  /** Turkish, shown to the operator. */
  message: string
}

interface ParsedIssue {
  path?: unknown
  message?: unknown
}

const GENERIC_INVALID = 'Girilen değer geçerli değil.'

/**
 * Read field issues out of a thrown validation error.
 *
 * Zod's `ZodError` carries `issues: { path, message }[]`, and this reads that
 * shape structurally rather than importing Zod — the backoffice consumes
 * validation contracts through `@da/validation`, and a direct dependency here
 * would be a second copy of the same library in the app's tree. Anything that
 * is not recognisably a validation error becomes a single form-level issue, so
 * a caller always has something to render.
 */
export function toFieldIssues(error: unknown): readonly FieldIssue[] {
  if (typeof error === 'object' && error !== null && 'issues' in error) {
    const issues = (error as { issues: unknown }).issues
    if (Array.isArray(issues)) {
      const mapped: FieldIssue[] = []
      for (const raw of issues as readonly ParsedIssue[]) {
        const path = Array.isArray(raw.path) ? raw.path.map((part) => String(part)).join('.') : ''
        const message = typeof raw.message === 'string' ? raw.message : GENERIC_INVALID
        mapped.push({ path, message })
      }
      if (mapped.length > 0) return mapped
    }
  }
  return [{ path: '', message: GENERIC_INVALID }]
}

// ===========================================================================
// Reasons
// ===========================================================================

/**
 * The console's floor for a written justification.
 *
 * The database's own floor is three characters, and `support_access_grants`
 * demands twenty. Ten is the console's: long enough to be a sentence a reviewer
 * can weigh six months later, short enough that "kullanici talebi" passes. An
 * action nobody can justify in writing is an action that should not have a
 * button.
 */
export const MIN_REASON_LENGTH = 10

/**
 * The ceiling is the trail's, not this module's.
 *
 * It used to be 500 here while `audit.ts` wrote
 * `reason.slice(0, MAX_REASON_LENGTH)` against the 280 in `permissions.ts` —
 * and `readReason()` normalised (and sliced) *before* `reasonIssue()`
 * validated. So a 400-character justification passed every check, was accepted
 * without complaint, and reached `audit_logs` 120 characters shorter than the
 * operator wrote it. Nothing failed and nobody was told; the record simply
 * ended mid-sentence.
 *
 * Re-exported from `permissions.ts` rather than re-declared, because the
 * number that matters is the one the row is written with, and two of them is
 * how this happened.
 */
export { MAX_REASON_LENGTH } from './permissions.ts'

/**
 * Whitespace only. This deliberately does not truncate: a justification is the
 * operator's own words, and quietly dropping the end of one is worse than
 * refusing it — `reasonIssue()` says so instead, before anything is written.
 */
export function normaliseReason(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/** Null when the reason is acceptable, otherwise the issue to render. */
export function reasonIssue(value: string | null): FieldIssue | null {
  const trimmed = value === null ? '' : value.trim()
  if (trimmed === '') {
    return { path: 'reason', message: 'Bu işlem için bir gerekçe yazmalısınız.' }
  }
  if (trimmed.length < MIN_REASON_LENGTH) {
    return {
      path: 'reason',
      message: `Gerekçe en az ${MIN_REASON_LENGTH} karakter olmalıdır.`,
    }
  }
  if (trimmed.length > REASON_CEILING) {
    return {
      path: 'reason',
      message: `Gerekçe en fazla ${REASON_CEILING} karakter olabilir.`,
    }
  }
  return null
}

function readReason(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null
  const value = (input as { reason?: unknown }).reason
  return typeof value === 'string' ? normaliseReason(value) : null
}

/**
 * A reason the accountability trigger will accept, for a row that is being
 * written about a refusal or a failure.
 *
 * 0019 requires at least three characters on a sensitive action. On the success
 * path the console's own ten-character floor has already been applied, but a
 * denial can happen before that check and an action that needs no reason may
 * still arrive carrying a two-character one. Falling back here means the record
 * of a refused attempt is never lost to a validation rule about the attempt.
 */
function auditReason(reason: string | null, fallback: string): string {
  const trimmed = reason === null ? '' : reason.trim()
  return trimmed.length >= 3 ? trimmed : fallback
}

// ===========================================================================
// The specification of one action
// ===========================================================================

export interface AdminRateLimit {
  /** Lower-snake, dotted: `admin.sign_in`, `support_access.reveal`. */
  scope: string
  /** Calls allowed inside the window. */
  limit: number
  /** A Postgres interval: `1 hour`, `15 minutes`. */
  window: string
}

/** What the audit row is about. */
export interface AuditSubject {
  /** The user the action was about, when there is one. */
  userId?: string | null
  /** The id of the thing acted on. Never an address, never a subject line. */
  entityId?: string | null
}

export interface AdminActionContext {
  actor: AdminActor
  /** The normalised justification, or null for an action that needs none. */
  reason: string | null
  action: AdminAuditAction
  environment: DeploymentEnvironment
  clock: Clock
  /** The instant this action started, from the injected clock. */
  now: Date
}

export interface AdminActionSpec<TInput, TResult> {
  /** One of the names 0019 seeded. The database decides what it demands. */
  action: AdminAuditAction
  /** Checked against `admin_role_permissions` before anything else runs. */
  permission: AdminPermission
  /** Zod schema, or anything else that parses unknown input into `TInput`. */
  input: Parser<TInput>
  /** Applied before validation, so a flood of bad input is capped too. */
  rateLimit?: AdminRateLimit
  /** Keys the limiter. Defaults to the acting admin. Hashed before storage. */
  rateLimitSubject?: (actor: AdminActor, input: unknown) => string
  /** The kind of thing acted on: `connected_account`, `feature_flag`. */
  entityType?: string
  /** Pulls the audit subject out of the validated input. */
  subject?: (input: TInput) => AuditSubject
  /** Extra identifiers and codes for the audit row. Scalars only, by type. */
  detail?: (input: TInput, result: TResult) => AuditDetail
  /** Set when the action exercises a Support Access grant. */
  supportAccessGrantId?: (input: TInput) => string | null
  /** The work itself. Runs only after every gate above has passed. */
  run: (context: AdminActionContext, input: TInput) => Promise<TResult>
}

// ===========================================================================
// The outcome
// ===========================================================================

export type AdminActionResult<T> =
  | { status: 'success'; data: T; auditId: string }
  | { status: 'invalid'; issues: readonly FieldIssue[] }
  | { status: 'denied'; permission: AdminPermission; auditWritten: boolean }
  | { status: 'rate_limited'; scope: string; limit: number; window: string }
  | {
      status: 'failed'
      code: ErrorCode
      /** The rule the database named, when it named one. */
      hint: DatabaseHint | null
      /** Whether the work had already happened when the failure occurred. */
      effectApplied: boolean
      auditWritten: boolean
    }

/** Narrowing helper for a form that only cares whether it worked. */
export function isSuccess<T>(
  result: AdminActionResult<T>,
): result is { status: 'success'; data: T; auditId: string } {
  return result.status === 'success'
}

/** The first issue for a given field, for rendering under an input. */
export function issueFor(result: AdminActionResult<unknown>, path: string): string | null {
  if (result.status !== 'invalid') return null
  return result.issues.find((issue) => issue.path === path)?.message ?? null
}

// ===========================================================================
// Sensitive-action metadata, cached
//
// `admin_sensitive_actions` is 26 static rows that change only when a migration
// runs. Reading it on every action would be a round trip to learn something
// that has not changed since deploy; caching it forever would mean a migration
// needs a restart to take effect. A few minutes is the honest middle, and the
// database's trigger is the authority either way.
// ===========================================================================

const SENSITIVE_CACHE_MS = 5 * 60 * 1000

interface SensitiveCache {
  actions: ReadonlyMap<string, boolean>
  loadedAt: number
}

let sensitiveCache: SensitiveCache | null = null

async function requiresReason(action: AdminAuditAction, clock: Clock): Promise<boolean> {
  const now = clock.now().getTime()
  if (sensitiveCache === null || now - sensitiveCache.loadedAt > SENSITIVE_CACHE_MS) {
    sensitiveCache = { actions: await loadSensitiveActions(), loadedAt: now }
  }
  const listed = sensitiveCache.actions.get(action)
  if (listed !== undefined) return listed
  // The namespace rule, mirrored: an action the seed does not list but that sits
  // in the console's namespaces is sensitive and needs a reason, exactly as the
  // trigger will decide when the row is inserted.
  return action.startsWith('admin.') || action.startsWith('support_access.')
}

/** Drops the cache. For a deploy hook or a test that changes the seed. */
export function forgetSensitiveActions(): void {
  sensitiveCache = null
}

// ===========================================================================
// The runner
// ===========================================================================

export interface RunAdminActionOptions {
  clock?: Clock
}

/**
 * Run one privileged operation, with every guard applied in order.
 *
 * The order is deliberate:
 *
 *   1. **Rate limit**, before anything else, so a script hammering a Server
 *      Action cannot force thousands of validation failures or audit rows.
 *   2. **Validation**, so the handler never sees an unparsed value and the
 *      reason is known before the permission decision has to be audited.
 *   3. **Permission**, against the database. A refusal is itself audited: an
 *      admin repeatedly reaching for something they may not do is exactly what
 *      an audit trail is for.
 *   4. **Reason**, where `admin_sensitive_actions` says one is required —
 *      refused here with a field error rather than as a database exception.
 *   5. **The work.**
 *   6. **The audit row**, whether the work succeeded or threw.
 *
 * The audit is written after the effect rather than before it, so it records
 * what actually happened rather than what was attempted. Everything the
 * accountability trigger requires — an actor, and a reason for a destructive
 * action — has already been established by step 4, so the row cannot be refused
 * for a missing field; the only remaining way for it to fail is the database
 * being gone, in which case the effect failed too.
 */
export async function runAdminAction<TInput, TResult>(
  actor: AdminActor,
  spec: AdminActionSpec<TInput, TResult>,
  rawInput: unknown,
  options: RunAdminActionOptions = {},
): Promise<AdminActionResult<TResult>> {
  const clock = options.clock ?? systemClock
  const environment = describeEnvironment().environment

  // 1. Rate limit.
  if (spec.rateLimit !== undefined) {
    const subject =
      spec.rateLimitSubject === undefined
        ? actor.adminUserId
        : spec.rateLimitSubject(actor, rawInput)
    let allowed = true
    try {
      allowed = await enforceRateLimit({
        scope: spec.rateLimit.scope,
        subject,
        limit: spec.rateLimit.limit,
        window: spec.rateLimit.window,
      })
    } catch (error) {
      return failure(error, false, false)
    }
    if (!allowed) {
      return {
        status: 'rate_limited',
        scope: spec.rateLimit.scope,
        limit: spec.rateLimit.limit,
        window: spec.rateLimit.window,
      }
    }
  }

  // 2. Validation.
  let input: TInput
  try {
    input = spec.input.parse(rawInput)
  } catch (error) {
    return { status: 'invalid', issues: toFieldIssues(error) }
  }

  const reason = readReason(input) ?? readReason(rawInput)

  // 3. Permission, from the database rather than from the rendered menu.
  let permitted = false
  try {
    permitted = await adminHasPermission(actor, spec.permission)
  } catch (error) {
    return failure(error, false, false)
  }

  if (!permitted) {
    const auditWritten = await tryAudit({
      actor,
      action: spec.action,
      // A refusal always has a reason, even when the operator did not type one:
      // the guard's own verdict. Where they did type one it is kept alongside,
      // because what someone was trying to justify is part of the record.
      reason: auditReason(
        reason === null ? null : `Yetki reddedildi (${spec.permission}): ${reason}`,
        `Yetki reddedildi: ${spec.permission}`,
      ),
      outcome: 'failure',
      ...(spec.entityType === undefined ? {} : { entityType: spec.entityType }),
      // The acting admin's role is written by `admin_write_audit` into a real
      // column; only the permission that was missing belongs here.
      detail: { environment, denied_permission: spec.permission },
    })
    return { status: 'denied', permission: spec.permission, auditWritten }
  }

  // 4. Reason, where the database says the action demands one.
  let needsReason = true
  try {
    needsReason = await requiresReason(spec.action, clock)
  } catch (error) {
    return failure(error, false, false)
  }

  if (needsReason) {
    const issue = reasonIssue(reason)
    if (issue !== null) return { status: 'invalid', issues: [issue] }
  }

  // 5. The work.
  const subject = spec.subject === undefined ? {} : spec.subject(input)
  const grantId = spec.supportAccessGrantId === undefined ? null : spec.supportAccessGrantId(input)

  let result: TResult
  try {
    result = await spec.run(
      {
        actor,
        reason,
        action: spec.action,
        environment,
        clock,
        now: clock.now(),
      },
      input,
    )
  } catch (error) {
    const auditWritten = await tryAudit({
      actor,
      action: spec.action,
      reason: auditReason(reason, `İşlem başarısız: ${spec.action}`),
      outcome: 'failure',
      ...(subject.userId === undefined ? {} : { subjectUserId: subject.userId }),
      ...(spec.entityType === undefined ? {} : { entityType: spec.entityType }),
      ...(subject.entityId === undefined ? {} : { entityId: subject.entityId }),
      ...(grantId === null ? {} : { supportAccessGrantId: grantId }),
      detail: { environment, failure_code: codeOf(error), ...hintDetail(error) },
    })
    return failure(error, false, auditWritten)
  }

  // 6. The audit row.
  try {
    const auditId = await writeAdminAudit({
      actor,
      action: spec.action,
      reason,
      ...(subject.userId === undefined ? {} : { subjectUserId: subject.userId }),
      ...(spec.entityType === undefined ? {} : { entityType: spec.entityType }),
      ...(subject.entityId === undefined ? {} : { entityId: subject.entityId }),
      ...(grantId === null ? {} : { supportAccessGrantId: grantId }),
      outcome: 'success',
      detail: {
        environment,
        ...(spec.detail === undefined ? {} : spec.detail(input, result)),
      },
    })
    return { status: 'success', data: result, auditId }
  } catch (error) {
    // The work happened and the trail did not. Reporting success here would put
    // an unrecorded privileged change into the system, so this is a failure —
    // and `effectApplied` says plainly that it is the trail, not the change,
    // that is missing.
    return failure(error, true, false)
  }
}

function codeOf(error: unknown): ErrorCode {
  return isAppError(error) ? error.code : 'unknown'
}

function hintDetail(error: unknown): AuditDetail {
  const hint = databaseHint(error)
  return hint === null ? {} : { failure_hint: hint }
}

function failure<T>(
  error: unknown,
  effectApplied: boolean,
  auditWritten: boolean,
): AdminActionResult<T> {
  return {
    status: 'failed',
    code: codeOf(error),
    hint: databaseHint(error),
    effectApplied,
    auditWritten,
  }
}

interface AuditAttempt {
  actor: AdminActor
  action: AdminAuditAction
  reason: string
  outcome: 'success' | 'failure'
  subjectUserId?: string | null
  entityType?: string
  entityId?: string | null
  supportAccessGrantId?: string
  detail: AuditDetail
}

/**
 * Write an audit row for an outcome that is already a refusal or a failure.
 *
 * Returns whether it landed instead of throwing: the caller's answer is a denial
 * either way, and turning a correct refusal into a 500 because the trail could
 * not be appended would hide the refusal from the operator. The boolean is
 * carried in the result so the screen can say the trail is incomplete rather
 * than implying it is intact.
 */
async function tryAudit(attempt: AuditAttempt): Promise<boolean> {
  try {
    await writeAdminAudit({
      actor: attempt.actor,
      action: attempt.action,
      reason: attempt.reason,
      outcome: attempt.outcome,
      ...(attempt.subjectUserId === undefined ? {} : { subjectUserId: attempt.subjectUserId }),
      ...(attempt.entityType === undefined ? {} : { entityType: attempt.entityType }),
      ...(attempt.entityId === undefined ? {} : { entityId: attempt.entityId }),
      ...(attempt.supportAccessGrantId === undefined
        ? {}
        : { supportAccessGrantId: attempt.supportAccessGrantId }),
      detail: attempt.detail,
    })
    return true
  } catch {
    return false
  }
}

// ===========================================================================
// Route guards
//
// Hiding a menu item is not security. These are what a Server Component calls
// before it renders anything, and what a handler calls for a second permission
// it needs mid-flight.
// ===========================================================================

/**
 * Refuse the request unless the actor still holds the permission.
 *
 * Asks the database every time rather than trusting a set loaded at sign-in: a
 * role change or a disable must take effect on the operator's next click, not on
 * their next session.
 */
export async function requireAdminPermission(
  actor: AdminActor,
  permission: AdminPermission,
): Promise<void> {
  const allowed = await adminHasPermission(actor, permission)
  if (!allowed) {
    throw new AppError('forbidden', {
      detail: `${actor.role} lacks ${permission}`,
      status: 403,
    })
  }
}

/**
 * Every permission the actor holds, for a page that renders several controls.
 *
 * One round trip instead of one per control. Use it to decide what to *render*;
 * the server-side check that decides what may *happen* is `runAdminAction`, and
 * it runs whether or not the control was rendered.
 */
export async function loadAdminPermissions(
  actor: AdminActor,
): Promise<ReadonlySet<AdminPermission>> {
  return adminPermissions(actor)
}

/** Convenience for a rendered set: does it contain this permission? */
export function can(
  permissions: ReadonlySet<AdminPermission>,
  permission: AdminPermission,
): boolean {
  return permissions.has(permission)
}
