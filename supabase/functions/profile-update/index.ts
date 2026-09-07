import { z } from 'zod'
import { timeZoneSchema } from '@da/validation'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

const requestSchema = z
  .object({
    displayName: z.string().min(1).max(120).nullable(),
    givenName: z.string().min(1).max(60).nullable(),
    timeZone: timeZoneSchema,
    locale: z.enum(['tr', 'en']),
    onboardingCompleted: z.boolean(),
  })
  .partial()

/**
 * Profile update.
 *
 * The email address is deliberately not editable here: it is the identity the
 * auth provider issued, and changing it would silently break every provider
 * connection keyed on it.
 */
serveFunction('profile-update', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
  const client = serviceClient()

  const patch: Record<string, unknown> = {}
  if (body.displayName !== undefined) patch.display_name = body.displayName
  if (body.givenName !== undefined) patch.given_name = body.givenName
  if (body.timeZone !== undefined) patch.time_zone = body.timeZone
  if (body.locale !== undefined) patch.locale = body.locale
  if (body.onboardingCompleted === true) patch.onboarding_completed_at = new Date().toISOString()

  if (Object.keys(patch).length > 0) {
    const { error } = await client.from('profiles').update(patch).eq('id', user.id)
    if (error) throw dbError(error)
  }

  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw dbError(error)

  return jsonResponse({ profile: data }, 200, origin)
})
