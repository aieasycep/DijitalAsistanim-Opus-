import { AppError, systemClock } from '@da/domain'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as AuthSession from 'expo-auth-session'
import * as Crypto from 'expo-crypto'
import { useCallback, useState } from 'react'
import { Platform } from 'react-native'
import { createDemoSession, isDemoAuth, signInWithIdToken } from '../lib/auth'
import { env, integrations } from '../lib/env'
import { useApi } from '../providers/AppProviders'
import { useSessionStore, type StoredSession } from '../stores/session'

/**
 * Sign-in.
 *
 * Three doors, one destination: whichever provider proves the identity, the app
 * ends up holding a Supabase session and nothing else. No provider token is
 * stored, and mail/calendar access is a separate, later consent — signing in
 * does not read anyone's mailbox.
 */

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
}

function googleClientId(): string | undefined {
  if (Platform.OS === 'ios') return env.googleIosClientId ?? env.googleWebClientId
  if (Platform.OS === 'android') return env.googleAndroidClientId ?? env.googleWebClientId
  return env.googleWebClientId
}

/** A fresh nonce per attempt; replaying one is exactly what it prevents. */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(24)
  const raw = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw)
  return { raw, hashed }
}

export interface SignInController {
  /** Whether each provider is configured in this build. */
  providers: { google: boolean; apple: boolean; demo: boolean }
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  signInWithDemo: () => Promise<void>
  isPending: boolean
  error: unknown
  clearError: () => void
}

export function useSignIn(): SignInController {
  const api = useApi()
  const setSession = useSessionStore((s) => s.setSession)
  const [isPending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const clientId = googleClientId()
  const redirectUri = AuthSession.makeRedirectUri({ scheme: env.scheme, path: 'auth' })

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId ?? 'unconfigured',
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      // Identity only. Mail and calendar scopes are requested later, per
      // account, with their own explanation screen.
      scopes: ['openid', 'profile', 'email'],
      usePKCE: false,
    },
    GOOGLE_DISCOVERY,
  )

  /** Load the profile the backend created for this identity, if it exists. */
  const finish = useCallback(
    async (session: StoredSession) => {
      await setSession(session, null)
      try {
        const profile = await api.settings.profile()
        if (profile) useSessionStore.getState().setProfile(profile)
      } catch {
        // A profile that cannot be read right now is fetched again by the first
        // screen that needs it; the session itself is valid either way.
      }
    },
    [api, setSession],
  )

  const run = useCallback(async (work: () => Promise<void>) => {
    setPending(true)
    setError(null)
    try {
      await work()
    } catch (caught) {
      setError(caught)
    } finally {
      setPending(false)
    }
  }, [])

  const signInWithGoogle = useCallback(
    () =>
      run(async () => {
        if (!clientId || !request) {
          throw new AppError('oauth_failed', { detail: 'google client id is not configured' })
        }
        const { raw } = await makeNonce()
        const result = await promptAsync()
        if (result.type === 'cancel' || result.type === 'dismiss') {
          throw new AppError('oauth_denied', { detail: 'user cancelled google sign-in' })
        }
        if (result.type !== 'success') {
          throw new AppError('oauth_failed', { detail: `google sign-in failed: ${result.type}` })
        }
        const idToken = result.params['id_token']
        if (!idToken) throw new AppError('oauth_failed', { detail: 'no id_token in response' })

        const session = await signInWithIdToken({ provider: 'google', idToken, nonce: raw })
        await finish(session)
      }),
    [run, clientId, request, promptAsync, finish],
  )

  const signInWithApple = useCallback(
    () =>
      run(async () => {
        const { raw, hashed } = await makeNonce()
        let credential: AppleAuthentication.AppleAuthenticationCredential
        try {
          credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
            // Apple signs the hashed nonce; Supabase re-derives it from the raw
            // one we send alongside the token.
            nonce: hashed,
          })
        } catch (caught) {
          const code = (caught as { code?: string }).code
          if (code === 'ERR_REQUEST_CANCELED') {
            throw new AppError('oauth_denied', { detail: 'user cancelled apple sign-in' })
          }
          throw new AppError('oauth_failed', {
            detail: caught instanceof Error ? caught.message : 'apple sign-in failed',
          })
        }

        if (!credential.identityToken) {
          throw new AppError('oauth_failed', { detail: 'no identity token from apple' })
        }
        const session = await signInWithIdToken({
          provider: 'apple',
          idToken: credential.identityToken,
          nonce: raw,
        })
        await finish(session)
      }),
    [run, finish],
  )

  const signInWithDemo = useCallback(
    () =>
      run(async () => {
        const { session, profile } = createDemoSession()
        await setSession(session, profile)
      }),
    [run, setSession],
  )

  return {
    providers: {
      google: integrations.google || Boolean(clientId),
      // The button is only offered where the API exists; Android has no Apple
      // sign-in, and showing it there would be a button that cannot work.
      apple: Platform.OS === 'ios',
      demo: isDemoAuth(),
    },
    signInWithGoogle,
    signInWithApple,
    signInWithDemo,
    isPending,
    error,
    clearError: useCallback(() => setError(null), []),
  }
}

/** Seconds remaining before an emailed code may be requested again. */
export const RESEND_COOLDOWN_SECONDS = 45

export function secondsUntil(target: Date | null): number {
  if (!target) return 0
  return Math.max(0, Math.ceil((target.getTime() - systemClock.now().getTime()) / 1000))
}
