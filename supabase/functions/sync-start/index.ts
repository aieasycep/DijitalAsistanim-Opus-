import {
  syncStartRequest,
  type SyncStartFailure,
  type SyncStartOutcome,
  type SyncStartResponse,
} from '@da/validation'
import { systemClock, toAppError } from '../_shared/domain.ts'
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
} from '../_shared/sync.ts'

/**
 * Run a sync now.
 *
 * A failure on one account is reported rather than thrown: a user with a broken
 * Outlook connection should still get their Gmail synced, and the failures
 * travel back beside the outcomes so the app can say which account needs
 * attention.
 *
 * A run where *nothing* succeeded is a different thing, and it fails. Returning
 * `started: true` for it is how "Şimdi eşitle" used to report a green tick over
 * an account that had not been read at all.
 */
serveFunction('sync-start', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, syncStartRequest)
  const now = systemClock.now()

  await consumeRateLimit(user.id, 'syncTrigger')
  await audit({ userId: user.id, action: 'sync.started', metadata: { manual: true } })

  const historyDays = await historyDaysFor(user.id)
  const outcomes: SyncStartOutcome[] = []
  const failures: SyncStartFailure[] = []
  let firstError: unknown = null

  for (const resource of body.resources) {
    // Contacts are an account kind without a sync path, so asking for them is
    // not an error — there is simply nothing to run.
    if (resource === 'contacts') continue

    const accounts = await listSyncableAccounts(user.id, resource)
    for (const account of accounts) {
      if (body.connectedAccountId && account.id !== body.connectedAccountId) continue
      try {
        if (resource === 'mail') outcomes.push(await syncMail(user.id, account, historyDays, now))
        else if (resource === 'calendar') outcomes.push(await syncCalendar(user.id, account, now))
        else outcomes.push(await syncTasks(user.id, account, now))
      } catch (error) {
        firstError ??= error
        failures.push({ accountId: account.id, resource, code: toAppError(error).code })
      }
    }
  }

  await audit({
    userId: user.id,
    action: failures.length > 0 ? 'sync.failed' : 'sync.completed',
    metadata: {
      accounts: outcomes.length,
      processed: outcomes.reduce((sum, outcome) => sum + outcome.processed, 0),
      failures: failures.length,
    },
  })

  // Nothing ran and something broke: the user pressed a button and every
  // account it covered failed, which is an error, not a result.
  if (outcomes.length === 0 && firstError !== null) throw toAppError(firstError)

  const payload: SyncStartResponse = {
    started: outcomes.length > 0,
    outcomes,
    failures,
  }

  return jsonResponse(payload, 200, origin)
})
