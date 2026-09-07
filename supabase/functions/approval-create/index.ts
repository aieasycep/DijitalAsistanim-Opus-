import { createApprovalRequestSchema } from '@da/validation'
import { approvalExpiryFrom, buildIdempotencyKey, systemClock } from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Propose an action for the user to approve.
 *
 * Nothing is executed here. The row lands in `pending`, and the only way it
 * ever reaches a provider is a subsequent explicit approval.
 */
serveFunction('approval-create', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, createApprovalRequestSchema)
  const now = systemClock.now()

  const idempotencyKey = buildIdempotencyKey(user.id, body.type, body.discriminator)

  // Upsert rather than insert: proposing the same action twice — a double tap,
  // a retried request — must converge on one approval, not queue two sends.
  const { data, error } = await serviceClient()
    .from('approval_actions')
    .upsert(
      {
        user_id: user.id,
        type: body.type,
        status: 'pending',
        what: body.what,
        why: body.why,
        source_type: body.sourceType,
        source_id: body.sourceId,
        payload: body.payload,
        original_payload: body.payload,
        idempotency_key: idempotencyKey,
        expires_at: approvalExpiryFrom(now),
        attempt_count: 0,
      },
      { onConflict: 'user_id,idempotency_key', ignoreDuplicates: false },
    )
    .select('*')
    .single()

  if (error) throw dbError(error)

  await audit({
    userId: user.id,
    action: 'approval.created',
    entityType: 'approval',
    entityId: data.id as string,
    metadata: { type: body.type },
  })

  return jsonResponse({ approval: data }, 200, origin)
})
