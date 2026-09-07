import {
  AppError,
  GOOGLE_AUTH_PARAMS,
  MICROSOFT_AUTH_PARAMS,
  OAUTH_ENDPOINTS,
  type Provider,
  type ScopeGroup,
  initialScopes,
  scopesFor,
} from './domain.ts'
import { bytesToHex, decryptSecret, encryptSecret, hexToBytes, randomToken } from './crypto.ts'
import { dbError, serviceClient } from './db.ts'
import { fetchWithLimits } from './http.ts'

/**
 * OAuth token lifecycle.
 *
 * Refresh tokens are written encrypted and read back only here. Nothing above
 * this module ever sees one: callers ask for a usable *access* token and get a
 * short-lived string, so a bug in a sync function cannot leak long-lived
 * credentials.
 */

export type OAuthProvider = Extract<Provider, 'google' | 'microsoft'>

interface ProviderConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  authorizeUrl: string
  tokenUrl: string
  revokeUrl: string | null
}

export function providerConfig(provider: OAuthProvider): ProviderConfig {
  const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT'
  const clientId = Deno.env.get(`${prefix}_CLIENT_ID`)
  const clientSecret = Deno.env.get(`${prefix}_CLIENT_SECRET`)
  const redirectUri = Deno.env.get(`${prefix}_REDIRECT_URI`)

  if (!clientId || !clientSecret || !redirectUri) {
    // A clear, actionable failure: this is the single most common setup gap.
    throw new AppError('oauth_failed', {
      detail: `missing_oauth_config:${provider}`,
      status: 503,
    })
  }

  const endpoints = OAUTH_ENDPOINTS[provider]
  const tenant = provider === 'microsoft' ? (Deno.env.get('MICROSOFT_TENANT') ?? 'common') : null

  return {
    clientId,
    clientSecret,
    redirectUri,
    authorizeUrl: tenant
      ? endpoints.authorize.replace('/common/', `/${tenant}/`)
      : endpoints.authorize,
    tokenUrl: tenant ? endpoints.token.replace('/common/', `/${tenant}/`) : endpoints.token,
    revokeUrl: endpoints.revoke,
  }
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  try {
    providerConfig(provider)
    return true
  } catch {
    return false
  }
}

// ── Authorization URL ────────────────────────────────────────────────────────

export interface AuthorizeRequest {
  provider: OAuthProvider
  userId: string
  /** Extra groups beyond the read-only defaults, for progressive consent. */
  additionalScopeGroups: ScopeGroup[]
  /** Where the app should return to after the browser round trip. */
  redirectTo: string
  /** Existing account being re-authorised, when stepping up scopes. */
  connectedAccountId: string | null
}

export interface AuthorizeResult {
  authorizeUrl: string
  state: string
}

/**
 * Build the authorize URL and persist the CSRF state.
 *
 * `state` is stored server-side rather than signed into the URL so the
 * callback can bind the response to a specific user and set of scopes — a
 * signed-but-unstored state can be replayed against a different account.
 */
export async function buildAuthorizeUrl(request: AuthorizeRequest): Promise<AuthorizeResult> {
  const config = providerConfig(request.provider)
  const state = randomToken(32)

  const scopes =
    request.additionalScopeGroups.length > 0
      ? scopesFor(request.provider, ['identity', ...request.additionalScopeGroups])
      : initialScopes(request.provider)

  const { error } = await serviceClient()
    .from('oauth_states')
    .insert({
      state,
      user_id: request.userId,
      provider: request.provider,
      scopes,
      redirect_to: request.redirectTo,
      connected_account_id: request.connectedAccountId,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
  if (error) throw dbError(error)

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    ...(request.provider === 'google' ? GOOGLE_AUTH_PARAMS : MICROSOFT_AUTH_PARAMS),
  })

  return { authorizeUrl: `${config.authorizeUrl}?${params.toString()}`, state }
}

export interface ConsumedState {
  userId: string
  provider: OAuthProvider
  scopes: string[]
  redirectTo: string
  connectedAccountId: string | null
}

/** Consume a state exactly once; a replayed state is rejected. */
export async function consumeState(state: string): Promise<ConsumedState> {
  const client = serviceClient()
  const { data, error } = await client
    .from('oauth_states')
    .delete()
    .eq('state', state)
    .select('user_id, provider, scopes, redirect_to, connected_account_id, expires_at')
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) throw new AppError('oauth_failed', { detail: 'unknown_state' })
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    throw new AppError('oauth_failed', { detail: 'state_expired' })
  }

  return {
    userId: data.user_id as string,
    provider: data.provider as OAuthProvider,
    scopes: (data.scopes as string[] | null) ?? [],
    redirectTo: (data.redirect_to as string | null) ?? '',
    connectedAccountId: (data.connected_account_id as string | null) ?? null,
  }
}

// ── Token exchange ───────────────────────────────────────────────────────────

export interface TokenSet {
  accessToken: string
  refreshToken: string | null
  expiresInSeconds: number
  grantedScopes: string[]
  idToken: string | null
}

async function postToken(provider: OAuthProvider, body: Record<string, string>): Promise<TokenSet> {
  const config = providerConfig(provider)
  const { response, body: text } = await fetchWithLimits(
    config.tokenUrl,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...body,
      }).toString(),
    },
    { timeoutMs: 20_000, errorCode: 'oauth_failed' },
  )

  if (!response.ok) {
    // A 400 with `invalid_grant` is the specific, recoverable case where the
    // user revoked access from the provider's own settings — the UI has a
    // "reconnect" path for it, so it gets its own code.
    const isInvalidGrant = text.includes('invalid_grant')
    throw new AppError(isInvalidGrant ? 'oauth_revoked' : 'oauth_failed', {
      detail: `token_endpoint_${response.status}`,
    })
  }

  const parsed = JSON.parse(text) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    id_token?: string
  }

  if (!parsed.access_token) {
    throw new AppError('oauth_failed', { detail: 'no_access_token' })
  }

  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresInSeconds: parsed.expires_in ?? 3600,
    grantedScopes: parsed.scope ? parsed.scope.split(' ').filter(Boolean) : [],
    idToken: parsed.id_token ?? null,
  }
}

export function exchangeCode(provider: OAuthProvider, code: string): Promise<TokenSet> {
  const config = providerConfig(provider)
  return postToken(provider, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  })
}

// ── Storage ──────────────────────────────────────────────────────────────────

export interface StoreTokensInput {
  userId: string
  connectedAccountId: string
  tokens: TokenSet
}

/**
 * Persist a token set.
 *
 * A refresh rotation that returns no new refresh token (Microsoft sometimes
 * does not) must not wipe the stored one, so the column is only written when a
 * value is actually present.
 */
export async function storeTokens(input: StoreTokensInput): Promise<void> {
  const client = serviceClient()
  const accessBlob = await encryptSecret(input.tokens.accessToken)

  const row: Record<string, unknown> = {
    connected_account_id: input.connectedAccountId,
    user_id: input.userId,
    encrypted_access_token: bytesToHex(accessBlob.ciphertext),
    nonce: bytesToHex(accessBlob.nonce),
    key_version: accessBlob.keyVersion,
    access_token_expires_at: new Date(
      Date.now() + input.tokens.expiresInSeconds * 1000,
    ).toISOString(),
    granted_scopes: input.tokens.grantedScopes,
    rotated_at: new Date().toISOString(),
  }

  if (input.tokens.refreshToken) {
    const refreshBlob = await encryptSecret(input.tokens.refreshToken)
    row.encrypted_refresh_token = bytesToHex(refreshBlob.ciphertext)
    // A distinct nonce: reusing one across two ciphertexts under the same key
    // breaks AES-GCM's security guarantee.
    row.refresh_nonce = bytesToHex(refreshBlob.nonce)
  }

  const { error } = await client
    .from('oauth_credentials')
    .upsert(row, { onConflict: 'connected_account_id' })
  if (error) throw dbError(error)
}

interface StoredCredentials {
  accessTokenCiphertext: string | null
  refreshTokenCiphertext: string | null
  nonce: string
  refreshNonce: string | null
  keyVersion: number
  accessTokenExpiresAt: string | null
  grantedScopes: string[]
}

async function loadCredentials(connectedAccountId: string): Promise<StoredCredentials> {
  const { data, error } = await serviceClient()
    .from('oauth_credentials')
    .select(
      'encrypted_access_token, encrypted_refresh_token, nonce, refresh_nonce, key_version, access_token_expires_at, granted_scopes',
    )
    .eq('connected_account_id', connectedAccountId)
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) throw new AppError('oauth_expired', { detail: 'no_credentials' })

  return {
    accessTokenCiphertext: (data.encrypted_access_token as string | null) ?? null,
    refreshTokenCiphertext: (data.encrypted_refresh_token as string | null) ?? null,
    nonce: data.nonce as string,
    refreshNonce: (data.refresh_nonce as string | null) ?? null,
    keyVersion: (data.key_version as number | null) ?? 1,
    accessTokenExpiresAt: (data.access_token_expires_at as string | null) ?? null,
    grantedScopes: (data.granted_scopes as string[] | null) ?? [],
  }
}

/** Refresh a little early so a long-running sync does not expire mid-flight. */
const REFRESH_MARGIN_MS = 120_000

/**
 * Return a usable access token for an account, refreshing when needed.
 *
 * This is the only function above the crypto layer that touches a refresh
 * token, and it never returns one.
 */
export async function getAccessToken(
  provider: OAuthProvider,
  connectedAccountId: string,
  userId: string,
): Promise<string> {
  const stored = await loadCredentials(connectedAccountId)

  const expiresAt = stored.accessTokenExpiresAt
    ? new Date(stored.accessTokenExpiresAt).getTime()
    : 0
  const stillValid = expiresAt - REFRESH_MARGIN_MS > Date.now()

  if (stillValid && stored.accessTokenCiphertext) {
    return decryptSecret({
      ciphertext: hexToBytes(stored.accessTokenCiphertext),
      nonce: hexToBytes(stored.nonce),
      keyVersion: stored.keyVersion,
    })
  }

  if (!stored.refreshTokenCiphertext || !stored.refreshNonce) {
    await markAccountStatus(connectedAccountId, 'expired', 'no_refresh_token')
    throw new AppError('oauth_expired', { detail: 'no_refresh_token' })
  }

  const refreshToken = await decryptSecret({
    ciphertext: hexToBytes(stored.refreshTokenCiphertext),
    nonce: hexToBytes(stored.refreshNonce),
    keyVersion: stored.keyVersion,
  })

  let tokens: TokenSet
  try {
    tokens = await postToken(provider, { grant_type: 'refresh_token', refresh_token: refreshToken })
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'oauth_failed'
    await markAccountStatus(
      connectedAccountId,
      code === 'oauth_revoked' ? 'revoked' : 'expired',
      code,
    )
    throw error
  }

  // A refresh that returns no new refresh token keeps the existing one.
  await storeTokens({
    userId,
    connectedAccountId,
    tokens: {
      ...tokens,
      grantedScopes: tokens.grantedScopes.length > 0 ? tokens.grantedScopes : stored.grantedScopes,
    },
  })
  await markAccountStatus(connectedAccountId, 'connected', null)

  return tokens.accessToken
}

export async function markAccountStatus(
  connectedAccountId: string,
  status: 'connected' | 'expired' | 'revoked' | 'error' | 'disconnected',
  errorCode: string | null,
): Promise<void> {
  await serviceClient()
    .from('connected_accounts')
    .update({
      status,
      last_error_code: errorCode,
      last_error_at: errorCode ? new Date().toISOString() : null,
    })
    .eq('id', connectedAccountId)
}

/**
 * Best-effort provider-side revocation.
 *
 * Google exposes a revoke endpoint; Microsoft does not, and pretending
 * otherwise would be worse than saying so. Either way the local credentials
 * are deleted, which is the part we control.
 */
export async function revokeAndDelete(
  provider: OAuthProvider,
  connectedAccountId: string,
): Promise<{ providerRevoked: boolean }> {
  let providerRevoked = false

  try {
    const config = providerConfig(provider)
    if (config.revokeUrl) {
      const stored = await loadCredentials(connectedAccountId)
      if (stored.refreshTokenCiphertext && stored.refreshNonce) {
        const refreshToken = await decryptSecret({
          ciphertext: hexToBytes(stored.refreshTokenCiphertext),
          nonce: hexToBytes(stored.refreshNonce),
          keyVersion: stored.keyVersion,
        })
        const { response } = await fetchWithLimits(
          config.revokeUrl,
          {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: refreshToken }).toString(),
          },
          { timeoutMs: 10_000, errorCode: 'provider_unavailable' },
        )
        providerRevoked = response.ok
      }
    }
  } catch {
    // Revocation is best-effort: the user asked to disconnect, and a provider
    // outage must not block deleting our own copy of their credentials.
  }

  await serviceClient()
    .from('oauth_credentials')
    .delete()
    .eq('connected_account_id', connectedAccountId)
  await markAccountStatus(connectedAccountId, 'disconnected', null)

  return { providerRevoked }
}
