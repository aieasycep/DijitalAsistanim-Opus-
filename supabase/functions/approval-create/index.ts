import { approvalCreateRequest, type ApprovalCreateResponse } from '@da/validation'
import {
  type ApprovalStatus,
  approvalExpiryFrom,
  buildIdempotencyKey,
  isTerminal,
  systemClock,
} from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/** Postgres unique violation: a concurrent request claimed the key first. */
const UNIQUE_VIOLATION = '23505'

/**
 * Where a finished proposal's idempotency key goes when a new proposal for the
 * same action arrives.
 *
 * The row is kept — the history of what was sent or refused is the point of the
 * table — but the key is filed under the approval's own id so the base key is
 * free again. Derived rather than random so two concurrent re-proposals compute
 * the same thing and the unique index still decides the winner.
 */
function supersededKey(key: string, approvalId: string): string {
  return `${key}#done:${approvalId}`
}

/**
 * Propose an action for the user to approve.
 *
 * Nothing is executed here. The row lands in `pending`, and the only way it
 * ever reaches a provider is a subsequent explicit approval.
 *
 * The idempotency key — user, action type and the caller's discriminator —
 * names *the proposal currently in play* for that action, which is what makes
 * a double tap converge on one approval instead of queueing two sends. It does
 * not name the action for all time: an approval that was executed, rejected or
 * left to expire is finished, and the same action must be proposable again.
 * The previous code upserted onto the key unconditionally, so re-proposing
 * after a rejection tried to drag a terminal row back to `pending`, the state
 * machine trigger raised `illegal approval transition`, and one refusal blocked
 * that action permanently.
 */
serveFunction('approval-create', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, approvalCreateRequest)
  const now = systemClock.now()
  const client = serviceClient()

  const idempotencyKey = buildIdempotencyKey(user.id, body.type, body.discriminator)

  const respond = (approval: Record<string, unknown>): Response => {
    const payload: ApprovalCreateResponse = { approval }
    return jsonResponse(payload, 200, origin)
  }

  /** The proposal's own columns; status and the key are set only on insert. */
  const proposal = {
    type: body.type,
    what: body.what,
    why: body.why,
    source_type: body.sourceType,
    source_id: body.sourceId,
    payload: body.payload,
    original_payload: body.payload,
    expires_at: approvalExpiryFrom(now),
  }

  const existing = await client
    .from('approval_actions')
    .select('*')
    .eq('user_id', user.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existing.error) throw dbError(existing.error)

  const held = (existing.data ?? null) as Record<string, unknown> | null

  if (held && !isTerminal(held.status as ApprovalStatus)) {
    // The key is held by a proposal that is still in play, so this call joins
    // it rather than starting a second one.
    //
    // While it is `pending` the newer wording and payload replace it: the user
    // has approved nothing yet, so there is nothing to substitute, and the card
    // should show the draft the caller just produced. Once it is `approved`,
    // `executing` or `failed` the row is returned untouched — rewriting the
    // payload of an action the user has already approved would send something
    // they never saw, which is the one thing this gate exists to prevent.
    if (held.status === 'pending') {
      const refreshed = await client
        .from('approval_actions')
        .update(proposal)
        .eq('id', held.id as string)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle()

      if (refreshed.error) throw dbError(refreshed.error)
      // No row matched means it was decided between the read and the write, so
      // the copy already loaded is the honest answer.
      if (refreshed.data) return respond(refreshed.data as Record<string, unknown>)
    }
    return respond(held)
  }

  if (held) {
    // Terminal: executed, rejected or expired. Release the key so the fresh
    // proposal below can hold it.
    const released = await client
      .from('approval_actions')
      .update({ idempotency_key: supersededKey(idempotencyKey, held.id as string) })
      .eq('id', held.id as string)
      .eq('user_id', user.id)
      .eq('idempotency_key', idempotencyKey)

    if (released.error) throw dbError(released.error)
  }

  const inserted = await client
    .from('approval_actions')
    .insert({
      ...proposal,
      user_id: user.id,
      status: 'pending',
      idempotency_key: idempotencyKey,
      attempt_count: 0,
    })
    .select('*')
    .single()

  if (inserted.error) {
    if (inserted.error.code === UNIQUE_VIOLATION) {
      // Two proposals of the same action raced for the freed key. One approval
      // is the correct outcome, so the winner's row is the answer to both.
      const winner = await client
        .from('approval_actions')
        .select('*')
        .eq('user_id', user.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()

      if (winner.error) throw dbError(winner.error)
      if (winner.data) return respond(winner.data as Record<string, unknown>)
    }
    throw dbError(inserted.error)
  }

  await audit({
    userId: user.id,
    action: 'approval.created',
    entityType: 'approval',
    entityId: inserted.data.id as string,
    metadata: { type: body.type, superseded: held !== null },
  })

  return respond(inserted.data as Record<string, unknown>)
})
