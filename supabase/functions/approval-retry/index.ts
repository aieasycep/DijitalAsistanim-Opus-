import { z } from 'zod'
import { uuidSchema } from '@da/validation'
import { AppError, type ApprovalStatus, systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { executeApproval } from '../_shared/executor.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

const requestSchema = z.object({ approvalId: uuidSchema })

/**
 * Retry a failed execution.
 *
 * The user asked, so the attempt counter's automatic backoff is bypassed — but
 * the state machine is not: only a `failed` or `approved` approval can be
 * re-run, so this can never resurrect one that was rejected or already sent.
 */
serveFunction('approval-retry', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
  const now = systemClock.now()

  const loaded = await serviceClient()
    .from('approval_actions')
    .select('status')
    .eq('id', body.approvalId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (loaded.error) throw dbError(loaded.error)
  if (!loaded.data) throw new AppError('not_found', { detail: 'approval_missing' })

  const status = loaded.data.status as ApprovalStatus
  if (status !== 'failed' && status !== 'approved') {
    throw new AppError('approval_already_executed', { detail: `status:${status}` })
  }

  if (status === 'failed') {
    // Move back to `approved` so the executor's own transition guard accepts it.
    const { error } = await serviceClient()
      .from('approval_actions')
      .update({ status: 'approved', next_attempt_at: null })
      .eq('id', body.approvalId)
      .eq('user_id', user.id)
      .eq('status', 'failed')
    if (error) throw dbError(error)
  }

  const result = await executeApproval(body.approvalId, user.id, now)
  return jsonResponse(result, 200, origin)
})
