import { oauthStartRequestSchema } from '@da/validation'
import { AppError, systemClock } from '../_shared/domain.ts'
import { requireUser } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { consumeRateLimit } from '../_shared/limits.ts'
import { buildAuthorizeUrl, isProviderConfigured } from '../_shared/oauth.ts'

/**
 * Begin an OAuth connection, or step up an existing one.
 *
 * Read scopes are requested at connect time; a write scope is only ever asked
 * for here when the client passes it explicitly, which happens the first time
 * the user tries the action that needs it.
 */
serveFunction('oauth-start', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, oauthStartRequestSchema)
  await consumeRateLimit(user.id, 'oauthStart')

  if (!isProviderConfigured(body.provider)) {
    // A deployment without credentials for this provider says so plainly
    // rather than sending the user to a broken consent screen.
    throw new AppError('oauth_failed', {
      detail: `provider_not_configured:${body.provider}`,
      values: { provider: body.provider },
    })
  }

  const result = await buildAuthorizeUrl({
    provider: body.provider,
    userId: user.id,
    additionalScopeGroups: body.additionalScopeGroups,
    redirectTo: body.redirectTo,
    connectedAccountId: null,
  })

  // The instant is returned so the client can show how long the link is valid.
  return jsonResponse(
    { ...result, expiresAt: new Date(systemClock.now().getTime() + 600_000).toISOString() },
    200,
    origin,
  )
})
