import { qk, type ScopeGroup } from '@da/api-client'
import { AppError, type AccountKind, type ConnectedAccount, type Provider } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { useCallback } from 'react'
import { track } from '../lib/analytics'
import { env } from '../lib/env'
import { useApi } from '../providers/AppProviders'

/**
 * Connecting a mail/calendar account.
 *
 * The whole exchange is server-side: the app opens the provider's consent page,
 * receives a one-time code on the redirect, and hands it to an edge function
 * that swaps it for tokens. Neither the client secret nor the refresh token is
 * ever visible here — the refresh token is encrypted before it is stored and is
 * never returned to the app.
 */

/** The redirect the provider sends the user back to. Registered in app config. */
export function oauthRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: env.scheme, path: 'oauth' })
}

function codeFromRedirect(url: string): { code: string; state: string } {
  const parsed = new URL(url)
  // Providers may return the parameters in the query or the fragment.
  const params = parsed.search
    ? new URLSearchParams(parsed.search)
    : new URLSearchParams(parsed.hash.replace(/^#/, ''))

  const error = params.get('error')
  if (error) {
    if (error === 'access_denied') {
      throw new AppError('oauth_denied', { detail: 'consent was declined' })
    }
    throw new AppError('oauth_failed', { detail: error })
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) throw new AppError('oauth_failed', { detail: 'missing code or state' })
  return { code, state }
}

export interface ConnectAccountInput {
  provider: Provider
  kinds: AccountKind[]
  /** Extra permission groups to ask for in the same consent screen. */
  scopeGroups?: ScopeGroup[]
}

export interface ConnectAccountController {
  connect: (input: ConnectAccountInput) => Promise<ConnectedAccount>
  /** Ask an already-connected account for one more permission group. */
  requestScopes: (input: {
    connectedAccountId: string
    provider: Provider
    kinds: AccountKind[]
    scopeGroups: ScopeGroup[]
  }) => Promise<void>
  isConnecting: boolean
  error: unknown
  reset: () => void
}

export function useConnectAccount(): ConnectAccountController {
  const api = useApi()
  const queryClient = useQueryClient()

  const runConsent = useCallback(async (authorizeUrl: string): Promise<string> => {
    const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, oauthRedirectUri(), {
      // A shared cookie jar would silently reuse whichever account the system
      // browser is already signed into, which is the wrong one often enough to
      // be worth the extra tap.
      preferEphemeralSession: true,
    })
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new AppError('oauth_denied', { detail: 'user closed the consent screen' })
    }
    if (result.type !== 'success') {
      throw new AppError('oauth_failed', { detail: `consent failed: ${result.type}` })
    }
    return result.url
  }, [])

  const connectMutation = useMutation({
    mutationFn: async (input: ConnectAccountInput): Promise<ConnectedAccount> => {
      if (input.provider !== 'google' && input.provider !== 'microsoft') {
        throw new AppError('oauth_failed', { detail: `${input.provider} cannot be connected` })
      }
      const start = await api.accounts.startOAuth({
        provider: input.provider,
        kinds: input.kinds,
        additionalScopeGroups: input.scopeGroups ?? [],
        redirectTo: oauthRedirectUri(),
      })
      const redirect = await runConsent(start.authorizeUrl)
      const { code, state } = codeFromRedirect(redirect)
      if (state !== start.state) {
        // The state is minted and stored server-side; a mismatch means the
        // response did not come from the request we started.
        throw new AppError('oauth_failed', { detail: 'state mismatch' })
      }
      return api.accounts.completeOAuth({ code, state })
    },
    onSuccess: async (account) => {
      track('account_connected', { provider: account.provider })
      if (account.kinds.includes('calendar')) track('calendar_connected')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.accounts() }),
        queryClient.invalidateQueries({ queryKey: ['sync'] }),
      ])
    },
  })

  const scopesMutation = useMutation({
    mutationFn: async (input: {
      connectedAccountId: string
      provider: Provider
      kinds: AccountKind[]
      scopeGroups: ScopeGroup[]
    }): Promise<void> => {
      if (input.provider !== 'google' && input.provider !== 'microsoft') {
        throw new AppError('oauth_failed', { detail: `${input.provider} has no scopes to grant` })
      }
      const start = await api.accounts.requestScopes({
        connectedAccountId: input.connectedAccountId,
        provider: input.provider,
        kinds: input.kinds,
        scopeGroups: input.scopeGroups,
        redirectTo: oauthRedirectUri(),
      })
      const redirect = await runConsent(start.authorizeUrl)
      const { code, state } = codeFromRedirect(redirect)
      if (state !== start.state) throw new AppError('oauth_failed', { detail: 'state mismatch' })
      await api.accounts.completeOAuth({ code, state })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.accounts() })
    },
  })

  return {
    connect: connectMutation.mutateAsync,
    requestScopes: scopesMutation.mutateAsync,
    isConnecting: connectMutation.isPending || scopesMutation.isPending,
    error: connectMutation.error ?? scopesMutation.error,
    reset: () => {
      connectMutation.reset()
      scopesMutation.reset()
    },
  }
}
