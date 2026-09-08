import { profileUpdateRequest, type ProfileUpdateResponse } from '@da/validation'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { AppError, systemClock } from '../_shared/domain.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Profile update.
 *
 * The email address is deliberately not editable here: it is the identity the
 * auth provider issued, and changing it would silently break every provider
 * connection keyed on it.
 *
 * `avatarUrl` is written rather than dropped. The client has always offered it
 * and this function's own schema used to strip it, so `profiles.avatar_url`
 * was a column nothing on the wire could set — a patch that clears a picture
 * succeeded and left the picture in place.
 *
 * The answer is always a row. A caller whose profile row is missing gets
 * `not_found`; answering null instead let the session store replace the
 * signed-in user with nothing on a screen that was only saving a name.
 */
serveFunction('profile-update', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, profileUpdateRequest)
  const client = serviceClient()

  const patch: Record<string, unknown> = {}
  if (body.displayName !== undefined) patch.display_name = body.displayName
  if (body.givenName !== undefined) patch.given_name = body.givenName
  if (body.avatarUrl !== undefined) patch.avatar_url = body.avatarUrl
  if (body.timeZone !== undefined) patch.time_zone = body.timeZone
  if (body.locale !== undefined) patch.locale = body.locale
  // The request schema admits `true` only: an onboarding cannot be un-finished,
  // and the stamp is the server's to make so two devices cannot disagree on it.
  if (body.onboardingCompleted === true) {
    patch.onboarding_completed_at = systemClock.now().toISOString()
  }

  const table = client.from('profiles')
  const { data, error } =
    Object.keys(patch).length > 0
      ? await table.update(patch).eq('id', user.id).select('*').maybeSingle()
      : await table.select('*').eq('id', user.id).maybeSingle()

  if (error) throw dbError(error)
  if (!data) throw new AppError('not_found', { detail: 'profile_missing' })

  const payload: ProfileUpdateResponse = { profile: data as Record<string, unknown> }

  return jsonResponse(payload, 200, origin)
})
