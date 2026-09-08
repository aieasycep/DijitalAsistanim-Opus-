import { ACK, type AckResponse, pushTokenUnregisterRequest } from '@da/validation'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Forget this device.
 *
 * The row is deleted rather than disabled: `disabled_at` records a token the
 * *provider* rejected, which is our observation about a device that still
 * belongs to the user. This is the user saying "stop", and the honest answer to
 * that is no row at all.
 *
 * It answers `ACK`. It used to answer `{ unregistered: true }` while the client
 * parsed `{ ok: boolean }`, so a delete that had already succeeded was reported
 * as a failure.
 */
serveFunction('push-token-unregister', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, pushTokenUnregisterRequest)

  const { error } = await serviceClient()
    .from('push_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('device_id', body.deviceId)

  if (error) throw dbError(error)

  const payload: AckResponse = ACK

  return jsonResponse(payload, 200, origin)
})
