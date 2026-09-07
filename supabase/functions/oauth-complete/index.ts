import { z } from 'zod'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

const requestSchema = z.object({
  provider: z.enum(['google', 'microsoft']),
  accountId: z.string().max(100).optional(),
})

/**
 * Called by the app after the browser round trip.
 *
 * The token exchange already happened in the provider callback; this returns
 * the resulting connection so the client can refresh its state without waiting
 * for a sync, and reports whether the account is actually usable.
 */
serveFunction('oauth-complete', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
  const client = serviceClient()

  let query = client
    .from('connected_accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', body.provider)
    .order('created_at', { ascending: false })
    .limit(1)

  if (body.accountId) query = query.eq('id', body.accountId)

  const { data, error } = await query.maybeSingle()
  if (error) throw dbError(error)

  return jsonResponse(
    { account: data, connected: data?.status === 'connected' },
    200,
    origin,
  )
})
