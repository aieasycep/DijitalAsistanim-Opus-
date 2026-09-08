'use server'

import { AppError, systemClock } from '@da/domain'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  requireAdminPermission,
  runAdminAction,
  type AdminActionResult,
  type AdminActionSpec,
} from '@/lib/admin-action'
import { requirePermissionAction, type AdminSession } from '@/lib/auth'
import {
  insertRow,
  resolveAdminById,
  updateRows,
  type AdminActor,
  type SupportAccessScope,
} from '@/lib/db'
import { isSupportAccessScope } from '@/lib/redact'
import {
  APPROVAL_CEILING_MS,
  diagnoseApprovalRefusal,
  diagnoseTransitionRefusal,
  loadGrant,
  loadSubjectSummary,
  resolveTicketReference,
} from '@/lib/queries/support-access'
import {
  MAX_SUPPORT_ACCESS_REASON,
  MAX_SUPPORT_ACCESS_WINDOW_MINUTES,
  MIN_SUPPORT_ACCESS_REASON,
} from '@/lib/support-access'
import {
  DECISION_FIELDS,
  REQUEST_FIELDS,
  SUPPORT_ACCESS_PATH,
  grantHref,
  initialRequestFormState,
  isUuidParam,
  withOutcome,
  type RequestFormState,
} from '@/components/support-access/contract'
import {
  failureMessage,
  supportAccessMessages,
  type SupportAccessOutcomeKey,
} from '@/lib/messages/support-access'

/**
 * The four privileged operations of the Support Access mechanism.
 *
 * ---------------------------------------------------------------------------
 * EVERY ONE OF THEM GOES THROUGH `runAdminAction`
 * ---------------------------------------------------------------------------
 *
 * Not one of these handlers checks a permission, applies a rate limit or writes
 * an audit row by hand. `runAdminAction` does all three, in that order, and it
 * cannot be called without a branded `AdminActor` — which only `@/lib/db` can
 * mint, and only by re-reading `admin_users` with `status = 'active'`. It writes
 * the audit row on the success path *and* on the failure path, so an operation
 * that threw halfway still leaves a record that it was attempted.
 *
 * The reason is not optional and is not this module's idea:
 * `admin_sensitive_actions` marks all four `support_access.*` actions as
 * requiring one, `audit_logs_enforce_accountability()` refuses the row without
 * it, and the runner refuses the operation before it gets that far so the
 * operator sees a field error instead of a database exception.
 *
 * ---------------------------------------------------------------------------
 * THE RULES ARE IN THE DATABASE; THIS FILE ONLY TRANSLATES THEM
 * ---------------------------------------------------------------------------
 *
 * Four eyes is `support_access_grants_four_eyes`, a check constraint. One live
 * grant per (admin, subject) is `support_access_grants_one_active`, a partial
 * unique index. The twenty-four hour ceiling is
 * `support_access_grants_window_is_short`. None of them is re-implemented here:
 * the write is attempted, Postgres refuses it, and `diagnoseApprovalRefusal`
 * then re-reads the row to say *which* rule refused, so the operator gets a
 * Turkish sentence naming the actual rule instead of "bir hata oluştu" — or,
 * worse, a raw constraint name on screen.
 *
 * ---------------------------------------------------------------------------
 * WHAT CANNOT TRAVEL THROUGH HERE
 * ---------------------------------------------------------------------------
 *
 * Uuids, members of the `support_access_scope` enum, a bounded integer, a
 * ticket reference shaped like `DA-001042`, and an operator's own written
 * reason. No screen in this area renders content, no action here reads any, and
 * `AuditDetail` admits scalars only — there is no field on this path a mail
 * body could occupy.
 */

// ===========================================================================
// Bounds
// ===========================================================================

/**
 * Rate limits, matching the rules `@/lib/rate-limit` declares for the same
 * scopes. Expressed as Postgres intervals because that is what
 * `admin_enforce_rate_limit()` takes.
 */
const REQUEST_RATE_LIMIT = { scope: 'support_access.request', limit: 20, window: '1 hour' } as const
const DECISION_RATE_LIMIT = {
  scope: 'admin.destructive',
  limit: 30,
  window: '5 minutes',
} as const

/**
 * A grant approved with less than this left is refused rather than created.
 *
 * A request that has been sitting for twenty-four hours has no window left
 * inside the ceiling, and issuing a permission that is already dead would be a
 * green banner over nothing.
 */
const MINIMUM_USEFUL_WINDOW_MS = 60_000

const ENTITY_TYPE = 'support_access_grant'

// ===========================================================================
// Input
// ===========================================================================

const uuid = z.string().uuid({ message: 'Geçerli bir kimlik (UUID) değil.' })

const scopeSchema = z.custom<SupportAccessScope>(isSupportAccessScope, {
  message: 'Tanınmayan bir kapsam gönderildi.',
})

const requestSchema = z.object({
  /**
   * Minted by the action rather than by `gen_random_uuid()`.
   *
   * The audit row's `entity_id` and `support_access_grant_id` are read off the
   * *input* by `runAdminAction`, before the handler runs — so a server-side id
   * is what makes "the row that was written" and "the row the trail names"
   * provably the same object instead of two things that usually agree.
   */
  grantId: uuid,
  subjectUserId: uuid,
  scopes: z
    .array(scopeSchema)
    .min(1, { message: supportAccessMessages.request.scopesRequired })
    .max(8),
  reason: z
    .string()
    .trim()
    .min(MIN_SUPPORT_ACCESS_REASON, {
      message: supportAccessMessages.request.reasonTooShort(MIN_SUPPORT_ACCESS_REASON),
    })
    .max(MAX_SUPPORT_ACCESS_REASON, {
      message: supportAccessMessages.request.reasonTooLong(MAX_SUPPORT_ACCESS_REASON),
    }),
  ticketId: uuid.nullable(),
  windowMinutes: z
    .number()
    .int()
    .min(1, { message: 'Süre en az bir dakika olmalıdır.' })
    .max(MAX_SUPPORT_ACCESS_WINDOW_MINUTES, {
      message: `Süre en fazla ${MAX_SUPPORT_ACCESS_WINDOW_MINUTES / 60} saat olabilir.`,
    }),
})

type RequestInput = z.infer<typeof requestSchema>

const decisionSchema = z.object({
  grantId: uuid,
  /** Carried for the audit row's subject column; null when the grant is gone. */
  subjectUserId: uuid.nullable(),
  reason: z
    .string()
    .trim()
    .min(MIN_REASON_LENGTH, { message: `Gerekçe en az ${MIN_REASON_LENGTH} karakter olmalıdır.` })
    .max(MAX_REASON_LENGTH, {
      message: `Gerekçe en fazla ${MAX_REASON_LENGTH} karakter olabilir.`,
    }),
})

type DecisionInput = z.infer<typeof decisionSchema>

// ===========================================================================
// The request
// ===========================================================================

const requestSpec: AdminActionSpec<RequestInput, { grantId: string }> = {
  action: 'support_access.requested',
  permission: 'support.access.request',
  input: requestSchema,
  rateLimit: REQUEST_RATE_LIMIT,
  entityType: ENTITY_TYPE,
  subject: (input) => ({ userId: input.subjectUserId, entityId: input.grantId }),
  supportAccessGrantId: (input) => input.grantId,
  detail: (input) => ({
    scope_count: input.scopes.length,
    // Enum members, comma joined. Tokens by type: nothing a person wrote.
    scopes: input.scopes.join(','),
    window_minutes: input.windowMinutes,
    ticket_linked: input.ticketId !== null,
  }),
  run: async (context, input) => {
    // `requested_at` is written explicitly from the injected clock rather than
    // left to the column default, so `expires_at = requested_at + window`
    // satisfies `support_access_grants_window_is_short` exactly instead of by a
    // few milliseconds of luck against `now()`.
    const requestedAt = context.now
    const expiresAt = new Date(requestedAt.getTime() + input.windowMinutes * 60_000)

    const row = await insertRow(
      'support_access_grants',
      {
        id: input.grantId,
        admin_user_id: context.actor.adminUserId,
        subject_user_id: input.subjectUserId,
        scopes: [...input.scopes],
        reason: input.reason,
        ticket_id: input.ticketId,
        // It grants nothing. Only a second admin can make it usable.
        status: 'pending_approval',
        requested_at: requestedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      ['id'],
    )
    return { grantId: row.id }
  },
}

/**
 * Open a Support Access request.
 *
 * Returns a state rather than redirecting: the form has five fields and an
 * operator who mistyped a ticket reference should not lose the paragraph they
 * just wrote.
 */
export async function requestSupportAccessAction(
  _previous: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  let session: AdminSession
  try {
    // Session, permission, same-origin and CSRF, in one call.
    session = await requirePermissionAction('support.access.request', formData)
  } catch {
    return formFailure(supportAccessMessages.outcomes.forbidden.body)
  }

  const actor = await resolveAdminById(session.adminUserId, session.sessionId).catch(() => null)
  if (actor === null) {
    return formFailure(supportAccessMessages.outcomes.forbidden.body)
  }

  const subjectRaw = readField(formData, REQUEST_FIELDS.subject)
  const ticketRaw = readField(formData, REQUEST_FIELDS.ticket)
  const scopes = formData.getAll(REQUEST_FIELDS.scope).map((value) => String(value))
  const reason = String(formData.get(REQUEST_FIELDS.reason) ?? '')
  const windowMinutes = Number(readField(formData, REQUEST_FIELDS.window))

  // The two references are resolved before the privileged operation so a typo
  // is a field error rather than a foreign-key failure the operator cannot
  // read. Neither lookup grants anything, and both sit behind the permission
  // check above.
  if (!isUuidParam(subjectRaw)) {
    return formIssue(REQUEST_FIELDS.subject, supportAccessMessages.request.subjectInvalid)
  }

  let subjectExists: boolean
  try {
    subjectExists = (await loadSubjectSummary(subjectRaw)) !== null
  } catch {
    return formFailure(supportAccessMessages.request.subjectLookupFailed)
  }
  if (!subjectExists) {
    return formIssue(REQUEST_FIELDS.subject, supportAccessMessages.request.subjectUnknown)
  }

  let ticketId: string | null = null
  if (ticketRaw !== '') {
    try {
      const ticket = await resolveTicketReference(ticketRaw)
      if (ticket === null) {
        return formIssue(REQUEST_FIELDS.ticket, supportAccessMessages.request.ticketUnknown)
      }
      ticketId = ticket.ticketId
    } catch {
      return formFailure(supportAccessMessages.request.ticketLookupFailed)
    }
  }

  const grantId = crypto.randomUUID()
  const result = await runAdminAction(actor, requestSpec, {
    grantId,
    subjectUserId: subjectRaw,
    scopes,
    reason,
    ticketId,
    windowMinutes,
  })

  if (result.status === 'success') {
    revalidatePath(SUPPORT_ACCESS_PATH)
    revalidatePath(grantHref(result.data.grantId))
    return {
      status: 'success',
      message: supportAccessMessages.request.successBody,
      issues: {},
      grantId: result.data.grantId,
    }
  }

  if (result.status === 'invalid') {
    const issues: Record<string, string> = {}
    let general: string | null = null
    for (const issue of result.issues) {
      const field = issuePath(issue.path)
      if (field === null) general ??= issue.message
      else issues[field] ??= issue.message
    }
    return {
      status: 'error',
      message:
        general ?? (Object.keys(issues).length === 0 ? failureMessage('validation_failed') : null),
      issues,
      grantId: null,
    }
  }

  if (result.status === 'denied') {
    return formFailure(supportAccessMessages.outcomes.forbidden.body)
  }
  if (result.status === 'rate_limited') {
    return formFailure(supportAccessMessages.outcomes.ratelimited.body)
  }
  if (result.effectApplied && !result.auditWritten) {
    return formFailure(supportAccessMessages.outcomes.auditMissing.body)
  }
  return formFailure(failureMessage(result.code))
}

// ===========================================================================
// The decisions
// ===========================================================================

const approveSpec: AdminActionSpec<DecisionInput, { grantId: string; expiresAt: string }> = {
  action: 'support_access.approved',
  permission: 'support.access.approve',
  input: decisionSchema,
  rateLimit: DECISION_RATE_LIMIT,
  entityType: ENTITY_TYPE,
  subject: (input) => ({ userId: input.subjectUserId, entityId: input.grantId }),
  supportAccessGrantId: (input) => input.grantId,
  detail: (_input, result) => ({ expires_at: result.expiresAt }),
  run: async (context, input) => {
    const grant = await loadGrant(input.grantId)
    if (grant === null) {
      throw new AppError('not_found', {
        status: 404,
        detail: `no support access grant ${input.grantId}`,
      })
    }

    // The window is re-based on the approval so a request that waited an hour
    // for a reviewer does not arrive with most of its time already spent —
    // clamped, as `support_access_grants_window_is_short` insists, to
    // twenty-four hours after the original request.
    const now = context.now
    const ceiling = new Date(grant.requested_at).getTime() + APPROVAL_CEILING_MS
    const rebased = now.getTime() + grant.window_minutes * 60_000
    const expiresAt = new Date(Math.min(rebased, ceiling))

    if (expiresAt.getTime() - now.getTime() < MINIMUM_USEFUL_WINDOW_MS) {
      throw new AppError('validation_failed', {
        status: 422,
        detail: 'the twenty-four hour ceiling leaves no usable window for this request',
      })
    }

    // `approved_by` is what `support_access_grants_four_eyes` compares against
    // `admin_user_id`. Self-approval is refused here by Postgres, not by an
    // `if` above; the status filter loses the race to a concurrent decision
    // rather than overwriting it.
    const updated = await updateRows(
      'support_access_grants',
      {
        status: 'active',
        approved_by: context.actor.adminUserId,
        approved_at: now.toISOString(),
        granted_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      [
        { column: 'id', op: 'eq', value: input.grantId },
        { column: 'status', op: 'eq', value: 'pending_approval' },
      ],
      ['id'],
    )
    if (updated.length === 0) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `grant ${input.grantId} was no longer pending approval`,
      })
    }

    return { grantId: input.grantId, expiresAt: expiresAt.toISOString() }
  },
}

export async function approveGrantAction(formData: FormData): Promise<void> {
  const grantId = readField(formData, DECISION_FIELDS.grantId)
  const outcome = await decide(
    formData,
    grantId,
    approveSpec,
    'approved',
    async (result, actor) => {
      if (result.status !== 'failed') return null
      if (result.code === 'not_found') return 'notfound'
      if (result.code === 'forbidden') return 'forbidden'
      if (result.code !== 'sync_conflict' && result.code !== 'validation_failed') return null
      const refusal = await diagnoseApprovalRefusal({
        grantId,
        approverAdminUserId: actor.adminUserId,
        now: systemClock.now(),
        kind: result.code === 'sync_conflict' ? 'conflict' : 'validation',
      })
      return refusal === 'unknown' ? null : refusal
    },
  )
  finish(grantId, outcome)
}

const denySpec: AdminActionSpec<DecisionInput, { grantId: string }> = {
  action: 'support_access.denied',
  permission: 'support.access.approve',
  input: decisionSchema,
  rateLimit: DECISION_RATE_LIMIT,
  entityType: ENTITY_TYPE,
  subject: (input) => ({ userId: input.subjectUserId, entityId: input.grantId }),
  supportAccessGrantId: (input) => input.grantId,
  run: async (context, input) => {
    // `support_access_grants_denied_needs_reason` requires all three of these
    // together; the runner has already established that the reason exists.
    const updated = await updateRows(
      'support_access_grants',
      {
        status: 'denied',
        denied_by: context.actor.adminUserId,
        denied_at: context.now.toISOString(),
        denied_reason: input.reason,
      },
      [
        { column: 'id', op: 'eq', value: input.grantId },
        { column: 'status', op: 'eq', value: 'pending_approval' },
      ],
      ['id'],
    )
    if (updated.length === 0) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `grant ${input.grantId} was no longer pending approval`,
      })
    }
    return { grantId: input.grantId }
  },
}

export async function denyGrantAction(formData: FormData): Promise<void> {
  const grantId = readField(formData, DECISION_FIELDS.grantId)
  const outcome = await decide(formData, grantId, denySpec, 'denied', async (result) => {
    if (result.status !== 'failed') return null
    if (result.code === 'not_found') return 'notfound'
    if (result.code !== 'sync_conflict') return null
    const refusal = await diagnoseTransitionRefusal(grantId, ['pending_approval'])
    return refusal === 'unknown' ? null : refusal
  })
  finish(grantId, outcome)
}

const revokeSpec: AdminActionSpec<DecisionInput, { grantId: string; wasHolder: boolean }> = {
  action: 'support_access.revoked',
  /**
   * The floor, not the whole rule.
   *
   * Revocation is open to two different people for two different reasons — the
   * holder handing an access back, and an approver taking it away — and
   * `runAdminAction` takes one permission, so the floor is the one both must
   * have to be in this workflow at all. The second half is asked inside `run()`
   * with `requireAdminPermission`, against the database, at the moment of
   * acting.
   *
   * `support.access.request` is the right floor because every role in the
   * matrix that holds `support.access.approve` also holds it (operations and
   * super_admin). `__tests__/permission-matrix.test.ts` fails the build if the
   * migration and `permissions.ts` ever disagree, so a future role with approve
   * but not request would surface there rather than silently locking an
   * approver out of this button.
   */
  permission: 'support.access.request',
  input: decisionSchema,
  rateLimit: DECISION_RATE_LIMIT,
  entityType: ENTITY_TYPE,
  subject: (input) => ({ userId: input.subjectUserId, entityId: input.grantId }),
  supportAccessGrantId: (input) => input.grantId,
  detail: (_input, result) => ({ revoked_by_holder: result.wasHolder }),
  run: async (context, input) => {
    const grant = await loadGrant(input.grantId)
    if (grant === null) {
      throw new AppError('not_found', {
        status: 404,
        detail: `no support access grant ${input.grantId}`,
      })
    }

    // An operator handing back their own grant needs nobody's permission — that
    // is what makes "I no longer need this" a one-click action rather than a
    // second request. Taking somebody else's away is an approver's decision,
    // and the question is asked of the database at the moment of acting rather
    // than of the permission set loaded when the page rendered.
    const wasHolder = grant.admin_user_id === context.actor.adminUserId
    if (!wasHolder) {
      await requireAdminPermission(context.actor, 'support.access.approve')
    }

    const updated = await updateRows(
      'support_access_grants',
      {
        status: 'revoked',
        revoked_by: context.actor.adminUserId,
        revoked_at: context.now.toISOString(),
        revoked_reason: input.reason,
      },
      [
        { column: 'id', op: 'eq', value: input.grantId },
        { column: 'revoked_at', op: 'is', value: null },
        { column: 'status', op: 'in', value: ['pending_approval', 'active'] },
      ],
      ['id'],
    )
    if (updated.length === 0) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `grant ${input.grantId} was not in a revocable state`,
      })
    }
    return { grantId: input.grantId, wasHolder }
  },
}

export async function revokeGrantAction(formData: FormData): Promise<void> {
  const grantId = readField(formData, DECISION_FIELDS.grantId)
  const outcome = await decide(formData, grantId, revokeSpec, 'revoked', async (result) => {
    if (result.status !== 'failed') return null
    if (result.code === 'not_found') return 'notfound'
    if (result.code === 'forbidden') return 'forbidden'
    if (result.code !== 'sync_conflict') return null
    const refusal = await diagnoseTransitionRefusal(grantId, ['pending_approval', 'active'])
    return refusal === 'unknown' ? null : refusal
  })
  finish(grantId, outcome)
}

// ===========================================================================
// The shared decision path
// ===========================================================================

/**
 * Run one decision and reduce it to an outcome token.
 *
 * `diagnose` runs only after the database has already refused, and only to
 * decide which sentence the operator reads. It cannot allow anything: the write
 * has failed and the audit row for the failure is already written by the time
 * it is called.
 */
async function decide<TResult>(
  formData: FormData,
  grantId: string,
  spec: AdminActionSpec<DecisionInput, TResult>,
  success: SupportAccessOutcomeKey,
  diagnose: (
    result: AdminActionResult<TResult>,
    actor: AdminActor,
  ) => Promise<SupportAccessOutcomeKey | null>,
): Promise<SupportAccessOutcomeKey> {
  // Two gates, and the split is deliberate. This one is the route gate: an
  // operator who holds neither Support Access permission is not in this
  // workflow at all, and is refused here along with the same-origin and CSRF
  // checks. The *specific* permission each decision needs is checked by
  // `runAdminAction` below, which audits the refusal — so a support engineer
  // reaching for an approval they may not make leaves a `failure` row on the
  // grant they aimed it at, which is exactly what the trail is for.
  let session: AdminSession
  try {
    session = await requirePermissionAction(
      { anyOf: ['support.access.approve', 'support.access.request'] },
      formData,
    )
  } catch {
    return 'forbidden'
  }

  const actor = await resolveAdminById(session.adminUserId, session.sessionId).catch(() => null)
  if (actor === null) return 'forbidden'

  if (!isUuidParam(grantId)) return 'invalid'

  // Read once, before the operation, purely so the audit row can name the user
  // the decision was about. A grant that has vanished still goes through the
  // runner with a null subject, so the attempt is recorded rather than dropped.
  const existing = await loadGrant(grantId).catch(() => null)

  const result = await runAdminAction(actor, spec, {
    grantId,
    subjectUserId: existing?.subject_user_id ?? null,
    reason: String(formData.get(DECISION_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') return success
  if (result.status === 'denied') return 'forbidden'
  if (result.status === 'invalid') return 'invalid'
  if (result.status === 'rate_limited') return 'ratelimited'
  if (result.effectApplied && !result.auditWritten) return 'auditMissing'

  return (await diagnose(result, actor)) ?? 'failed'
}

/**
 * Re-render the two pages this changed and send the operator back to the record
 * with the answer on the URL.
 *
 * The destination is built from a uuid this module validated, never from a
 * posted path, so there is no field here a crafted form could turn into an open
 * redirect.
 */
function finish(grantId: string, outcome: SupportAccessOutcomeKey): never {
  revalidatePath(SUPPORT_ACCESS_PATH)
  if (isUuidParam(grantId)) {
    revalidatePath(grantHref(grantId))
    redirect(withOutcome(grantHref(grantId), outcome))
  }
  redirect(withOutcome(SUPPORT_ACCESS_PATH, outcome))
}

// ===========================================================================
// Form plumbing
// ===========================================================================

function readField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim()
}

/** Zod paths are dotted; `scopes.0` belongs under the `scopes` control. */
function issuePath(path: string): string | null {
  if (path === '') return null
  const head = path.split('.')[0] ?? ''
  switch (head) {
    case 'subjectUserId':
      return REQUEST_FIELDS.subject
    case 'scopes':
      return REQUEST_FIELDS.scope
    case 'reason':
      return REQUEST_FIELDS.reason
    case 'ticketId':
      return REQUEST_FIELDS.ticket
    case 'windowMinutes':
      return REQUEST_FIELDS.window
    default:
      return null
  }
}

function formFailure(message: string): RequestFormState {
  return { ...initialRequestFormState, status: 'error', message }
}

function formIssue(field: string, message: string): RequestFormState {
  return { ...initialRequestFormState, status: 'error', issues: { [field]: message } }
}
