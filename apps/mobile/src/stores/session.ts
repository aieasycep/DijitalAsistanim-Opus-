import { type Locale, type Profile, systemClock } from '@da/domain'
import { create } from 'zustand'
import { STORAGE_KEYS, secureStore, wipeLocalData } from '../lib/secure-storage'
import { setErrorUser } from '../lib/error-reporting'
import { analytics } from '../lib/analytics'

/**
 * Session state.
 *
 * Tokens live in the Keychain, never in this store's persisted snapshot and
 * never in AsyncStorage. The store holds only what the UI needs to render, so
 * a state dump in a debugger contains no credentials.
 */

export interface StoredSession {
  accessToken: string
  refreshToken: string
  /** Epoch seconds. */
  expiresAt: number
  userId: string
}

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in'

export interface SessionState {
  status: AuthStatus
  userId: string | null
  profile: Profile | null
  /** Set once the onboarding flow has been completed at least once. */
  onboardingCompleted: boolean
  locale: Locale

  hydrate: () => Promise<void>
  setSession: (session: StoredSession, profile: Profile | null) => Promise<void>
  setProfile: (profile: Profile) => void
  markOnboardingCompleted: () => void
  getAccessToken: () => Promise<string | null>
  signOut: () => Promise<void>
}

/** Refresh a little before expiry so a request never races the boundary. */
const REFRESH_MARGIN_SECONDS = 120

async function readStoredSession(): Promise<StoredSession | null> {
  const raw = await secureStore.get(STORAGE_KEYS.session)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (typeof parsed.accessToken !== 'string' || typeof parsed.userId !== 'string') return null
    return parsed
  } catch {
    await secureStore.remove(STORAGE_KEYS.session)
    return null
  }
}

/**
 * Refreshing is injected rather than imported so this store does not depend on
 * the API client, which in turn depends on the store for its token. The root
 * provider wires the two together at boot.
 */
type RefreshFn = (refreshToken: string) => Promise<StoredSession | null>
let refreshSession: RefreshFn = async () => null

export function setSessionRefresher(fn: RefreshFn): void {
  refreshSession = fn
}

let inFlightRefresh: Promise<string | null> | null = null

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'loading',
  userId: null,
  profile: null,
  onboardingCompleted: false,
  locale: 'tr',

  async hydrate() {
    const stored = await readStoredSession()
    if (!stored) {
      set({ status: 'signed_out', userId: null, profile: null })
      return
    }
    setErrorUser(stored.userId)
    analytics().identify(stored.userId)
    set({ status: 'signed_in', userId: stored.userId })
  },

  async setSession(session, profile) {
    await secureStore.set(STORAGE_KEYS.session, JSON.stringify(session))
    setErrorUser(session.userId)
    analytics().identify(session.userId)
    set({
      status: 'signed_in',
      userId: session.userId,
      profile,
      onboardingCompleted: Boolean(profile?.onboardingCompletedAt),
      locale: profile?.locale ?? 'tr',
    })
  },

  setProfile(profile) {
    set({
      profile,
      locale: profile.locale,
      onboardingCompleted: Boolean(profile.onboardingCompletedAt),
    })
  },

  markOnboardingCompleted() {
    set({ onboardingCompleted: true })
  },

  async getAccessToken() {
    const stored = await readStoredSession()
    if (!stored) return null

    const nowSeconds = Math.floor(systemClock.now().getTime() / 1000)
    if (stored.expiresAt - REFRESH_MARGIN_SECONDS > nowSeconds) return stored.accessToken

    // Collapse concurrent refreshes: several queries firing at once must not
    // each spend the single-use refresh token.
    inFlightRefresh ??= (async () => {
      try {
        const next = await refreshSession(stored.refreshToken)
        if (!next) {
          await get().signOut()
          return null
        }
        await secureStore.set(STORAGE_KEYS.session, JSON.stringify(next))
        return next.accessToken
      } catch {
        await get().signOut()
        return null
      } finally {
        inFlightRefresh = null
      }
    })()

    return inFlightRefresh
  },

  async signOut() {
    // Local data goes first: if the process is killed mid-sign-out the cache is
    // already gone, which is the safe direction to fail in.
    await wipeLocalData()
    await secureStore.remove(STORAGE_KEYS.session)
    setErrorUser(null)
    analytics().reset()
    set({
      status: 'signed_out',
      userId: null,
      profile: null,
      onboardingCompleted: false,
    })
  },
}))
