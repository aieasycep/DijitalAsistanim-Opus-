import { disconnectAccountRequestSchema } from '@da/validation'
import { AppError, type Provider } from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { revokeAndDelete } from '../_shared/oauth.ts'

/**
 * Disconnect a provider account.
 *
 * Provider-side revocation is attempted first but is explicitly best-effort:
 * the user asked to disconnect, so a provider outage must not stop us deleting
 * our own copy of their credentials.
 */
serveFunction('accounts-disconnect', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, disconnectAccountRequestSchema)
  const client = serviceClient()

  const account = await client
    .from('connected_accounts')
    .select('id, provider')
    .eq('id', body.connectedAccountId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (account.error) throw dbError(account.error)
  if (!account.data) throw new AppError('not_found', { detail: 'account_missing' })

  const provider = account.data.provider as Provider
  let providerRevoked = false

  if (body.revoke && (provider === 'google' || provider === 'microsoft')) {
    const outcome = await revokeAndDelete(provider, body.connectedAccountId)
    providerRevoked = outcome.providerRevoked
  } else {
    await client
      .from('oauth_credentials')
      .delete()
      .eq('connected_account_id', body.connectedAccountId)
  }

  // Deleting the account cascades its synced rows, which is the point: a
  // disconnected mailbox should not keep showing up in the feed.
  const { error } = await client
    .from('connected_accounts')
    .delete()
    .eq('id', body.connectedAccountId)
    .eq('user_id', user.id)
  if (error) throw dbError(error)

  await audit({
    userId: user.id,
    action: 'account.disconnected',
    entityType: 'connected_account',
    entityId: body.connectedAccountId,
    metadata: { provider, provider_revoked: providerRevoked },
  })

  return jsonResponse({ disconnected: true, providerRevoked }, 200, origin)
})
