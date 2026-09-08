import { approvalDecideRequest, type ApprovalDecideResponse } from '@da/validation'
import {
  AppError,
  type ApprovalActionType,
  type ApprovalPayload,
  type ApprovalStatus,
  canTransition,
  isExpired,
  systemClock,
  validateEdit,
} from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { executeApproval } from '../_shared/executor.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Approve or reject a proposed action.
 *
 * An approval carries the payload the user actually saw. When they edited it,
 * `validateEdit` checks the change against the fields that action type exposes
 * — which is what stops an "edit" being used to redirect a send at a recipient
 * the approval card never showed.
 */
serveFunction('approval-decide', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, approvalDecideRequest)
  const now = systemClock.now()
  const client = serviceClient()

  const loaded = await client
    .from('approval_actions')
    .select('id, type, status, payload, original_payload, expires_at')
    .eq('id', body.approvalId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (loaded.error) throw dbError(loaded.error)
  if (!loaded.data) throw new AppError('not_found', { detail: 'approval_missing' })

  const status = loaded.data.status as ApprovalStatus
  const type = loaded.data.type as ApprovalActionType

  if (isExpired(loaded.data.expires_at as string, now)) {
    await client
      .from('approval_actions')
      .update({ status: 'expired' })
      .eq('id', body.approvalId)
      .eq('user_id', user.id)
    await audit({
      userId: user.id,
      action: 'approval.expired',
      entityType: 'approval',
      entityId: body.approvalId,
      metadata: { type },
    })
    throw new AppError('approval_expired')
  }

  if (body.decision === 'reject') {
    // Refusing is the state machine's call: a proposal can be refused while it
    // is pending and after an execution failed, but not once it is running.
    if (!canTransition(status, 'rejected')) {
      throw new AppError('approval_already_executed', { detail: `status:${status}` })
    }

    // `.eq('status', status)` is the lock: a refusal that raced an approval
    // must not report "rejected, nothing happened" while the send is in flight.
    const refused = await client
      .from('approval_actions')
      .update({ status: 'rejected', rejected_at: now.toISOString() })
      .eq('id', body.approvalId)
      .eq('user_id', user.id)
      .eq('status', status)
      .select('id')
      .maybeSingle()

    if (refused.error) throw dbError(refused.error)
    if (!refused.data) {
      throw new AppError('approval_already_executed', { detail: 'lost_decision_race' })
    }

    await audit({
      userId: user.id,
      action: 'approval.rejected',
      entityType: 'approval',
      entityId: body.approvalId,
      metadata: { type },
    })

    const rejected: ApprovalDecideResponse = {
      approvalId: body.approvalId,
      status: 'rejected',
      resultRef: null,
      failureCode: null,
      missingScopes: [],
    }
    return jsonResponse(rejected, 200, origin)
  }

  // An approval is a decision about a *pending* proposal, and this guard has to
  // be stricter than the state machine to say so. `executing -> approved` is a
  // legal transition — it is how the executor re-queues a transient failure —
  // so checking the transition alone let a second Approve tap on a card that
  // was already running walk straight back into `executeApproval` and send the
  // same mail twice. Re-running something that already failed is a retry, and
  // `approval-retry` owns it; nothing else may re-enter execution from here.
  if (status !== 'pending') {
    throw new AppError('approval_already_executed', { detail: `status:${status}` })
  }

  if (body.editedPayload) {
    const original = loaded.data.original_payload as ApprovalPayload
    const check = validateEdit(type, original, body.editedPayload as ApprovalPayload)
    if (!check.valid) {
      throw new AppError('approval_illegal_edit', {
        detail: check.illegalFields.join(','),
        values: { fields: check.illegalFields.join(', ') },
      })
    }
  }

  // `.eq('status', 'pending')` makes the approval itself the lock: two taps
  // that both read a pending row cannot both claim it, so only one of them
  // reaches the executor.
  const claimed = await client
    .from('approval_actions')
    .update({
      status: 'approved',
      approved_at: now.toISOString(),
      ...(body.editedPayload ? { payload: body.editedPayload } : {}),
    })
    .eq('id', body.approvalId)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (claimed.error) throw dbError(claimed.error)
  if (!claimed.data) {
    throw new AppError('approval_already_executed', { detail: 'lost_decision_race' })
  }

  await audit({
    userId: user.id,
    action: 'approval.approved',
    entityType: 'approval',
    entityId: body.approvalId,
    metadata: { type, edited: Boolean(body.editedPayload) },
  })

  // Executed inline: a user who taps Approve should see what happened, not a
  // spinner that resolves out of band.
  const executed: ApprovalDecideResponse = await executeApproval(body.approvalId, user.id, now)
  return jsonResponse(executed, 200, origin)
})
