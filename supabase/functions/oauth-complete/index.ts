import { accountKind, oauthCompleteRequest, type OAuthCompleteResponse } from '@da/validation'
import {
  AppError,
  scopesFor,
  systemClock,
  type AccountKind,
  type ScopeGroup,
} from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { loadEntitlements, requireWithinLimit } from '../_shared/limits.ts'
import { consumeState, exchangeCode, storeTokens, type OAuthProvider } from '../_shared/oauth.ts'
import { getProfile as googleProfile } from '../_shared/providers/google.ts'
import { getProfile as microsoftProfile } from '../_shared/providers/microsoft.ts'

/**
 * The read scope group each account kind implies. The inverse of the table in
 * `oauth-start`, which is where the same groups are turned into a consent
 * screen. The two functions are separate deployment units and cannot share a
 * module outside `_shared`, so changing one means changing the other.
 */
const READ_SCOPE_GROUP: Record<AccountKind, ScopeGroup> = {
  mail: 'mailRead',
  calendar: 'calendarRead',
  tasks: 'tasksRead',
  contacts: 'contactsRead',
}

interface ExistingAccount {
  id: string
  external_account_id: string
  granted_scopes: string[]
  kinds: AccountKind[]
  is_primary: boolean
}

/**
 * Compare two scope strings by their last path segment.
 *
 * Microsoft asks for `Mail.Read` and grants back
 * `https://graph.microsoft.com/Mail.Read`; Google is consistent but uses full
 * URLs throughout. Comparing the tails is what makes one table work for both.
 */
function scopeKey(scope: string): string {
  return (scope.split('/').at(-1) ?? scope).toLowerCase()
}

/**
 * What the account can actually serve, read off what the provider granted.
 *
 * Not what the client asked for: a Google consent screen lets the user
 * un-tick individual permissions, and an account listed as a mailbox whose
 * mail scope was declined would fail on every sync instead of on this screen.
 */
function kindsFrom(provider: OAuthProvider, grantedScopes: readonly string[]): AccountKind[] {
  const granted = new Set(grantedScopes.map(scopeKey))
  return accountKind.options.filter((kind) =>
    scopesFor(provider, [READ_SCOPE_GROUP[kind]]).some((scope) => granted.has(scopeKey(scope))),
  )
}

/**
 * The provider's own identifier for the account, from the `sub` claim.
 *
 * The token came back over TLS from a direct call to the provider's token
 * endpoint, so the signature adds nothing here — OIDC Core §3.1.3.7 says as
 * much — and no claim other than the subject is trusted. Identifying the
 * account by subject rather than by address is what lets someone rename their
 * mailbox without the reconnect stacking a second row.
 */
function subjectFromIdToken(idToken: string | null): string | null {
  if (!idToken) return null
  const segment = idToken.split('.')[1]
  if (!segment) return null

  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const claims = JSON.parse(atob(padded)) as { sub?: unknown }
    return typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : null
  } catch {
    return null
  }
}

/**
 * Finish the browser round trip: turn an authorization code into a connection.
 *
 * This is the whole exchange, and it happens here rather than anywhere else —
 * the state is consumed exactly once, the code is swapped for tokens, the
 * refresh token is encrypted before it is stored, and the connected account is
 * written. Nothing sensitive goes back to the app: the response carries the
 * account row, which holds no credential.
 *
 * The client sends only what the redirect gave it. The provider, the user and
 * the account being widened all come from the stored state, so a caller
 * holding a stolen code cannot say whose account it belongs to.
 */
serveFunction('oauth-complete', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, oauthCompleteRequest)

  const state = await consumeState(body.state)
  if (state.userId !== user.id) {
    // The consent was started by somebody else. Binding it here would attach
    // their mailbox to this account.
    throw new AppError('forbidden', { detail: 'state_user_mismatch' })
  }

  const client = serviceClient()
  const provider = state.provider
  const tokens = await exchangeCode(provider, body.code)

  // Microsoft omits `scope` on some tenants; what we asked for is then the
  // closest thing we have to a record of what was granted.
  const grantedScopes = tokens.grantedScopes.length > 0 ? tokens.grantedScopes : state.scopes
  const profile =
    provider === 'google'
      ? await googleProfile(tokens.accessToken)
      : await microsoftProfile(tokens.accessToken)
  const email = profile.email.toLowerCase()
  const externalAccountId = subjectFromIdToken(tokens.idToken) ?? email

  // A step-up names its account; a fresh connect finds one only when the same
  // mailbox is being reconnected.
  const lookup = client
    .from('connected_accounts')
    .select('id, external_account_id, granted_scopes, kinds, is_primary')
    .eq('user_id', user.id)
  const found = await (
    state.connectedAccountId
      ? lookup.eq('id', state.connectedAccountId)
      : lookup.eq('provider', provider).eq('external_account_id', externalAccountId)
  ).maybeSingle()

  if (found.error) throw dbError(found.error)
  const existing = (found.data as ExistingAccount | null) ?? null

  if (existing && existing.external_account_id !== externalAccountId) {
    // The user signed into a different provider account than the one they
    // asked to re-authorise. Widening the first with the second's tokens would
    // silently swap which mailbox the app reads.
    throw new AppError('oauth_failed', { detail: 'account_mismatch' })
  }

  // A provider that merges previously granted scopes returns the full set; one
  // that does not returns only what this round asked for, so the union is what
  // the account actually holds.
  const mergedScopes = [...new Set([...(existing?.granted_scopes ?? []), ...grantedScopes])]
  const kinds = kindsFrom(provider, mergedScopes)

  if (kinds.length === 0) {
    // Every data permission was declined on the consent screen. Storing the
    // grant would produce an account that can never sync anything.
    throw new AppError('oauth_scope_missing', { detail: 'no_readable_scope_granted' })
  }

  if (!existing && kinds.includes('mail')) {
    // Counted from the database, never from the client, and counted the same
    // way the settings screen greys out its button so the two agree.
    const used = await client
      .from('connected_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .contains('kinds', ['mail'])

    if (used.error) throw dbError(used.error)
    const entitlements = await loadEntitlements(user.id, systemClock.now())
    requireWithinLimit(entitlements, 'mailAccounts', used.count ?? 0)
  }

  // The first account a user connects is the one every "which calendar?"
  // default resolves to. A later one must not demote it, and a reconnect must
  // not demote the account it is reconnecting.
  let isPrimary = existing?.is_primary ?? false
  if (!existing) {
    const total = await client
      .from('connected_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if (total.error) throw dbError(total.error)
    isPrimary = (total.count ?? 0) === 0
  }

  const saved = await client
    .from('connected_accounts')
    .upsert(
      {
        user_id: user.id,
        provider,
        external_account_id: externalAccountId,
        display_name: profile.name,
        email,
        status: 'connected',
        kinds,
        granted_scopes: mergedScopes,
        // The connection works again, so whatever last broke it no longer
        // describes it.
        last_error_code: null,
        last_error_at: null,
        is_primary: isPrimary,
      },
      { onConflict: 'user_id,provider,external_account_id' },
    )
    .select('*')
    .single()

  if (saved.error) throw dbError(saved.error)
  const account = saved.data as Record<string, unknown>
  const accountId = account['id'] as string

  // Only now, with a row to hang them on: the refresh token is encrypted here
  // and is never read again outside `_shared/oauth.ts`.
  await storeTokens({
    userId: user.id,
    connectedAccountId: accountId,
    tokens: { ...tokens, grantedScopes: mergedScopes },
  })

  await audit({
    userId: user.id,
    action: existing ? 'account.scope_granted' : 'account.connected',
    entityType: 'connected_account',
    entityId: accountId,
    metadata: { provider, kinds: kinds.join(','), scopes: mergedScopes.length },
  })

  const payload: OAuthCompleteResponse = { account }

  return jsonResponse(payload, 200, origin)
})
