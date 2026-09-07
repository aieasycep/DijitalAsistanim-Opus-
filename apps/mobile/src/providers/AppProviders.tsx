import { type ColorSchemePreference } from '@da/design-tokens'
import { type Locale, systemClock } from '@da/domain'
import { type ApiClient, createApiClient } from '@da/api-client'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { env } from '../lib/env'
import { initAnalytics } from '../lib/analytics'
import { initErrorReporting } from '../lib/error-reporting'
import { createQueryClient } from '../lib/query-client'
import { I18nProvider, type LanguagePreference } from '../i18n/I18nProvider'
import { ThemeProvider } from '../theme/ThemeProvider'
import { STORAGE_KEYS, initEncryptedCache, plainCache } from '../lib/secure-storage'
import { refreshSupabaseSession } from '../lib/auth'
import { setSessionRefresher, useSessionStore } from '../stores/session'

/**
 * The provider stack, assembled once at the root.
 *
 * Order matters: gesture handler and safe area must wrap everything visual;
 * theme and i18n must be outside the router so a preference change re-renders
 * every screen; the API client depends on the session store for its token, so
 * it is created after hydration rather than at module scope.
 */

const ApiContext = createContext<ApiClient | null>(null)

export function useApi(): ApiClient {
  const client = useContext(ApiContext)
  if (!client) throw new Error('useApi must be used inside <AppProviders>')
  return client
}

function readStoredPreference<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const stored = plainCache.getString(key)
  return stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback
}

export interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  const [ready, setReady] = useState(false)
  const queryClient = useMemo(() => createQueryClient(), [])
  const hydrate = useSessionStore((s) => s.hydrate)
  const getAccessToken = useSessionStore((s) => s.getAccessToken)
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    void (async () => {
      // The encrypted cache has to exist before anything reads a cached value,
      // and analytics/error reporting before anything can fail interestingly.
      initErrorReporting()
      initAnalytics()
      // The store refreshes tokens but must not depend on the auth module, so
      // the implementation is injected here, once, before hydration runs.
      setSessionRefresher(refreshSupabaseSession)
      await initEncryptedCache()
      await hydrate()
      setReady(true)
    })()
  }, [hydrate])

  const api = useMemo<ApiClient>(
    () =>
      createApiClient({
        supabaseUrl: env.supabaseUrl,
        supabaseAnonKey: env.supabaseAnonKey,
        getAccessToken,
        clock: systemClock,
        mode: env.demoMode || !env.supabaseUrl ? 'demo' : 'live',
      }),
    [getAccessToken],
  )

  const initialColorScheme = readStoredPreference<ColorSchemePreference>(
    STORAGE_KEYS.colorScheme,
    ['system', 'light', 'dark'],
    'system',
  )
  const initialLanguage = readStoredPreference<LanguagePreference>(
    STORAGE_KEYS.language,
    ['system', 'tr', 'en'] as const satisfies readonly (Locale | 'system')[],
    'system',
  )

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider
          initialPreference={initialColorScheme}
          initialReduceMotion={plainCache.getBoolean(STORAGE_KEYS.reduceMotion) ?? false}
          onPreferenceChange={(next) => plainCache.set(STORAGE_KEYS.colorScheme, next)}
          onReduceMotionChange={(next) => plainCache.set(STORAGE_KEYS.reduceMotion, next)}
        >
          <I18nProvider
            initialPreference={initialLanguage}
            onPreferenceChange={(next) => plainCache.set(STORAGE_KEYS.language, next)}
          >
            <QueryClientProvider client={queryClient}>
              <ApiContext.Provider value={api}>{ready ? children : null}</ApiContext.Provider>
            </QueryClientProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
