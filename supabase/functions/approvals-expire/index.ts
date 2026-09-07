import { audit } from '../_shared/audit.ts'
import { dbError, requireServiceSecret, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'
import { executeApproval } from '../_shared/executor.ts'
import { systemClock } from '../_shared/domain.ts'

/**
 * Approval maintenance, run on a short cron.
 *
 * Two jobs in one pass: expire proposals nobody acted on, and retry approvals
 * whose execution failed transiently and whose backoff has elapsed.
 */
serveFunction('approvals-expire', async ({ request, origin }) => {
  await requireServiceSecret(request, 'CRON_SECRET')
  const now = systemClock.now()
  const client = serviceClient()

  const expired = await client.rpc('expire_stale_approvals')
  if (expired.error) throw dbError(expired.error)

  const dueRetries = await client
    .from('approval_actions')
    .select('id, user_id')
    .eq('status', 'approved')
    .not('next_attempt_at', 'is', null)
    .lte('next_attempt_at', now.toISOString())
    .limit(50)
  if (dueRetries.error) throw dbError(dueRetries.error)

  let retried = 0
  let succeeded = 0
  for (const row of dueRetries.data ?? []) {
    retried++
    try {
      const result = await executeApproval(row.id as string, row.user_id as string, now)
      if (result.status === 'executed') succeeded++
    } catch {
      // executeApproval already recorded the failure and the next backoff.
    }
  }

  await audit({
    userId: null,
    action: 'approval.expired',
    metadata: { expired: (expired.data as number | null) ?? 0, retried, succeeded },
  })

  return jsonResponse(
    { expired: expired.data ?? 0, retried, succeeded },
    200,
    origin,
  )
})
