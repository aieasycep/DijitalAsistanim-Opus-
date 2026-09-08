import { type DeleteHistoryResponse, deleteHistoryRequest } from '@da/validation'
import { audit } from '../_shared/audit.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/** Which tables each scope clears, and the column each is aged by. */
const SCOPES: Record<string, ReadonlyArray<{ table: string; column: string }>> = {
  emails: [
    { table: 'email_messages', column: 'sent_at' },
    { table: 'email_threads', column: 'last_message_at' },
  ],
  briefings: [
    { table: 'briefing_items', column: 'created_at' },
    { table: 'briefings', column: 'created_at' },
  ],
  assistant: [
    { table: 'assistant_messages', column: 'created_at' },
    { table: 'assistant_threads', column: 'created_at' },
  ],
  captures: [{ table: 'captures', column: 'created_at' }],
  memory: [{ table: 'memory_chunks', column: 'occurred_at' }],
}

const ALL_SCOPES = [
  ...SCOPES.emails!,
  ...SCOPES.briefings!,
  ...SCOPES.assistant!,
  ...SCOPES.captures!,
  ...SCOPES.memory!,
  { table: 'insights', column: 'created_at' },
  { table: 'life_events', column: 'created_at' },
]

/**
 * Delete a slice of the user's history.
 *
 * Connected accounts and credentials are never touched: clearing history is not
 * the same request as disconnecting a mailbox, and conflating them would
 * silently break sync for someone who only wanted to tidy up.
 *
 * The answer is one total. It used to be the per-table map this handler builds,
 * while the client parsed `{ deletedCount }` — so a deletion that had already
 * emptied the tables reported failure to the user. The breakdown survives on
 * the audit row, one count per table, where it is auditable rather than merely
 * unread.
 */
serveFunction('delete-history', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, deleteHistoryRequest)
  const client = serviceClient()

  const targets = body.scope === 'all' ? ALL_SCOPES : (SCOPES[body.scope] ?? [])
  const deleted: Record<string, number> = {}

  for (const target of targets) {
    let query = client.from(target.table).delete({ count: 'exact' }).eq('user_id', user.id)
    if (body.before) query = query.lt(target.column, body.before)

    const { count, error } = await query
    if (error) throw dbError(error)
    deleted[target.table] = count ?? 0
  }

  const deletedCount = Object.values(deleted).reduce((sum, n) => sum + n, 0)

  await audit({
    userId: user.id,
    action: 'privacy.history_deleted',
    metadata: { scope: body.scope, total: deletedCount, ...deleted },
  })

  const payload: DeleteHistoryResponse = { deletedCount }

  return jsonResponse(payload, 200, origin)
})
