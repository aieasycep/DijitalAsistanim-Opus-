import { deleteAccountRequestSchema } from '@da/validation'
import { AppError, type Provider } from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { revokeAndDelete } from '../_shared/oauth.ts'
import { CAPTURES_BUCKET, EXPORTS_BUCKET, deleteUserObjects } from '../_shared/storage.ts'

/**
 * Permanently delete an account.
 *
 * Order matters and is chosen so a failure part-way through still leaves the
 * user better off, never worse:
 *
 *   1. revoke provider tokens — the only step that reaches outside our systems;
 *   2. delete stored objects, which no cascade would reach;
 *   3. delete the auth user, whose cascade clears every table;
 *   4. write the audit row last, with a null user id so it survives the cascade.
 */
serveFunction('delete-account', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, deleteAccountRequestSchema)
  const client = serviceClient()

  // Typing the address is the confirmation gate; a mismatch is a refusal, not
  // a prompt to try again with something else.
  if (!user.email || user.email.toLowerCase() !== body.confirmationEmail.toLowerCase()) {
    throw new AppError('validation_failed', { detail: 'confirmation_email_mismatch' })
  }

  const accounts = await client
    .from('connected_accounts')
    .select('id, provider')
    .eq('user_id', user.id)
  if (accounts.error) throw dbError(accounts.error)

  let revoked = 0
  for (const account of accounts.data ?? []) {
    const provider = account.provider as Provider
    if (provider !== 'google' && provider !== 'microsoft') continue
    try {
      const result = await revokeAndDelete(provider, account.id as string)
      if (result.providerRevoked) revoked++
    } catch {
      // Best effort: a provider that will not answer must not block deletion.
    }
  }

  let objectsRemoved = 0
  for (const bucket of [CAPTURES_BUCKET, EXPORTS_BUCKET]) {
    try {
      objectsRemoved += await deleteUserObjects(user.id, bucket)
    } catch {
      // Same reasoning: storage trouble must not leave the account undeleted.
    }
  }

  const { error } = await client.auth.admin.deleteUser(user.id)
  if (error) {
    throw new AppError('server_unavailable', { detail: 'auth_delete_failed' })
  }

  await audit({
    // Null: the row has to outlive the user it describes.
    userId: null,
    action: 'privacy.account_deleted',
    entityType: 'user',
    metadata: {
      accounts: accounts.data?.length ?? 0,
      provider_revoked: revoked,
      objects_removed: objectsRemoved,
    },
  })

  return jsonResponse({ deleted: true, providerRevoked: revoked, objectsRemoved }, 200, origin)
})
