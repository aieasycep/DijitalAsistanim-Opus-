import { syncRequestSchema } from '@da/validation'
import { systemClock } from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { requireUser } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { consumeRateLimit } from '../_shared/limits.ts'
import {
  historyDaysFor,
  listSyncableAccounts,
  syncCalendar,
  syncMail,
  syncTasks,
  type SyncOutcome,
} from '../_shared/sync.ts'

/**
 * Run a sync now.
 *
 * A failure on one account is reported rather than thrown: a user with a
 * broken Outlook connection should still get their Gmail synced.
 */
serveFunction('sync-start', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, syncRequestSchema)
  const now = systemClock.now()

  await consumeRateLimit(user.id, 'syncTrigger')
  await audit({ userId: user.id, action: 'sync.started', metadata: { manual: true } })

  const historyDays = await historyDaysFor(user.id)
  const outcomes: SyncOutcome[] = []
  const failures: Array<{ accountId: string; resource: string; code: string }> = []

  for (const resource of body.resources) {
    if (resource === 'contacts') continue

    const accounts = await listSyncableAccounts(user.id, resource)
    for (const account of accounts) {
      if (body.connectedAccountId && account.id !== body.connectedAccountId) continue
      try {
        if (resource === 'mail') outcomes.push(await syncMail(user.id, account, historyDays, now))
        else if (resource === 'calendar') outcomes.push(await syncCalendar(user.id, account, now))
        else outcomes.push(await syncTasks(user.id, account, now))
      } catch (error) {
        failures.push({
          accountId: account.id,
          resource,
          code: error instanceof Error ? (error as { code?: string }).code ?? 'unknown' : 'unknown',
        })
      }
    }
  }

  await audit({
    userId: user.id,
    action: failures.length > 0 ? 'sync.failed' : 'sync.completed',
    metadata: {
      accounts: outcomes.length,
      processed: outcomes.reduce((sum, o) => sum + o.processed, 0),
      failures: failures.length,
    },
  })

  return jsonResponse({ started: true, outcomes, failures }, 200, origin)
})
