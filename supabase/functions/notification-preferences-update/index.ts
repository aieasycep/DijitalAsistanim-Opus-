import { updateNotificationPreferencesRequestSchema } from '@da/validation'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

serveFunction('notification-preferences-update', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, updateNotificationPreferencesRequestSchema)
  const client = serviceClient()

  const patch: Record<string, unknown> = {}
  if (body.categories !== undefined) patch.categories = body.categories
  if (body.onlyIfImportant !== undefined) patch.only_if_important = body.onlyIfImportant
  if (body.lockScreenPrivacy !== undefined) patch.lock_screen_privacy = body.lockScreenPrivacy
  if (body.quietHoursStart !== undefined) patch.quiet_hours_start = body.quietHoursStart
  if (body.quietHoursEnd !== undefined) patch.quiet_hours_end = body.quietHoursEnd

  if (Object.keys(patch).length > 0) {
    // Upsert rather than update: the row is seeded at signup, but a user whose
    // trigger ran before this table existed would otherwise have nothing to update.
    const { error } = await client
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
    if (error) throw dbError(error)
  }

  const { data, error } = await client
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw dbError(error)

  return jsonResponse({ preferences: data }, 200, origin)
})
