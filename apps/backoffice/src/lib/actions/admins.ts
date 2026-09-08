'use server'

import { AppError } from '@da/domain'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { emailSchema } from '@da/validation'
import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  runAdminAction,
  type AdminActionResult,
  type AdminActionSpec,
} from '@/lib/admin-action'
import { requirePermissionAction, type AdminSession } from '@/lib/auth'
import {
  insertRow,
  queryTableOne,
  resolveAdminById,
  revokeAdminSessions,
  updateRows,
  type AdminActor,
} from '@/lib/db'
import { expiresAfterDays } from '@/lib/expiry'
import { newInviteToken, sha256Bytea } from '@/lib/tokens'
import {
  ADMIN_ENTITY_TYPE,
  INVITE_ENTITY_TYPE,
  REENABLED_DETAIL_KEY,
  adminExistsFor,
  liveInviteFor,
  loadAssignableRoles,
} from '@/lib/queries/admins'
import { adminFailureMessage, adminMessages, adminOutcomeMessages } from '@/lib/messages/admins'
import { ADMIN_ROLES } from '@/lib/permissions'
import {
  ADMINS_INVITE_PATH,
  ADMINS_PATH,
  ADMIN_EMAIL_MAX,
  ADMIN_EMAIL_PATTERN,
  DISABLE_FIELDS,
  ENABLE_FIELDS,
  INVITE_FIELDS,
  INVITE_REVOKE_FIELDS,
  ROLE_FIELDS,
  SESSION_FIELDS,
  adminPath,
  initialAdminFormState,
  isInviteTtl,
  isUuidParam,
  withOutcome,
  type AdminFormState,
  type AdminOutcome,
} from '@/components/admins/contract'

/**
 * The six privileged operations of the admin-management area.
 *
 * ---------------------------------------------------------------------------
 * EVERY ONE OF THEM GOES THROUGH `runAdminAction`
 * ---------------------------------------------------------------------------
 *
 * Not one handler below checks a permission, applies a rate limit or writes an
 * audit row by hand. `runAdminAction` does all three, in that order, and it
 * cannot be called without a branded `AdminActor` — which only `@/lib/db` can
 * mint, and only by re-reading `admin_users` with `status = 'active'`, so an
 * operator disabled between the render and the click is refused here rather
 * than at their next page load. It writes the audit row on the success path
 * *and* on the failure path, so an operation that a database rule refused still
 * leaves a record that it was attempted, by whom, and against whom.
 *
 * The five action names used below — `admin.role_changed`, `admin.disabled`,
 * `admin.sessions_revoked`, `admin.invited`, `admin.invite_revoked` — are all
 * seeded in `admin_sensitive_actions` with `requires_reason = true`. That is why
 * every form here has a reason field: `audit_logs_enforce_accountability()`
 * refuses the row without one, and the runner refuses the operation before it
 * gets that far so the operator sees a field error instead of a database
 * exception.
 *
 * ---------------------------------------------------------------------------
 * THE RULES THAT ARE NOT ENFORCED HERE
 * ---------------------------------------------------------------------------
 *
 * The floor under the platform — that a demote, a disable or a delete may not
 * remove the last enabled super_admin — is a trigger in 0019, serialised on an
 * advisory lock so two concurrent demotions cannot both pass. Nothing in this
 * module counts super_admins, and nothing pre-checks that rule: a pre-check
 * would be a race with a worse outcome than the refusal it tried to avoid. The
 * refusal arrives as `P0001` with `hint = 'admin_last_super_admin'`, and
 * `reduceFailure` turns exactly that hint into the Turkish sentence the
 * operator reads.
 *
 * The same is true of the one-live-invite-per-address rule
 * (`admin_invites_live_email_key`, a partial unique index) and of every
 * `CHECK` on `admin_users`.
 *
 * ---------------------------------------------------------------------------
 * THE TWO CHECKS THAT ARE HERE, AND WHY
 * ---------------------------------------------------------------------------
 *
 * `is_assignable` is advisory by design — the migration says so: it retires a
 * role from the pickers without touching its holders, and there is no
 * constraint behind it. So the console is its only enforcement, and refusing a
 * retired role is done here.
 *
 * Acting on your own account is refused for the two operations that would lock
 * you out — changing your own role and closing your own account. There is no
 * database rule to race: the schema is perfectly happy to let a super_admin
 * demote themselves as long as another one remains, and the result is an
 * operator who cannot undo what they just did.
 *
 * ---------------------------------------------------------------------------
 * WHAT TRAVELS
 * ---------------------------------------------------------------------------
 *
 * Uuids, members of `admin_role`, a small integer, a colleague's work address
 * and an operator's own written reason. The invite token is minted and digested
 * by `@/lib/tokens` and returned to exactly one caller — the form that asked for
 * it. It is never written to the database in the clear, never put on a URL,
 * never placed in an audit detail and never read back: `admin_invites.token_hash`
 * is on `@/lib/db`'s unreadable-column list, and a query naming it throws.
 */

// ===========================================================================
// Bounds
// ===========================================================================

/**
 * Role changes per operator. Somebody reorganising a team touches a handful in
 * an afternoon; thirty in an hour is a script. The scope shape matches
 * `admin_rate_limits_scope_shape` in 0019.
 */
const ROLE_LIMIT = { scope: 'admin.role_write', limit: 30, window: '1 hour' } as const

/**
 * Closing an account, reopening one and evicting sessions share the console's
 * destructive bucket — the same rule `@/lib/rate-limit` declares for the scope.
 */
const DESTRUCTIVE_LIMIT = { scope: 'admin.destructive', limit: 30, window: '5 minutes' } as const

/** Invites and their revocations. Twenty an hour is far past a real onboarding. */
const INVITE_LIMIT = { scope: 'admin.invite', limit: 20, window: '1 hour' } as const

// ===========================================================================
// Input
// ===========================================================================

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, { message: 'Geçerli bir kimlik (UUID) değil.' })

const reasonSchema = z
  .string()
  .trim()
  .min(MIN_REASON_LENGTH, { message: `Gerekçe en az ${MIN_REASON_LENGTH} karakter olmalıdır.` })
  .max(MAX_REASON_LENGTH, { message: `Gerekçe en fazla ${MAX_REASON_LENGTH} karakter olabilir.` })

const roleEnum = z.enum(ADMIN_ROLES, {
  errorMap: () => ({ message: adminMessages.invite.roleRequired }),
})

/**
 * The invited address.
 *
 * `emailSchema` from `@da/validation` is the product's definition of a
 * well-formed address, and it is what actually decides. The regex beside it is
 * `admin_invites_email_shape` from 0019, mirrored so an operator learns which
 * character the database will reject before they submit rather than after. The
 * Turkish wording is supplied here because the shared schema's messages are
 * English and this form is not.
 */
const inviteEmailSchema = z
  .string({
    required_error: adminMessages.invite.emailRequired,
    invalid_type_error: adminMessages.invite.emailRequired,
  })
  .trim()
  .min(1, { message: adminMessages.invite.emailRequired })
  .max(ADMIN_EMAIL_MAX, { message: adminMessages.invite.emailTooLong })
  .superRefine((value, ctx) => {
    if (!emailSchema.safeParse(value).success || !ADMIN_EMAIL_PATTERN.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: adminMessages.invite.emailInvalid })
    }
  })
  .transform((value) => value.toLowerCase())

const roleChangeSchema = z.object({
  adminUserId: uuid,
  role: roleEnum,
  /** The role the page was rendered from, so two operators cannot both apply. */
  currentRole: roleEnum,
  reason: reasonSchema,
})

type RoleChangeInput = z.infer<typeof roleChangeSchema>

const targetSchema = z.object({
  adminUserId: uuid,
  reason: reasonSchema,
})

type TargetInput = z.infer<typeof targetSchema>

const inviteSchema = z.object({
  inviteId: uuid,
  email: inviteEmailSchema,
  role: roleEnum,
  ttlDays: z
    .number({ invalid_type_error: adminMessages.invite.ttlRequired })
    .int()
    .refine(isInviteTtl, { message: adminMessages.invite.ttlRequired }),
  reason: reasonSchema,
})

type InviteInput = z.infer<typeof inviteSchema>

const inviteRevokeSchema = z.object({
  inviteId: uuid,
  reason: reasonSchema,
})

type InviteRevokeInput = z.infer<typeof inviteRevokeSchema>

// ===========================================================================
// Reading a form
// ===========================================================================

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim()
}

function numberField(formData: FormData, name: string): number {
  const raw = field(formData, name)
  return raw === '' ? Number.NaN : Number(raw)
}

// ===========================================================================
// The gate
//
// Two checks, and the split is deliberate. This one refuses an operator who is
// not in this workflow at all, before any lookup runs. The permission is then
// asked *again* by `runAdminAction`, against `admin_role_permissions` at the
// moment of acting, and that second refusal is audited — an operator reaching
// for a role change they may not make leaves a `failure` row naming the account
// they aimed it at, which is exactly what the trail is for.
// ===========================================================================

interface Authorized {
  readonly actor: AdminActor
  readonly session: AdminSession
}

async function authorize(
  formData: FormData,
  permission: 'admin.role.write' | 'admin.disable' | 'admin.invite',
): Promise<Authorized | null> {
  let session: AdminSession
  try {
    session = await requirePermissionAction(permission, formData)
  } catch {
    return null
  }
  const actor = await resolveAdminById(session.adminUserId, session.sessionId).catch(() => null)
  return actor === null ? null : { actor, session }
}

// ===========================================================================
// Outcomes
// ===========================================================================

/** The outcome token for anything that is not a success. */
function reduceFailure<T>(result: AdminActionResult<T>): AdminOutcome {
  switch (result.status) {
    case 'denied':
      return 'forbidden'
    case 'invalid':
      return 'invalid'
    case 'rate_limited':
      return 'ratelimited'
    case 'failed':
      // The change landed and the trail did not. That is a gap in the record,
      // and it is reported as one rather than as a success.
      if (result.effectApplied && !result.auditWritten) return 'auditMissing'
      // The rule the database named, surfaced as itself. Nothing in this module
      // counts super_admins; this is the trigger's own refusal arriving.
      if (result.hint === 'admin_last_super_admin') return 'lastSuperAdmin'
      if (result.code === 'not_found') return 'notfound'
      if (result.code === 'forbidden') return 'forbidden'
      if (result.code === 'sync_conflict') return 'conflict'
      return 'failed'
    default:
      return 'failed'
  }
}

/** Where a roster-level or detail-level action lands, with its answer. */
function finish(adminUserId: string, outcome: AdminOutcome, subject: string | null): never {
  revalidatePath(ADMINS_PATH)
  if (isUuidParam(adminUserId)) {
    revalidatePath(adminPath(adminUserId))
    redirect(withOutcome(adminPath(adminUserId), outcome, subject))
  }
  redirect(withOutcome(ADMINS_PATH, outcome, subject))
}

function formMessage(
  message: string | null,
  issues: Readonly<Record<string, string>> = {},
): AdminFormState {
  return { status: 'error', message, issues }
}

/** Zod paths mapped onto the invite form's field names. */
function inviteIssuePath(path: string): string | null {
  const head = path.split('.')[0] ?? ''
  switch (head) {
    case 'email':
      return INVITE_FIELDS.email
    case 'role':
      return INVITE_FIELDS.role
    case 'ttlDays':
      return INVITE_FIELDS.ttlDays
    case 'reason':
      return INVITE_FIELDS.reason
    default:
      return null
  }
}

/** A failed invite result, as the form renders it. */
function inviteFailure<T>(result: AdminActionResult<T>): AdminFormState {
  if (result.status === 'invalid') {
    const issues: Record<string, string> = {}
    let general: string | null = null
    for (const issue of result.issues) {
      const target = inviteIssuePath(issue.path)
      if (target === null) general ??= issue.message
      else issues[target] ??= issue.message
    }
    return {
      status: 'error',
      message:
        general ?? (Object.keys(issues).length === 0 ? adminOutcomeMessages.invalid.body : null),
      issues,
    }
  }

  if (result.status === 'failed') {
    return formMessage(adminFailureMessage(result.code))
  }

  return formMessage(adminOutcomeMessages[reduceFailure(result)].body)
}

// ===========================================================================
// 1. Change a role
// ===========================================================================

interface RoleChangeResult {
  readonly previousRole: string
  readonly newRole: string
}

const roleChangeSpec: AdminActionSpec<RoleChangeInput, RoleChangeResult> = {
  action: 'admin.role_changed',
  permission: 'admin.role.write',
  input: roleChangeSchema,
  rateLimit: ROLE_LIMIT,
  entityType: ADMIN_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.adminUserId }),
  detail: (input) => ({
    previous_role: input.currentRole,
    new_role: input.role,
    target_admin_user_id: input.adminUserId,
  }),
  run: async (_context, input) => {
    // The filter names the role being moved *from*, so two operators editing
    // the same admin do not both apply: the second matches no row and is
    // reported as a stale page rather than silently overwriting the first.
    const updated = await updateRows(
      'admin_users',
      { role: input.role },
      [
        { column: 'id', op: 'eq', value: input.adminUserId },
        { column: 'role', op: 'eq', value: input.currentRole },
      ],
      ['id', 'role', 'status'],
    )

    const row = updated[0]
    if (row === undefined) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `admin ${input.adminUserId} was no longer ${input.currentRole}`,
      })
    }
    return { previousRole: input.currentRole, newRole: row.role }
  },
}

export async function changeAdminRoleAction(formData: FormData): Promise<void> {
  const adminUserId = field(formData, ROLE_FIELDS.adminUserId)
  const nextRole = field(formData, ROLE_FIELDS.role)
  const currentRole = field(formData, ROLE_FIELDS.currentRole)

  const authorized = await authorize(formData, 'admin.role.write')
  if (authorized === null) finish(adminUserId, 'forbidden', null)

  // Changing your own role is the one way to remove your own access with
  // nobody left to undo it, and the schema has no rule against it — the last
  // super_admin trigger only fires when the platform would be left with none.
  if (authorized.actor.adminUserId === adminUserId) {
    finish(adminUserId, 'selfRole', null)
  }

  if (nextRole === currentRole) finish(adminUserId, 'noop', null)

  // `is_assignable` retires a role from the pickers without touching the admins
  // already on it, and 0019 says plainly that it is advisory: there is no
  // constraint behind it, so this is its only enforcement.
  const assignable = await loadAssignableRoles().catch(() => null)
  if (assignable !== null && !assignable.some((row) => row.role === nextRole)) {
    finish(adminUserId, 'invalid', null)
  }

  const result = await runAdminAction(authorized.actor, roleChangeSpec, {
    adminUserId,
    role: nextRole,
    currentRole,
    reason: String(formData.get(ROLE_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') finish(adminUserId, 'roleChanged', result.data.newRole)
  finish(adminUserId, reduceFailure(result), null)
}

// ===========================================================================
// 2. Close an account
// ===========================================================================

interface DisableResult {
  readonly revokedSessions: number
}

const disableSpec: AdminActionSpec<TargetInput, DisableResult> = {
  action: 'admin.disabled',
  permission: 'admin.disable',
  input: targetSchema,
  rateLimit: DESTRUCTIVE_LIMIT,
  entityType: ADMIN_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.adminUserId }),
  detail: (input, result) => ({
    target_admin_user_id: input.adminUserId,
    new_status: 'disabled',
    revoked_sessions: result.revokedSessions,
  }),
  run: async (context, input) => {
    // `admin_users_disabled_consistent` ties the status and the timestamp
    // together, and `admin_users_disabled_needs_reason` refuses the row without
    // a justification — so all three are written in one statement rather than
    // left to a second update that might not happen.
    const updated = await updateRows(
      'admin_users',
      {
        status: 'disabled',
        disabled_at: context.now.toISOString(),
        disabled_reason: input.reason,
      },
      [
        { column: 'id', op: 'eq', value: input.adminUserId },
        { column: 'status', op: 'neq', value: 'disabled' },
      ],
      ['id', 'status'],
    )

    if (updated[0] === undefined) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `admin ${input.adminUserId} was already disabled or does not exist`,
      })
    }

    // `admin_touch_session()` already refuses a session belonging to a disabled
    // admin, so this is not what closes the door — it is what makes the session
    // list say so, and what leaves the count in the audit detail.
    const revokedSessions = await revokeAdminSessions(input.adminUserId, input.reason)
    return { revokedSessions }
  },
}

export async function disableAdminAction(formData: FormData): Promise<void> {
  const adminUserId = field(formData, DISABLE_FIELDS.adminUserId)

  const authorized = await authorize(formData, 'admin.disable')
  if (authorized === null) finish(adminUserId, 'forbidden', null)

  if (authorized.actor.adminUserId === adminUserId) finish(adminUserId, 'selfDisable', null)

  const result = await runAdminAction(authorized.actor, disableSpec, {
    adminUserId,
    reason: String(formData.get(DISABLE_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') finish(adminUserId, 'disabled', null)
  finish(adminUserId, reduceFailure(result), null)
}

// ===========================================================================
// 3. Reopen an account
//
// `AdminAuditAction` is the closed union of the 26 names 0019 seeded, and the
// enable/disable axis has exactly one member: `admin.disabled`. Rather than
// write an action name the database's own seed does not know — which would slip
// past `admin_sensitive_actions` and be caught only by the namespace fallback —
// a reopen is recorded under that action with `admin_reenabled` in its detail.
// `bo_audit.metadata_keys` carries the key through, so this module's own trail
// panel labels the row for what it was. The proper fix is a 27th action name,
// added to the seed and to both TypeScript mirrors in one change; see the
// module's report.
// ===========================================================================

interface EnableResult {
  readonly status: string
}

const enableSpec: AdminActionSpec<TargetInput, EnableResult> = {
  action: 'admin.disabled',
  permission: 'admin.disable',
  input: targetSchema,
  rateLimit: DESTRUCTIVE_LIMIT,
  entityType: ADMIN_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.adminUserId }),
  detail: (input, result) => ({
    [REENABLED_DETAIL_KEY]: true,
    target_admin_user_id: input.adminUserId,
    previous_status: 'disabled',
    new_status: result.status,
  }),
  run: async (_context, input) => {
    const current = await queryTableOne('admin_users', {
      columns: ['id', 'user_id', 'status'],
      filters: [{ column: 'id', op: 'eq', value: input.adminUserId }],
    })
    if (current === null) {
      throw new AppError('not_found', { status: 404, detail: `no admin ${input.adminUserId}` })
    }

    // `admin_users_active_needs_auth_user` refuses `active` without a bound
    // GoTrue account. An admin whose auth user was erased therefore returns to
    // `invited`: the row is usable again, and signing in still needs an invite.
    const nextStatus = current.user_id === null ? 'invited' : 'active'

    const updated = await updateRows(
      'admin_users',
      { status: nextStatus, disabled_at: null, disabled_reason: null },
      [
        { column: 'id', op: 'eq', value: input.adminUserId },
        { column: 'status', op: 'eq', value: 'disabled' },
      ],
      ['id', 'status'],
    )

    const row = updated[0]
    if (row === undefined) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `admin ${input.adminUserId} was not disabled`,
      })
    }
    return { status: row.status }
  },
}

export async function enableAdminAction(formData: FormData): Promise<void> {
  const adminUserId = field(formData, ENABLE_FIELDS.adminUserId)

  const authorized = await authorize(formData, 'admin.disable')
  if (authorized === null) finish(adminUserId, 'forbidden', null)

  const result = await runAdminAction(authorized.actor, enableSpec, {
    adminUserId,
    reason: String(formData.get(ENABLE_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') finish(adminUserId, 'reenabled', null)
  finish(adminUserId, reduceFailure(result), null)
}

// ===========================================================================
// 4. Sign out every session
// ===========================================================================

interface RevokeResult {
  readonly revoked: number
}

const revokeSessionsSpec: AdminActionSpec<TargetInput, RevokeResult> = {
  action: 'admin.sessions_revoked',
  permission: 'admin.disable',
  input: targetSchema,
  rateLimit: DESTRUCTIVE_LIMIT,
  entityType: ADMIN_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.adminUserId }),
  detail: (input, result) => ({
    target_admin_user_id: input.adminUserId,
    revoked_count: result.revoked,
  }),
  run: async (context, input) => {
    // Evicting your own sessions keeps the one you are using: an operator who
    // spots a cookie they do not recognise should be able to kill it without
    // signing themselves out mid-investigation.
    const keep = context.actor.adminUserId === input.adminUserId ? context.actor.sessionId : null
    const revoked = await revokeAdminSessions(input.adminUserId, input.reason, keep)
    return { revoked }
  },
}

export async function revokeAdminSessionsAction(formData: FormData): Promise<void> {
  const adminUserId = field(formData, SESSION_FIELDS.adminUserId)

  const authorized = await authorize(formData, 'admin.disable')
  if (authorized === null) finish(adminUserId, 'forbidden', null)

  const result = await runAdminAction(authorized.actor, revokeSessionsSpec, {
    adminUserId,
    reason: String(formData.get(SESSION_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') {
    // Zero is a real answer and it is audited as one: the attempt happened, and
    // the trail says it found nothing to revoke.
    finish(adminUserId, result.data.revoked === 0 ? 'noSessions' : 'sessionsRevoked', null)
  }
  finish(adminUserId, reduceFailure(result), null)
}

// ===========================================================================
// 5. Invite
// ===========================================================================

interface InviteResult {
  readonly inviteId: string
  readonly email: string
  readonly role: string
  readonly expiresAt: string
  /**
   * The plaintext token. Returned to the caller and to nowhere else: it is not
   * in the audit detail, not in the redirect, not in the database, and not
   * recoverable once the form that received it is closed.
   */
  readonly token: string
}

const inviteSpec: AdminActionSpec<InviteInput, InviteResult> = {
  action: 'admin.invited',
  permission: 'admin.invite',
  input: inviteSchema,
  rateLimit: INVITE_LIMIT,
  entityType: INVITE_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.inviteId }),
  detail: (input, result) => ({
    invite_id: input.inviteId,
    invited_role: input.role,
    // The domain, not the address: the audit trail records which organisation
    // was invited without putting a colleague's mailbox in a jsonb document
    // that other admins can read. The address itself is on the invite row.
    invited_domain: input.email.slice(input.email.indexOf('@') + 1),
    expires_at: result.expiresAt,
    ttl_days: input.ttlDays,
  }),
  run: async (context, input) => {
    const token = newInviteToken()
    const expiresAt = expiresAfterDays(context.now, input.ttlDays).toISOString()

    const row = await insertRow(
      'admin_invites',
      {
        id: input.inviteId,
        email: input.email,
        role: input.role,
        // Only the digest. `admin_invites_token_hash_is_sha256` checks that it
        // is 32 bytes, and `@/lib/db` refuses to select this column back.
        token_hash: await sha256Bytea(token),
        invited_by: context.actor.adminUserId,
        expires_at: expiresAt,
      },
      ['id', 'role', 'expires_at'],
    )

    return {
      inviteId: row.id,
      email: input.email,
      role: row.role,
      expiresAt: row.expires_at,
      token,
    }
  },
}

export async function inviteAdminAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const authorized = await authorize(formData, 'admin.invite')
  if (authorized === null) return formMessage(adminOutcomeMessages.forbidden.body)

  const email = field(formData, INVITE_FIELDS.email).toLowerCase()
  const role = field(formData, INVITE_FIELDS.role)
  const ttlDays = numberField(formData, INVITE_FIELDS.ttlDays)

  const assignable = await loadAssignableRoles().catch(() => null)
  if (assignable !== null && role !== '' && !assignable.some((row) => row.role === role)) {
    return formMessage(null, { [INVITE_FIELDS.role]: adminMessages.actions.roleNotAssignable })
  }

  // See `adminExistsFor`: the two tables have no constraint between them, so
  // without this the failure surfaces days later, when the invite is consumed.
  if (email !== '' && (await adminExistsFor(email).catch(() => false))) {
    return formMessage(adminOutcomeMessages.duplicate.body, {
      [INVITE_FIELDS.email]: adminOutcomeMessages.duplicate.title,
    })
  }

  const result = await runAdminAction(authorized.actor, inviteSpec, {
    inviteId: crypto.randomUUID(),
    email,
    role,
    ttlDays,
    reason: String(formData.get(INVITE_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') {
    revalidatePath(ADMINS_PATH)
    revalidatePath(ADMINS_INVITE_PATH)
    return {
      ...initialAdminFormState,
      status: 'success',
      message: adminOutcomeMessages.invited.body,
      issuedToken: result.data.token,
      issuedEmail: result.data.email,
      issuedExpiresAt: result.data.expiresAt,
    }
  }

  // `admin_invites_live_email_key` is the only unique index that this insert
  // can break, so a conflict here has one cause. It is confirmed against the
  // database rather than assumed — and only to choose which sentence the
  // operator reads, because the write has already been refused.
  if (result.status === 'failed' && result.code === 'sync_conflict' && email !== '') {
    const existing = await liveInviteFor(email).catch(() => null)
    if (existing !== null) {
      return formMessage(adminOutcomeMessages.duplicate.body, {
        [INVITE_FIELDS.email]: adminOutcomeMessages.duplicate.title,
      })
    }
  }

  return inviteFailure(result)
}

// ===========================================================================
// 6. Revoke an invite
// ===========================================================================

interface InviteRevokeResult {
  readonly role: string
}

const inviteRevokeSpec: AdminActionSpec<InviteRevokeInput, InviteRevokeResult> = {
  action: 'admin.invite_revoked',
  permission: 'admin.invite',
  input: inviteRevokeSchema,
  rateLimit: INVITE_LIMIT,
  entityType: INVITE_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.inviteId }),
  detail: (input, result) => ({ invite_id: input.inviteId, invited_role: result.role }),
  run: async (context, input) => {
    // `admin_invites_revoked_needs_reason`, `..._revoked_needs_admin` and
    // `..._not_both_consumed_and_revoked` are all satisfied by writing the three
    // columns together and refusing a row that is already consumed.
    const updated = await updateRows(
      'admin_invites',
      {
        revoked_at: context.now.toISOString(),
        revoked_reason: input.reason,
        revoked_by: context.actor.adminUserId,
      },
      [
        { column: 'id', op: 'eq', value: input.inviteId },
        { column: 'revoked_at', op: 'is', value: null },
        { column: 'consumed_at', op: 'is', value: null },
      ],
      ['id', 'role'],
    )

    const row = updated[0]
    if (row === undefined) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `invite ${input.inviteId} was already consumed or revoked`,
      })
    }
    return { role: row.role }
  },
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const inviteId = field(formData, INVITE_REVOKE_FIELDS.inviteId)

  const authorized = await authorize(formData, 'admin.invite')
  if (authorized === null) {
    revalidatePath(ADMINS_PATH)
    redirect(withOutcome(ADMINS_PATH, 'forbidden', null))
  }

  const result = await runAdminAction(authorized.actor, inviteRevokeSpec, {
    inviteId,
    reason: String(formData.get(INVITE_REVOKE_FIELDS.reason) ?? ''),
  })

  revalidatePath(ADMINS_PATH)
  if (result.status === 'success') {
    redirect(withOutcome(ADMINS_PATH, 'inviteRevoked', null))
  }
  redirect(withOutcome(ADMINS_PATH, reduceFailure(result), null))
}
