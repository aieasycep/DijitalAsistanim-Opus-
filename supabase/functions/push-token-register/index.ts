import { registerPushTokenRequestSchema } from '@da/validation'
import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Register this device for push.
 *
 * Keyed on `device_id` rather than the token: Expo rotates tokens, and keying
 * on the token would accumulate a dead row per rotation and multiply every
 * later notification.
 */
serveFunction('push-token-register', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, registerPushTokenRequestSchema)
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
        disabled_at: null,
      },
      { onConflict: 'user_id,device_id' },
    )
    .select('id')
    .single()

  if (error) throw dbError(error)
  return jsonResponse({ registered: true, id: data.id }, 200, origin)
})
