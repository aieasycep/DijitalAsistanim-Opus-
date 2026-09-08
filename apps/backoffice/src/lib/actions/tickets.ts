'use server'

import { AppError, isAppError, systemClock } from '@da/domain'
import { uuidSchema } from '@da/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  ASSIGNEE_NONE,
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  NOTE_VISIBILITIES,
  RESOLUTION_MAX_LENGTH,
  RESOLUTION_MIN_LENGTH,
  SUPPORT_PATH,
  TICKET_AUDIT_ACTIONS,
  TICKET_ENTITY_TYPE,
  TICKET_FIELDS,
  TICKET_PRIORITIES,
  TICKET_REASON_MAX,
  TICKET_REASON_MIN,
  TICKET_RESULT_PARAMS,
  WORKING_TICKET_STATUSES,
  isReopenable,
  type TicketAuditAction,
  type TicketOutcome,
} from '@/components/tickets/contract'
import { normaliseReason, reasonIssue } from '@/lib/admin-action'
import { writeAudit, type AuditDetail } from '@/lib/audit'
import { assertPermissionAtSource, requirePermissionAction, type AdminSession } from '@/lib/auth'
import { insertRow, queryView, updateRows, type SupportTicketTableRow } from '@/lib/db'
import { ticketMessages } from '@/lib/messages/tickets'
import type { AdminPermission } from '@/lib/permissions'
import { loadTicket } from '@/lib/queries/tickets'
import { adminBucket, assertRateLimit } from '@/lib/rate-limit'

/**
 * The six privileged operations the support queue exposes.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A RUNNER HERE AND NOT A CALL TO `runAdminAction`
 * ---------------------------------------------------------------------------
 *
 * `runAdminAction` in `@/lib/admin-action` is the wrapper every privileged
 * operation is meant to go through, and every guarantee it makes is reproduced
 * below in the same order — validate, authorise at the source, demand a written
 * reason, do the work, write the audit row on both the success and the failure
 * path. What it cannot do is name a ticket action: its `action` field is typed
 * `AdminAuditAction`, a closed union of the twenty-six names migration 0019
 * seeded into `admin_sensitive_actions`, and none of them is about a support
 * ticket. Widening that union means editing `db.ts`, `permissions.ts` and the
 * migration's seed together, which is a change this module does not own.
 *
 * So the runner is local, and it borrows rather than reimplements:
 *
 *   - `requirePermissionAction` (auth.ts) performs the same-origin check, the
 *     CSRF comparison and the permission decision;
 *   - `assertPermissionAtSource` (auth.ts) re-asks the database at the moment
 *     of acting, so a role changed while the operator had the page open takes
 *     effect on this click rather than on their next page load;
 *   - `assertRateLimit` (rate-limit.ts) counts the attempt in Postgres;
 *   - `reasonIssue` / `normaliseReason` (admin-action.ts) apply the console's
 *     own floor for a written justification, so the floor is one number in one
 *     file;
 *   - `writeAudit` (audit.ts) is the one call site for an audit row.
 *
 * The six action names live in the `admin.` namespace on purpose.
 * `audit_logs_enforce_accountability()` treats every action in that namespace
 * as sensitive and refuses the insert unless it names an acting admin and
 * carries a written reason — so these operations are accountable by the
 * database's rule, not by this file remembering to be.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE OPERATOR TYPES, AND WHERE IT GOES
 * ---------------------------------------------------------------------------
 *
 * Five of the six demand a sentence before they run, and that sentence is the
 * audit row's `reason`. The sixth is adding a note, where the note *is* the
 * record: it is stored in `support_notes` where the next operator reads it, and
 * the audit row carries a console-written sentence naming which kind of note
 * was added, its length and its id — never its text, because a note to a user
 * can quote the user.
 *
 * ---------------------------------------------------------------------------
 * WHAT TRAVELS BACK
 * ---------------------------------------------------------------------------
 *
 * A token from `TICKET_OUTCOMES` and a ticket reference, both this codebase's
 * own vocabulary. No database message and no provider text ever reaches the
 * URL or the screen. The redirect target is re-derived from an allowlist rather
 * than trusted from the form, so a crafted `returnTo` cannot turn a staff
 * button into an open redirect.
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * Ticket writes per operator.
 *
 * Not `RATE_LIMITS.destructive`: nothing here destroys anything, and a busy
 * shift legitimately touches far more than thirty tickets in five minutes.
 * What this stops is a script, and 240 an hour is well past what a person who
 * types a reason each time can reach. The scope matches
 * `admin_rate_limits_scope_shape` in 0019.
 */
const TICKET_WRITE_LIMIT = {
  scope: 'admin.ticket_write',
  limit: 240,
  windowSeconds: 60 * 60,
} as const

/** Only used to parse a relative path. Never fetched, never rendered. */
const RELATIVE_BASE = 'https://backoffice.invalid'

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const reasonSchema = z.string().trim().min(TICKET_REASON_MIN).max(TICKET_REASON_MAX)

const STATUS_TARGETS = [...WORKING_TICKET_STATUSES, 'closed'] as const

const assignInput = z.object({
  ticketId: uuidSchema,
  assignee: z.union([uuidSchema, z.literal(ASSIGNEE_NONE)]),
  reason: reasonSchema,
})

const statusInput = z.object({
  ticketId: uuidSchema,
  status: z.enum(STATUS_TARGETS),
  reason: reasonSchema,
})

const priorityInput = z.object({
  ticketId: uuidSchema,
  priority: z.enum(TICKET_PRIORITIES),
  reason: reasonSchema,
})

const noteInput = z.object({
  ticketId: uuidSchema,
  body: z.string().trim().min(NOTE_MIN_LENGTH).max(NOTE_MAX_LENGTH),
  visibility: z.enum(NOTE_VISIBILITIES),
})

const resolveInput = z.object({
  ticketId: uuidSchema,
  resolution: z.string().trim().min(RESOLUTION_MIN_LENGTH).max(RESOLUTION_MAX_LENGTH),
})

const reopenInput = z.object({
  ticketId: uuidSchema,
  reason: reasonSchema,
})

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim()
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

interface TicketActionResult {
  outcome: TicketOutcome
  /** `DA-001234`, for the banner. Null when the ticket was never resolved. */
  reference: string | null
}

interface TicketEffect {
  /** The success token this operation reports. */
  outcome: TicketOutcome
  /** Identifiers and codes for the audit row. Scalars only, by type. */
  detail: AuditDetail
}

interface TicketMutation<TInput extends { ticketId: string }> {
  permission: AdminPermission
  auditAction: TicketAuditAction
  parse: (formData: FormData) => TInput
  /**
   * The sentence the audit row carries. `operatorAuthored` marks the ones the
   * operator typed, which are held to the console's floor; the note action
   * writes its own, because the note itself is the record.
   */
  reason: (input: TInput) => string
  operatorAuthored: boolean
  /**
   * Refuse before anything is written, against the row the database currently
   * holds rather than the one the form was rendered from. Returning an outcome
   * stops the action; returning null lets it run.
   */
  guard?: (ticket: SupportTicketTableRow, input: TInput) => TicketOutcome | null
  run: (
    session: AdminSession,
    ticket: SupportTicketTableRow,
    input: TInput,
    nowIso: string,
  ) => Promise<TicketEffect>
}

/**
 * One privileged ticket operation, with every guard applied in order.
 *
 * The order matters and mirrors `runAdminAction`:
 *
 *   1. **Session, CSRF and permission**, before anything else — an
 *      unauthenticated post must not be able to spend another operator's rate
 *      limit or learn whether a ticket id exists.
 *   2. **Rate limit**, counted in Postgres, keyed by the acting admin.
 *   3. **Validation**, so the handler never sees an unparsed value.
 *   4. **The reason**, at the console's floor, refused here as a field-level
 *      answer rather than as a database exception.
 *   5. **Permission again, at the source**, because a role can change between
 *      a render and a click.
 *   6. **The current row**, so a decision is made against the database's state
 *      and not the form's.
 *   7. **The work.**
 *   8. **The audit row**, on the success path and on the failure path.
 *
 * It returns rather than throws: the caller is a form, and a thrown error
 * becomes an error boundary that loses what the operator typed.
 */
async function runTicketAction<TInput extends { ticketId: string }>(
  formData: FormData,
  mutation: TicketMutation<TInput>,
): Promise<TicketActionResult> {
  // 1. Session, CSRF, permission.
  let session: AdminSession
  try {
    session = await requirePermissionAction(mutation.permission, formData)
  } catch {
    return { outcome: 'forbidden', reference: null }
  }

  // 2. Rate limit.
  try {
    await assertRateLimit(TICKET_WRITE_LIMIT, adminBucket(session.adminUserId))
  } catch (error) {
    if (isAppError(error) && error.code === 'rate_limited') {
      return { outcome: 'rate_limited', reference: null }
    }
    return { outcome: 'failed', reference: null }
  }

  // 3. Validation.
  let input: TInput
  try {
    input = mutation.parse(formData)
  } catch {
    return { outcome: 'invalid', reference: null }
  }

  // 4. The reason, at the console's floor — one number, in `admin-action.ts`.
  const reason = normaliseReason(mutation.reason(input))
  if (mutation.operatorAuthored && reasonIssue(reason) !== null) {
    return { outcome: 'invalid', reference: null }
  }

  // 5. Permission at the source.
  try {
    await assertPermissionAtSource(session, mutation.permission)
  } catch {
    return { outcome: 'forbidden', reference: null }
  }

  // 6. The row as the database currently holds it.
  let ticket: SupportTicketTableRow | null
  try {
    ticket = await loadTicket(input.ticketId)
  } catch {
    return { outcome: 'failed', reference: null }
  }
  if (ticket === null) return { outcome: 'notfound', reference: null }

  const refusal = mutation.guard?.(ticket, input) ?? null
  if (refusal !== null) return { outcome: refusal, reference: ticket.reference }

  // 7. The work.
  const nowIso = systemClock.now().toISOString()
  let effect: TicketEffect
  try {
    effect = await mutation.run(session, ticket, input, nowIso)
  } catch (error) {
    // A refusal that happened inside the write — a constraint, a vanished row —
    // is still an attempt on a sensitive action, so it leaves a trail.
    await tryAudit({
      session,
      action: mutation.auditAction,
      ticket,
      reason,
      outcome: 'failure',
      detail: {
        ticket_reference: ticket.reference,
        failure_code: isAppError(error) ? error.code : 'unknown',
      },
    })
    return { outcome: 'failed', reference: ticket.reference }
  }

  // 8. The audit row. The change happened; if the trail did not land the
  // operator is told so plainly rather than reassured.
  const audited = await tryAudit({
    session,
    action: mutation.auditAction,
    ticket,
    reason,
    outcome: 'success',
    detail: { ticket_reference: ticket.reference, ...effect.detail },
  })

  return {
    outcome: audited ? effect.outcome : 'audit_failed',
    reference: ticket.reference,
  }
}

interface AuditAttempt {
  session: AdminSession
  action: TicketAuditAction
  ticket: SupportTicketTableRow
  reason: string
  outcome: 'success' | 'failure'
  detail: AuditDetail
}

async function tryAudit(attempt: AuditAttempt): Promise<boolean> {
  try {
    await writeAudit({
      actor: { adminUserId: attempt.session.adminUserId },
      action: attempt.action,
      // The ticket names its user; the audit row names the same one, so
      // "everything ever done about this account" resolves in one query.
      subjectUserId: attempt.ticket.subject_user_id,
      entityType: TICKET_ENTITY_TYPE,
      entityId: attempt.ticket.id,
      reason: attempt.reason,
      outcome: attempt.outcome,
      detail: attempt.detail,
    })
    return true
  } catch {
    return false
  }
}

/** Columns an update reads back. Never `body`, never `resolution_note`. */
const RETURNING = ['id', 'reference', 'status', 'priority', 'assigned_admin_user_id'] as const

/** Apply a patch to one ticket, refusing an update that matched no row. */
async function patchTicket(ticketId: string, patch: Partial<SupportTicketTableRow>): Promise<void> {
  const rows = await updateRows(
    'support_tickets',
    patch,
    [{ column: 'id', op: 'eq', value: ticketId }],
    RETURNING,
  )
  if (rows.length === 0) {
    throw new AppError('not_found', {
      status: 404,
      detail: `support ticket ${ticketId} vanished between read and write`,
    })
  }
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

/**
 * Whether an admin may actually work a ticket.
 *
 * The picker only offers holders of `support.ticket.write`, but a picker is a
 * rendering decision and this is the check. Read from `bo_admin_permissions`,
 * where a disabled admin has no rows at all, so assigning a ticket to somebody
 * who has left is refused rather than quietly parking it with them.
 */
async function canWorkTickets(adminUserId: string): Promise<boolean> {
  const rows = await queryView('bo_admin_permissions', {
    columns: ['admin_user_id'],
    filters: [
      { column: 'admin_user_id', op: 'eq', value: adminUserId },
      { column: 'permission', op: 'eq', value: 'support.ticket.write' },
    ],
    limit: 1,
  })
  return rows.length > 0
}

export async function assignTicketAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, TICKET_FIELDS.returnTo))

  const result = await runTicketAction(formData, {
    permission: 'support.ticket.assign',
    auditAction: TICKET_AUDIT_ACTIONS.assigned,
    parse: (data) =>
      assignInput.parse({
        ticketId: field(data, TICKET_FIELDS.ticketId),
        assignee: field(data, TICKET_FIELDS.assignee),
        reason: field(data, TICKET_FIELDS.reason),
      }),
    reason: (input) => input.reason,
    operatorAuthored: true,
    guard: (ticket, input) => {
      const next = input.assignee === ASSIGNEE_NONE ? null : input.assignee
      return ticket.assigned_admin_user_id === next ? 'noop' : null
    },
    run: async (_session, ticket, input) => {
      const next = input.assignee === ASSIGNEE_NONE ? null : input.assignee
      if (next !== null && !(await canWorkTickets(next))) {
        throw new AppError('validation_failed', {
          status: 422,
          detail: 'assignee does not hold support.ticket.write',
        })
      }
      await patchTicket(ticket.id, { assigned_admin_user_id: next })
      return {
        outcome: next === null ? 'unassigned' : 'assigned',
        detail: {
          previous_assignee: ticket.assigned_admin_user_id,
          new_assignee: next,
          ticket_status: ticket.status,
        },
      }
    },
  })

  settle(result, returnTo)
  redirect(withResult(returnTo, result))
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function changeTicketStatusAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, TICKET_FIELDS.returnTo))

  const result = await runTicketAction(formData, {
    permission: 'support.ticket.write',
    auditAction: TICKET_AUDIT_ACTIONS.statusChanged,
    parse: (data) =>
      statusInput.parse({
        ticketId: field(data, TICKET_FIELDS.ticketId),
        status: field(data, TICKET_FIELDS.status),
        reason: field(data, TICKET_FIELDS.reason),
      }),
    reason: (input) => input.reason,
    operatorAuthored: true,
    guard: (ticket, input) => {
      if (ticket.status === input.status) return 'noop'
      // Leaving a resolved or closed ticket is reopening it, which clears the
      // resolution timestamps and is therefore its own audited action.
      if (input.status !== 'closed' && isReopenable(ticket.status)) return 'ineligible'
      return null
    },
    run: async (_session, ticket, input, nowIso) => {
      // 0019's `support_tickets_closed_needs_timestamp` refuses `closed`
      // without `closed_at`, so the timestamp is part of the same statement
      // rather than a second write that could be missed.
      const patch: Partial<SupportTicketTableRow> =
        input.status === 'closed'
          ? { status: 'closed', closed_at: ticket.closed_at ?? nowIso }
          : { status: input.status }
      await patchTicket(ticket.id, patch)
      return {
        outcome: 'status_changed',
        detail: { previous_status: ticket.status, new_status: input.status },
      }
    },
  })

  settle(result, returnTo)
  redirect(withResult(returnTo, result))
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export async function changeTicketPriorityAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, TICKET_FIELDS.returnTo))

  const result = await runTicketAction(formData, {
    permission: 'support.ticket.write',
    auditAction: TICKET_AUDIT_ACTIONS.priorityChanged,
    parse: (data) =>
      priorityInput.parse({
        ticketId: field(data, TICKET_FIELDS.ticketId),
        priority: field(data, TICKET_FIELDS.priority),
        reason: field(data, TICKET_FIELDS.reason),
      }),
    reason: (input) => input.reason,
    operatorAuthored: true,
    guard: (ticket, input) => (ticket.priority === input.priority ? 'noop' : null),
    run: async (_session, ticket, input) => {
      await patchTicket(ticket.id, { priority: input.priority })
      return {
        outcome: 'priority_changed',
        detail: { previous_priority: ticket.priority, new_priority: input.priority },
      }
    },
  })

  settle(result, returnTo)
  redirect(withResult(returnTo, result))
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function addTicketNoteAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, TICKET_FIELDS.returnTo))

  const result = await runTicketAction(formData, {
    permission: 'support.ticket.write',
    auditAction: TICKET_AUDIT_ACTIONS.noteAdded,
    parse: (data) =>
      noteInput.parse({
        ticketId: field(data, TICKET_FIELDS.ticketId),
        body: String(data.get(TICKET_FIELDS.noteBody) ?? ''),
        visibility: field(data, TICKET_FIELDS.noteVisibility),
      }),
    // The note is the record. The audit row says which kind of note was added
    // and how long it was; it never carries the text, because a note written
    // to a user can quote the user.
    reason: (input) =>
      input.visibility === 'user'
        ? ticketMessages.generatedReasons.userNote
        : ticketMessages.generatedReasons.internalNote,
    operatorAuthored: false,
    run: async (session, ticket, input, nowIso) => {
      const internal = input.visibility === 'internal'
      const note = await insertRow(
        'support_notes',
        {
          ticket_id: ticket.id,
          admin_user_id: session.adminUserId,
          body: input.body,
          is_internal: internal,
        },
        ['id', 'ticket_id', 'is_internal', 'created_at'],
      )

      // Time-to-first-response means the first time the user was actually
      // answered. Picking a ticket up is not an answer; a note they can read
      // is, and it starts the clock exactly once.
      const startsClock = !internal && ticket.first_response_at === null
      if (startsClock) {
        await patchTicket(ticket.id, { first_response_at: nowIso })
      }

      return {
        outcome: 'note_added',
        detail: {
          note_id: note.id,
          is_internal: internal,
          body_length: input.body.length,
          first_response_recorded: startsClock,
        },
      }
    },
  })

  settle(result, returnTo)
  redirect(withResult(returnTo, result))
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export async function resolveTicketAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, TICKET_FIELDS.returnTo))

  const result = await runTicketAction(formData, {
    permission: 'support.ticket.write',
    auditAction: TICKET_AUDIT_ACTIONS.resolved,
    parse: (data) =>
      resolveInput.parse({
        ticketId: field(data, TICKET_FIELDS.ticketId),
        // The resolution note and the audit reason are the same sentence, so
        // the operator writes it once and it lands in both places.
        resolution: field(data, TICKET_FIELDS.reason),
      }),
    reason: (input) => input.resolution,
    operatorAuthored: true,
    guard: (ticket) => {
      if (ticket.status === 'resolved') return 'noop'
      if (ticket.status === 'closed') return 'ineligible'
      return null
    },
    run: async (_session, ticket, input, nowIso) => {
      // A resolution the user can read is itself a response, so a ticket that
      // was resolved without ever being answered records this as its first.
      const startsClock = ticket.first_response_at === null
      await patchTicket(ticket.id, {
        status: 'resolved',
        resolved_at: nowIso,
        resolution_note: input.resolution,
        ...(startsClock ? { first_response_at: nowIso } : {}),
      })
      return {
        outcome: 'resolved',
        detail: {
          previous_status: ticket.status,
          resolution_length: input.resolution.length,
          first_response_recorded: startsClock,
        },
      }
    },
  })

  settle(result, returnTo)
  redirect(withResult(returnTo, result))
}

export async function reopenTicketAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, TICKET_FIELDS.returnTo))

  const result = await runTicketAction(formData, {
    permission: 'support.ticket.write',
    auditAction: TICKET_AUDIT_ACTIONS.reopened,
    parse: (data) =>
      reopenInput.parse({
        ticketId: field(data, TICKET_FIELDS.ticketId),
        reason: field(data, TICKET_FIELDS.reason),
      }),
    reason: (input) => input.reason,
    operatorAuthored: true,
    guard: (ticket) => (isReopenable(ticket.status) ? null : 'ineligible'),
    run: async (_session, ticket) => {
      // The resolution note stays: it is what was concluded last time, and the
      // next operator needs to read it. The timestamps go, because a reopened
      // ticket is not resolved and the resolution-time measurement must not
      // keep counting it as one.
      await patchTicket(ticket.id, { status: 'open', resolved_at: null, closed_at: null })
      return {
        outcome: 'reopened',
        detail: {
          previous_status: ticket.status,
          had_resolution_note: ticket.resolution_note !== null,
        },
      }
    },
  })

  settle(result, returnTo)
  redirect(withResult(returnTo, result))
}

// ---------------------------------------------------------------------------
// Redirect targets
// ---------------------------------------------------------------------------

const TICKET_DETAIL_PATH =
  /^\/support\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * The posted return path, if it is one of ours; the queue otherwise.
 *
 * Parsing against a fixed base means an absolute URL to another host lands on a
 * different origin and is rejected, and a path outside this module is rejected
 * by the shape check. Previous result parameters are stripped so a second
 * action cannot stack its answer on top of the first one's.
 */
function safeReturnTo(raw: string): URL {
  const fallback = new URL(SUPPORT_PATH, RELATIVE_BASE)
  if (raw === '') return fallback

  let url: URL
  try {
    url = new URL(raw, RELATIVE_BASE)
  } catch {
    return fallback
  }

  if (url.origin !== RELATIVE_BASE) return fallback
  if (url.pathname !== SUPPORT_PATH && !TICKET_DETAIL_PATH.test(url.pathname)) return fallback

  for (const param of Object.values(TICKET_RESULT_PARAMS)) url.searchParams.delete(param)
  return url
}

function withResult(returnTo: URL, result: TicketActionResult): string {
  const url = new URL(returnTo.toString())
  url.searchParams.set(TICKET_RESULT_PARAMS.outcome, result.outcome)
  if (result.reference !== null) {
    url.searchParams.set(TICKET_RESULT_PARAMS.reference, result.reference)
  }
  return `${url.pathname}${url.search}`
}

/**
 * Re-query the pages the change is visible on.
 *
 * Both, always: an operator acting from the detail page has just changed a row
 * the queue is ordered by, and a queue that still shows the old status is a
 * queue two people will work twice.
 */
function settle(result: TicketActionResult, returnTo: URL): void {
  if (result.outcome === 'forbidden' || result.outcome === 'invalid') return
  revalidatePath(returnTo.pathname)
  if (returnTo.pathname !== SUPPORT_PATH) revalidatePath(SUPPORT_PATH)
}
