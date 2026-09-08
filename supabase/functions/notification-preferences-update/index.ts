import {
  notificationPreferencesUpdateRequest,
  type NotificationPreferencesUpdateResponse,
} from '@da/validation'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Patch the caller's notification preferences and answer with the row.
 *
 * The envelope is `notificationPreferences`, not `preferences`. `preferences`
 * is what `preferences-update` calls the *user* preferences row, and this
 * endpoint used to borrow that name while its caller required this one — so
 * every toggle on the notification settings screen saved the change, failed to
 * parse the answer, and snapped back in front of the user.
 *
 * The write and the read-back are one statement. Upserting rather than updating
 * matters because the row is seeded by the signup trigger: a user who signed up
 * before this table existed has nothing to update, and would otherwise be
 * answered with a null the contract does not allow.
 */
serveFunction('notification-preferences-update', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, notificationPreferencesUpdateRequest)

  // Only the fields the caller actually sent: the patch is partial, and an
  // absent field means "leave it alone", not "reset it".
  const patch: Record<string, unknown> = { user_id: user.id }
  if (body.categories !== undefined) patch.categories = body.categories
  if (body.onlyIfImportant !== undefined) patch.only_if_important = body.onlyIfImportant
  if (body.lockScreenPrivacy !== undefined) patch.lock_screen_privacy = body.lockScreenPrivacy
  if (body.quietHoursStart !== undefined) patch.quiet_hours_start = body.quietHoursStart
  if (body.quietHoursEnd !== undefined) patch.quiet_hours_end = body.quietHoursEnd

  const { data, error } = await serviceClient()
    .from('notification_preferences')
    .upsert(patch, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) throw dbError(error)

  const payload: NotificationPreferencesUpdateResponse = {
    notificationPreferences: data as Record<string, unknown>,
  }

  return jsonResponse(payload, 200, origin)
})
