import { decideApprovalRequestSchema } from '@da/validation'
import {
  AppError,
  type ApprovalActionType,
  type ApprovalPayload,
  type ApprovalStatus,
  assertTransition,
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
  const body = await parseBody(request, decideApprovalRequestSchema)
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
    assertTransition(status, 'rejected')
    const { error } = await client
      .from('approval_actions')
      .update({ status: 'rejected', rejected_at: now.toISOString() })
      .eq('id', body.approvalId)
      .eq('user_id', user.id)
    if (error) throw dbError(error)

    await audit({
      userId: user.id,
      action: 'approval.rejected',
      entityType: 'approval',
      entityId: body.approvalId,
      metadata: { type },
    })

    return jsonResponse(
      {
        approvalId: body.approvalId,
        status: 'rejected',
        resultRef: null,
        failureCode: null,
        missingScopes: [],
      },
      200,
      origin,
    )
  }

  assertTransition(status, 'approved')

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

  const { error } = await client
    .from('approval_actions')
    .update({
      status: 'approved',
      approved_at: now.toISOString(),
      ...(body.editedPayload ? { payload: body.editedPayload } : {}),
    })
    .eq('id', body.approvalId)
    .eq('user_id', user.id)
  if (error) throw dbError(error)

  await audit({
    userId: user.id,
    action: 'approval.approved',
    entityType: 'approval',
    entityId: body.approvalId,
    metadata: { type, edited: Boolean(body.editedPayload) },
  })

  // Executed inline: a user who taps Approve should see what happened, not a
  // spinner that resolves out of band.
  const result = await executeApproval(body.approvalId, user.id, now)
  return jsonResponse(result, 200, origin)
})
