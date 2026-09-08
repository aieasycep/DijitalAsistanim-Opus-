import { pushTokenRegisterRequest, type PushTokenRegisterResponse } from '@da/validation'
import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Register this device for push.
 *
 * Keyed on `device_id` rather than the token: Expo rotates tokens, and keying
 * on the token would accumulate a dead row per rotation and multiply every
 * later notification.
 *
 * The answer is the row itself. It used to be `{ registered: true, id }` while
 * the client parsed a `{ pushToken }` envelope, so the upsert landed and the
 * app then threw at the boundary — push registration failed for every user on
 * every launch, silently, because the caller treats a failed registration as
 * something to retry next time rather than something to report.
 */
serveFunction('push-token-register', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, pushTokenRegisterRequest)
  const now = systemClock.now().toISOString()

  const { data, error } = await serviceClient()
    .from('push_tokens')
    .upsert(
      {
        user_id: user.id,
        token: body.token,
        platform: body.platform,
        device_id: body.deviceId,
        device_name: body.deviceName,
        app_version: body.appVersion,
        last_seen_at: now,
        // Re-registering a device that we had given up on brings it back:
        // the user reinstalled or re-granted permission, so the old failures
        // say nothing about this token.
        disabled_at: null,
      },
      { onConflict: 'user_id,device_id' },
    )
    .select('*')
    .single()

  if (error) throw dbError(error)

  const payload: PushTokenRegisterResponse = {
    pushToken: data as Record<string, unknown>,
  }

  return jsonResponse(payload, 200, origin)
})
