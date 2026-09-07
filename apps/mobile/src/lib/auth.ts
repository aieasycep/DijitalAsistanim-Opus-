import { AppError, type Profile, systemClock } from '@da/domain'
import { env } from './env'
import type { StoredSession } from '../stores/session'

/**
 * Authentication against Supabase GoTrue.
 *
 * Written against the REST endpoints rather than `supabase-js`'s auth client
 * because the app owns session storage: tokens go to the Keychain, and the
 * store decides when to refresh. Letting two things own the session is how a
 * refresh token gets spent twice and the user is silently signed out.
 */

const GOTRUE_TIMEOUT_MS = 15_000

interface GoTrueSession {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at?: number
  user: { id: string; email?: string | null }
}

interface GoTrueError {
  error?: string
  error_description?: string
  msg?: string
  message?: string
}

function authUrl(path: string): string {
  return `${env.supabaseUrl.replace(/\/+$/, '')}/auth/v1${path}`
}

/** True when the app has no backend configured, so auth is simulated locally. */
export function isDemoAuth(): boolean {
  return env.supabaseUrl === '' || env.supabaseAnonKey === '' || env.demoMode
}

async function postAuth<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (env.supabaseUrl === '' || env.supabaseAnonKey === '') {
    throw new AppError('server_unavailable', {
      detail: 'supabase url or anon key is not configured',
    })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GOTRUE_TIMEOUT_MS)

  try {
    const response = await fetch(authUrl(path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.supabaseAnonKey,
        authorization: `Bearer ${env.supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await response.text()
    const parsed: unknown = text ? JSON.parse(text) : {}

    if (!response.ok) {
      const error = parsed as GoTrueError
      const detail = error.error_description ?? error.msg ?? error.message ?? error.error
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new AppError('unauthorized', { detail: detail ?? 'invalid credentials' })
      }
      if (response.status === 429) throw new AppError('rate_limited', { detail: detail ?? '' })
      throw new AppError('unknown', {
        detail: detail ?? `auth request failed (${response.status})`,
      })
    }

    return parsed as T
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('network_timeout', { detail: 'auth request timed out' })
    }
    throw new AppError('network_offline', {
      detail: error instanceof Error ? error.message : 'auth request failed',
    })
  } finally {
    clearTimeout(timer)
  }
}

function toStoredSession(session: GoTrueSession): StoredSession {
  const nowSeconds = Math.floor(systemClock.now().getTime() / 1000)
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? nowSeconds + session.expires_in,
    userId: session.user.id,
  }
}

/** Ask GoTrue to mail a six-digit code. No password is ever collected. */
export async function requestEmailCode(email: string): Promise<void> {
  await postAuth<Record<string, never>>('/otp', {
    email,
    create_user: true,
  })
}

export async function verifyEmailCode(email: string, token: string): Promise<StoredSession> {
  const session = await postAuth<GoTrueSession>('/verify', {
    type: 'email',
    email,
    token,
  })
  return toStoredSession(session)
}

/**
 * Exchange a provider identity token for a Supabase session.
 *
 * Used by Sign in with Apple and by Google one-tap: the provider proves who the
 * user is, the backend mints our own session. The provider token is not kept.
 */
export async function signInWithIdToken(input: {
  provider: 'google' | 'apple'
  idToken: string
  nonce?: string
}): Promise<StoredSession> {
  const session = await postAuth<GoTrueSession>('/token?grant_type=id_token', {
    provider: input.provider,
    id_token: input.idToken,
    ...(input.nonce ? { nonce: input.nonce } : {}),
  })
  return toStoredSession(session)
}

/** Exchange a refresh token for a new session. Called only by the store. */
export async function refreshSupabaseSession(refreshToken: string): Promise<StoredSession | null> {
  try {
    const session = await postAuth<GoTrueSession>('/token?grant_type=refresh_token', {
      refresh_token: refreshToken,
    })
    return toStoredSession(session)
  } catch {
    // A failed refresh means the session is gone; the caller signs out.
    return null
  }
}

/** Best-effort server-side revocation. Local state is cleared regardless. */
export async function revokeSession(accessToken: string): Promise<void> {
  if (env.supabaseUrl === '' || env.supabaseAnonKey === '') return
  try {
    await fetch(authUrl('/logout'), {
      method: 'POST',
      headers: {
        apikey: env.supabaseAnonKey,
        authorization: `Bearer ${accessToken}`,
      },
    })
  } catch {
    // Offline sign-out is still a sign-out.
  }
}

/**
 * The local session used when no backend is configured.
 *
 * Demo mode has to reach the signed-in state or none of the app is reachable,
 * so it mints a session that is obviously local: the id is fixed, the token is
 * not a JWT, and every request it would authorise is served from fixtures.
 */
export function createDemoSession(): { session: StoredSession; profile: Profile } {
  const now = systemClock.now()
  return {
    session: {
      accessToken: 'demo-access-token',
      refreshToken: 'demo-refresh-token',
      expiresAt: Math.floor(now.getTime() / 1000) + 60 * 60 * 24 * 365,
      userId: '00000000-0000-4000-8000-000000000001',
    },
    profile: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'demo@dijitalasistan.app',
      displayName: 'Demo Kullanıcı',
      givenName: 'Demo',
      avatarUrl: null,
      locale: 'tr',
      timeZone: 'Europe/Istanbul',
      onboardingCompletedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    },
  }
}
