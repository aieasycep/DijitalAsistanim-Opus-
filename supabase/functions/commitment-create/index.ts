import { commitmentCreateRequest, type CommitmentCreateResponse } from '@da/validation'
import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Record a commitment the user entered themselves.
 *
 * This has no effect outside the app, so it takes effect immediately — the
 * approval requirement covers external side effects, not the user writing down
 * their own promise.
 *
 * The row is inserted rather than upserted. `commitments_user_source_quote_key`
 * is an index over `md5(source_quote)`, and PostgREST resolves `on_conflict`
 * against column names only, so naming that expression as a conflict target
 * described a statement the database was never asked to run. The index still
 * does its work as a constraint: re-tracking the same sentence from the same
 * source is reported as a conflict instead of quietly cloning the promise,
 * while a hand-written entry carries a source id of its own and never collides.
 */
serveFunction('commitment-create', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, commitmentCreateRequest)
  const now = systemClock.now()

  const { data, error } = await serviceClient()
    .from('commitments')
    .insert({
      user_id: user.id,
      text: body.text,
      direction: body.direction,
      person_name: body.personName,
      due_at: body.dueAt,
      status: 'open',
      source_type: body.sourceType,
      source_id: body.sourceId ?? `user:${now.getTime()}`,
      source_quote: body.quote,
      confidence: 1,
      confirmed_by_user: true,
    })
    .select('*')
    .single()

  if (error) throw dbError(error)

  const payload: CommitmentCreateResponse = { commitment: data }
  return jsonResponse(payload, 200, origin)
})
