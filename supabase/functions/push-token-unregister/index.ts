import { z } from 'zod'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

const requestSchema = z.object({ deviceId: z.string().min(1).max(200) })

serveFunction('push-token-unregister', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)

  const { error } = await serviceClient()
    .from('push_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('device_id', body.deviceId)

  if (error) throw dbError(error)
  return jsonResponse({ unregistered: true }, 200, origin)
})
