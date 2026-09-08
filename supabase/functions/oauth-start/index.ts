import { oauthStartRequest, type OAuthStartResponse } from '@da/validation'
import { AppError, type AccountKind, type ScopeGroup } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { consumeRateLimit } from '../_shared/limits.ts'
import { buildAuthorizeUrl, isProviderConfigured } from '../_shared/oauth.ts'

/**
 * The read scope group an account kind implies.
 *
 * `oauth-complete` holds the inverse of this table — granted scopes back to
 * kinds — because the two functions are separate deployment units and cannot
 * share a module that is not in `_shared`. Change one and change the other.
 */
const READ_SCOPE_GROUP: Record<AccountKind, ScopeGroup> = {
  mail: 'mailRead',
  calendar: 'calendarRead',
  tasks: 'tasksRead',
  contacts: 'contactsRead',
}

/**
 * Begin an OAuth connection, or step up an existing one.
 *
 * Least privilege is enforced by `kinds`: the consent screen asks for the read
 * scope of each resource the caller named and nothing else, so connecting a
 * calendar never asks to read mail. A write scope is only ever added here when
 * the client passes it explicitly, which happens the first time the user tries
 * the action that needs it — and because the read groups are derived rather
 * than assumed, a step-up carries them along instead of quietly dropping them
 * on a provider that does not merge previously granted scopes.
 */
serveFunction('oauth-start', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, oauthStartRequest)
  await consumeRateLimit(user.id, 'oauthStart')

  if (!isProviderConfigured(body.provider)) {
    // A deployment without credentials for this provider says so plainly
    // rather than sending the user to a broken consent screen.
    throw new AppError('oauth_failed', {
      detail: `provider_not_configured:${body.provider}`,
      values: { provider: body.provider },
    })
  }

  // A step-up names the account it widens, and the state row will let the
  // callback update that row rather than insert a second one. Ownership is
  // checked here, before the consent screen opens: an id belonging to someone
  // else must never reach `oauth_states`.
  if (body.connectedAccountId) {
    const owned = await serviceClient()
      .from('connected_accounts')
      .select('id')
      .eq('id', body.connectedAccountId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (owned.error) throw dbError(owned.error)
    if (!owned.data) throw new AppError('not_found', { detail: 'account_missing' })
  }

  // `identity` is added by `buildAuthorizeUrl`; it is what the token exchange
  // needs to learn which provider account the user actually picked.
  const groups = new Set<ScopeGroup>(body.kinds.map((kind) => READ_SCOPE_GROUP[kind]))
  for (const group of body.additionalScopeGroups) groups.add(group)

  const result = await buildAuthorizeUrl({
    provider: body.provider,
    userId: user.id,
    additionalScopeGroups: [...groups],
    redirectTo: body.redirectTo,
    connectedAccountId: body.connectedAccountId,
  })

  const payload: OAuthStartResponse = {
    authorizeUrl: result.authorizeUrl,
    state: result.state,
  }

  return jsonResponse(payload, 200, origin)
})
