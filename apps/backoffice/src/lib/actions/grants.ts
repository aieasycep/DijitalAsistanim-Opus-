'use server'

import { AppError } from '@da/domain'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  runAdminAction,
  type AdminActionResult,
  type AdminActionSpec,
} from '@/lib/admin-action'
import { requirePermissionAction, type AdminSession } from '@/lib/auth'
import { insertRow, resolveAdminById, updateRows, type AdminActor } from '@/lib/db'
import { expiresAfterDays } from '@/lib/expiry'
import { GRANT_ENTITY_TYPE, loadGrant, userExists } from '@/lib/queries/grants'
import { grantFailureMessage, grantMessages, grantOutcomeMessages } from '@/lib/messages/grants'
import {
  GRANTS_PATH,
  GRANT_FIELDS,
  GRANT_KINDS,
  REVOKE_FIELDS,
  grantPath,
  isUuidParam,
  withOutcome,
  type GrantFormState,
  type GrantOutcome,
} from '@/components/grants/contract'

/**
 * The two privileged operations of the temporary-Pro area.
 *
 * ---------------------------------------------------------------------------
 * BOTH GO THROUGH `runAdminAction`
 * ---------------------------------------------------------------------------
 *
 * Neither handler below checks a permission, applies a rate limit or writes an
 * audit row by hand. `runAdminAction` does all three, in that order, and it
 * cannot be called without a branded `AdminActor` — which only `@/lib/db` can
 * mint, and only by re-reading `admin_users` with `status = 'active'`, so an
 * operator disabled between the render and the click is refused here rather
 * than at their next page load. It writes the audit row on the success path
 * *and* on the failure path, so an operation that threw halfway still leaves a
 * record that it was attempted.
 *
 * `entitlement.granted` and `entitlement.revoked` are both seeded in
 * `admin_sensitive_actions` with `requires_reason = true`. That is why both
 * forms have a reason field: `audit_logs_enforce_accountability()` refuses the
 * audit row without one, and the runner refuses the operation before it gets
 * that far so the operator sees a field error rather than a database exception.
 *
 * ---------------------------------------------------------------------------
 * THE RULES BELONG TO THE DATABASE, AND ARE NOT RESTATED HERE
 * ---------------------------------------------------------------------------
 *
 * Migration 0019 enforces four things about a grant that this module
 * deliberately does not re-implement:
 *
 *   - `admin_entitlement_grants_days_range` — how long a grant may be. The
 *     input schema below checks that `days` is a whole number and stops there.
 *     A value outside the range comes back as a `23514`, which
 *     `mapPostgrestError` turns into `validation_failed`, and the form says the
 *     database refused it. Copying `1 and 365` into a Zod schema would create a
 *     second bound that drifts the first time finance changes the first.
 *   - `admin_entitlement_grants_no_overlap` — one live window per account. The
 *     trigger raises `P0001` with `hint = 'admin_grant_overlap'`, which arrives
 *     as a typed `DatabaseHint` and becomes its own sentence.
 *   - `admin_entitlement_grants_reason_not_blank` and the `revoked_needs_*`
 *     pair — a reason on the way in and a reason and an actor on the way out.
 *   - `admin_entitlement_grants_window_ordered` — `expires_at > granted_at`.
 *
 * The console's job is to send well-formed input and to render the refusal in
 * Turkish. It is not to guess what the database would have said.
 *
 * ---------------------------------------------------------------------------
 * WHAT TRAVELS
 * ---------------------------------------------------------------------------
 *
 * Three uuids, a member of `admin_grant_kind`, one integer, and an operator's
 * own written reason. No address is read, posted or redirected with: the
 * account is named by id throughout, and the redirect target is rebuilt from a
 * uuid this module validated rather than trusted from the form, so there is no
 * field a crafted post could turn into an open redirect. `AuditDetail` admits
 * scalars only, and the details written below are a kind, two lengths, an
 * instant and a ticket id.
 */

// ===========================================================================
// Bounds
// ===========================================================================

/**
 * Granting and revoking share the console's destructive bucket, matching the
 * rule `@/lib/rate-limit` declares for the same scope: thirty writes in five
 * minutes is far past what typing a reason each time allows, and stops a script
 * cold. The scope matches `admin_rate_limits_scope_shape` in 0019.
 */
const DESTRUCTIVE_LIMIT = { scope: 'admin.destructive', limit: 30, window: '5 minutes' } as const

// ===========================================================================
// Input
// ===========================================================================

const uuid = z.string().uuid({ message: 'Geçerli bir kimlik (UUID) değil.' })

const reasonSchema = z
  .string()
  .trim()
  .min(MIN_REASON_LENGTH, { message: `Gerekçe en az ${MIN_REASON_LENGTH} karakter olmalıdır.` })
  .max(MAX_REASON_LENGTH, { message: `Gerekçe en fazla ${MAX_REASON_LENGTH} karakter olabilir.` })

/**
 * A whole number of days, and nothing more.
 *
 * `safe` rather than a range: an integer JavaScript cannot represent exactly
 * would produce an `expires_at` that is not the instant it claims to be, which
 * is a representation problem rather than a policy one. The policy — how long a
 * grant may be — is `admin_entitlement_grants_days_range`, and it is checked
 * where it is declared.
 */
const daysSchema = z
  .number({ invalid_type_error: grantMessages.form.daysInvalid })
  .int({ message: grantMessages.form.daysInvalid })
  .safe({ message: grantMessages.form.daysInvalid })

const grantSchema = z.object({
  grantId: uuid,
  userId: uuid,
  kind: z.enum(GRANT_KINDS),
  days: daysSchema,
  ticketId: uuid.nullable(),
  reason: reasonSchema,
})

type GrantInput = z.infer<typeof grantSchema>

/**
 * Revoking names three things the form does not post.
 *
 * `userId`, `kind` and `daysRemaining` are read out of the grant by the action
 * itself, immediately before the write, so the audit row can carry the account
 * as a real `user_id` column — not as a metadata key the 400-day sweep will
 * eventually clear — and can record how many Pro days were actually clawed
 * back. Taking them from the form instead would let a crafted post write a
 * revocation about one grant into another account's history.
 */
const revokeSchema = z.object({
  grantId: uuid,
  userId: uuid,
  kind: z.enum(GRANT_KINDS),
  daysRemaining: daysSchema.nonnegative({ message: grantMessages.form.daysInvalid }),
  reason: reasonSchema,
})

type RevokeInput = z.infer<typeof revokeSchema>

// ===========================================================================
// Reading the form
// ===========================================================================

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * A posted number, or `NaN` for anything that is not one.
 *
 * `NaN` fails `z.number()` with the field's own message, so an empty box and a
 * typo both land under the input rather than as a whole-form complaint.
 */
function numberField(formData: FormData, name: string): number {
  const raw = field(formData, name)
  return raw === '' ? Number.NaN : Number(raw)
}

/** An optional uuid field: empty means absent, not invalid. */
function optionalUuidField(formData: FormData, name: string): string | null {
  const raw = field(formData, name)
  return raw === '' ? null : raw
}

// ===========================================================================
// The gate
// ===========================================================================

/**
 * Session, CSRF, same origin, and membership of this area — then a branded
 * actor.
 *
 * The gate deliberately asks for `billing.read`, not for the write permission
 * the operation needs. That is not a weaker check: `runAdminAction` asks the
 * database for `billing.grant` / `billing.revoke` at the moment of acting, and
 * a refusal *there* is audited. Gating on the write permission here would make
 * the most interesting refusal — somebody who can read the ledger reaching for
 * a free month they may not give — the one refusal that leaves no trace,
 * because the runner would never be reached.
 *
 * So this establishes only that the caller is a live, CSRF-verified operator
 * with business in the billing area at all. Everything that decides whether the
 * write may happen is asked again, against `admin_role_permissions`, one layer
 * down.
 */
async function authorize(formData: FormData): Promise<AdminActor | null> {
  let session: AdminSession
  try {
    session = await requirePermissionAction('billing.read', formData)
  } catch {
    return null
  }
  return resolveAdminById(session.adminUserId, session.sessionId).catch(() => null)
}

/** The outcome token for anything that is not a success. */
function reduceFailure<T>(result: AdminActionResult<T>): GrantOutcome {
  switch (result.status) {
    case 'denied':
      return 'forbidden'
    case 'invalid':
      return 'invalid'
    case 'rate_limited':
      return 'ratelimited'
    case 'failed':
      if (result.effectApplied && !result.auditWritten) return 'auditMissing'
      if (result.hint === 'admin_grant_overlap') return 'overlap'
      if (result.code === 'not_found') return 'notfound'
      if (result.code === 'forbidden') return 'forbidden'
      // A check constraint the console does not restate: the length, or the
      // window it produces. The database refused it and nothing was written.
      if (result.code === 'validation_failed') return 'rejected'
      if (result.code === 'sync_conflict') return 'alreadyRevoked'
      return 'failed'
    default:
      return 'failed'
  }
}

/** Zod paths are flat here; each maps to the input that produced it. */
function issuePath(path: string): string | null {
  switch (path) {
    case 'userId':
      return GRANT_FIELDS.userId
    case 'kind':
      return GRANT_FIELDS.kind
    case 'days':
      return GRANT_FIELDS.days
    case 'ticketId':
      return GRANT_FIELDS.ticketId
    case 'reason':
      return GRANT_FIELDS.reason
    default:
      return null
  }
}

/** A failed result, as the grant form renders it. */
function formFailure<T>(result: AdminActionResult<T>): GrantFormState {
  if (result.status === 'invalid') {
    const issues: Record<string, string> = {}
    let general: string | null = null
    for (const issue of result.issues) {
      const target = issuePath(issue.path)
      if (target === null) general ??= issue.message
      else issues[target] ??= issue.message
    }
    return {
      status: 'error',
      message:
        general ?? (Object.keys(issues).length === 0 ? grantFailureMessage('unknown') : null),
      issues,
    }
  }

  const outcome = reduceFailure(result)
  return { status: 'error', message: grantOutcomeMessages[outcome].body, issues: {} }
}

function formMessage(
  message: string | null,
  issues: Readonly<Record<string, string>> = {},
): GrantFormState {
  return { status: 'error', message, issues }
}

// ===========================================================================
// 1. Granting
// ===========================================================================

const grantSpec: AdminActionSpec<GrantInput, { grantId: string; expiresAt: string }> = {
  action: 'entitlement.granted',
  permission: 'billing.grant',
  input: grantSchema,
  rateLimit: DESTRUCTIVE_LIMIT,
  entityType: GRANT_ENTITY_TYPE,
  // Both halves of the subject: the account the free month lands on, and the
  // grant row itself. The id is minted by the action rather than by
  // `gen_random_uuid()`, so the audit row's `entity_id` — read off the input
  // before the handler runs — and the row that was written are provably the
  // same object.
  subject: (input) => ({ userId: input.userId, entityId: input.grantId }),
  detail: (input, result) => ({
    grant_kind: input.kind,
    grant_days: input.days,
    expires_at: result.expiresAt,
    ticket_id: input.ticketId,
  }),
  run: async (context, input) => {
    // Both instants are written by the console rather than left to `now()` and
    // a default, so `days` and the window it produced are provably the same
    // decision — which is what the comment on the `days` column asks for.
    // `expires_at > granted_at` and the length bound are still checked by the
    // database; a `days` that fails either is refused there.
    const grantedAt = context.now
    const expiresAt = expiresAfterDays(grantedAt, input.days)

    const row = await insertRow(
      'admin_entitlement_grants',
      {
        id: input.grantId,
        user_id: input.userId,
        kind: input.kind,
        days: input.days,
        reason: context.reason ?? input.reason,
        granted_by: context.actor.adminUserId,
        granted_at: grantedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        ticket_id: input.ticketId,
      },
      ['id', 'expires_at'],
    )
    return { grantId: row.id, expiresAt: row.expires_at }
  },
}

export async function grantEntitlementAction(
  _previous: GrantFormState,
  formData: FormData,
): Promise<GrantFormState> {
  const actor = await authorize(formData)
  if (actor === null) return formMessage(grantOutcomeMessages.forbidden.body)

  const userId = field(formData, GRANT_FIELDS.userId)
  const grantId = crypto.randomUUID()

  // Checked before the write so a mistyped id is a field error rather than a
  // foreign-key exception nobody can read. It is not the guarantee — the
  // `references auth.users` on the column is — and a race between this read and
  // the insert still ends in a refusal from Postgres.
  if (isUuidParam(userId)) {
    const exists = await userExists(userId).catch(() => true)
    if (!exists) {
      return formMessage(null, { [GRANT_FIELDS.userId]: grantMessages.form.userUnknown })
    }
  }

  const result = await runAdminAction(actor, grantSpec, {
    grantId,
    userId,
    kind: field(formData, GRANT_FIELDS.kind),
    days: numberField(formData, GRANT_FIELDS.days),
    ticketId: optionalUuidField(formData, GRANT_FIELDS.ticketId),
    reason: field(formData, GRANT_FIELDS.reason),
  })

  if (result.status === 'success') {
    revalidatePath(GRANTS_PATH)
    revalidatePath(grantPath(result.data.grantId))
    redirect(withOutcome(grantPath(result.data.grantId), 'granted', result.data.grantId))
  }

  return formFailure(result)
}

// ===========================================================================
// 2. Revoking
// ===========================================================================

const revokeSpec: AdminActionSpec<RevokeInput, { grantId: string; userId: string }> = {
  action: 'entitlement.revoked',
  permission: 'billing.revoke',
  input: revokeSchema,
  rateLimit: DESTRUCTIVE_LIMIT,
  entityType: GRANT_ENTITY_TYPE,
  subject: (input) => ({ userId: input.userId, entityId: input.grantId }),
  // What was actually taken back. `days_reclaimed` is the figure a finance
  // report needs and the one nobody can reconstruct later: once `revoked_at` is
  // set, how much of the grant was still running is gone from the row.
  detail: (input) => ({
    grant_kind: input.kind,
    days_reclaimed: input.daysRemaining,
  }),
  run: async (context, input) => {
    // The filter names the state being moved *from*, so two operators clicking
    // at the same moment do not both apply: the second matches no row and is
    // reported as "already revoked" rather than silently rewriting the first
    // revocation's reason and timestamp.
    const updated = await updateRows(
      'admin_entitlement_grants',
      {
        revoked_at: context.now.toISOString(),
        revoked_by: context.actor.adminUserId,
        revoked_reason: context.reason ?? input.reason,
      },
      [
        { column: 'id', op: 'eq', value: input.grantId },
        { column: 'revoked_at', op: 'is', value: null },
      ],
      ['id', 'user_id'],
    )
    const row = updated[0]
    if (row === undefined) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `entitlement grant ${input.grantId} was already revoked`,
      })
    }
    return { grantId: row.id, userId: row.user_id }
  },
}

/**
 * Where a revocation lands.
 *
 * The destination is built from a uuid this module validated, never from a
 * posted path, and it carries only a token from `GRANT_OUTCOMES` and the
 * grant's own id.
 */
function finish(grantId: string, outcome: GrantOutcome): never {
  revalidatePath(GRANTS_PATH)
  if (isUuidParam(grantId)) {
    revalidatePath(grantPath(grantId))
    redirect(withOutcome(grantPath(grantId), outcome, grantId))
  }
  redirect(withOutcome(GRANTS_PATH, outcome, null))
}

export async function revokeGrantAction(formData: FormData): Promise<void> {
  const grantId = field(formData, REVOKE_FIELDS.grantId)

  const actor = await authorize(formData)
  if (actor === null) finish(grantId, 'forbidden')

  // Read before the write, only to choose the sentence: a grant somebody else
  // revoked while this page was open should say so rather than reporting a
  // generic conflict. The write still filters on `revoked_at is null`, so this
  // read is not what makes the operation safe.
  const current = await loadGrant(grantId).catch(() => null)
  if (current === null) finish(grantId, 'notfound')
  if (current.revoked_at !== null) finish(grantId, 'alreadyRevoked')

  const result = await runAdminAction(actor, revokeSpec, {
    grantId,
    // Server-derived, from the row that was just read — never from the post.
    userId: current.user_id,
    kind: current.kind,
    daysRemaining: current.days_remaining,
    reason: field(formData, REVOKE_FIELDS.reason),
  })

  if (result.status === 'success') finish(grantId, 'revoked')
  finish(grantId, reduceFailure(result))
}
