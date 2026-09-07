import { audit } from '../_shared/audit.ts'
import { dbError, requireServiceSecret, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'

/**
 * The nightly retention sweep.
 *
 * The policy itself lives in SQL so it runs in one transaction close to the
 * data; this function is the scheduler's entry point and the place the sweep's
 * result gets recorded.
 */
serveFunction('retention-cleanup', async ({ request, origin }) => {
  await requireServiceSecret(request, 'CRON_SECRET')
  const client = serviceClient()

  const [retention, oauthStates, approvals] = await Promise.all([
    client.rpc('cleanup_expired_retention'),
    client.rpc('cleanup_expired_oauth_states'),
    client.rpc('expire_stale_approvals'),
  ])

  if (retention.error) throw dbError(retention.error)

  const summary = {
    retention: retention.data ?? null,
    oauth_states_removed: (oauthStates.data as number | null) ?? 0,
    approvals_expired: (approvals.data as number | null) ?? 0,
  }

  await audit({
    userId: null,
    action: 'retention.swept',
    metadata: {
      oauth_states_removed: summary.oauth_states_removed,
      approvals_expired: summary.approvals_expired,
    },
  })

  return jsonResponse(summary, 200, origin)
})
