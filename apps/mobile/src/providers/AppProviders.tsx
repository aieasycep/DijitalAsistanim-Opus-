import { type ColorSchemePreference, spacing } from '@da/design-tokens'
import { type Locale, systemClock } from '@da/domain'
import { type ApiClient, createApiClient } from '@da/api-client'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Button } from '../components/ui/Button'
import { Screen } from '../components/ui/Screen'
import { Text } from '../components/ui/Text'
import { env, isDemoMode } from '../lib/env'
import { initAnalytics } from '../lib/analytics'
import { initErrorReporting, reportError } from '../lib/error-reporting'
import { createQueryClient } from '../lib/query-client'
import { I18nProvider, type LanguagePreference, useT } from '../i18n/I18nProvider'
import { ThemeProvider } from '../theme/ThemeProvider'
import { STORAGE_KEYS, initEncryptedCache, plainCache, wipeLocalData } from '../lib/secure-storage'
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

/**
 * Boot outcome.
 *
 * `starting` is the only state that renders nothing, and it is bounded by the
 * work below rather than by a promise nobody is watching.
 */
type BootPhase = 'starting' | 'ready' | 'failed'

interface BootRecoveryProps {
  onRetry: () => void
  onStartFresh: () => void
  busy: boolean
}

/**
 * What a user sees when the app cannot start.
 *
 * Boot reads the Keychain and opens an encrypted store, and both can fail for
 * reasons the user did nothing to cause — a restored backup whose keychain
 * entry did not come with it, a half-written cache file after a crash. The
 * failure used to leave the promise rejected and `ready` false forever, which
 * renders as a permanently blank app: no message, no way out, and nothing that
 * would tell a support conversation what happened.
 *
 * Two real ways forward: try again, for the transient case, and start fresh,
 * which wipes every local file and the cache key with it. Starting fresh costs
 * the sign-in — nothing else, because everything local is a cache of something
 * the server still holds.
 */
function BootRecovery({ onRetry, onStartFresh, busy }: BootRecoveryProps) {
  const t = useT()
  return (
    <Screen scroll={false} testID="boot-recovery">
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.sm }}>
        <Text variant="h2" center>
          {t('errors.boundary.title')}
        </Text>
        <Text variant="secondary" tone="secondary" center>
          {t('errors.unknown')}
        </Text>
        <Button
          label={t('common.action.retry')}
          onPress={onRetry}
          fullWidth
          loading={busy}
          testID="boot-retry"
        />
        <Text variant="micro" tone="tertiary" center style={{ marginTop: spacing.md }}>
          {t('settings.signOut.confirmBody')}
        </Text>
        <Button
          label={t('settings.signOut.confirm')}
          onPress={onStartFresh}
          variant="ghost"
          fullWidth
          disabled={busy}
          testID="boot-start-fresh"
        />
        <Text variant="micro" tone="tertiary" center>
          {t('errors.supportHint')}
        </Text>
      </View>
    </Screen>
  )
}

export interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  const [phase, setPhase] = useState<BootPhase>('starting')
  const [retrying, setRetrying] = useState(false)
  const queryClient = useMemo(() => createQueryClient(), [])
  const hydrate = useSessionStore((s) => s.hydrate)
  const getAccessToken = useSessionStore((s) => s.getAccessToken)
  const bootstrapped = useRef(false)

  const boot = useCallback(
    async (reset: boolean): Promise<void> => {
      try {
        // The encrypted cache has to exist before anything reads a cached value,
        // and analytics/error reporting before anything can fail interestingly.
        initErrorReporting()
        initAnalytics()
        // The store refreshes tokens but must not depend on the auth module, so
        // the implementation is injected here, once, before hydration runs.
        setSessionRefresher(refreshSupabaseSession)
        // Ordered so a corrupt cache is gone before anything tries to open it:
        // the wipe drops both stores and the Keychain key, and the next line
        // mints a new one.
        if (reset) await wipeLocalData()
        await initEncryptedCache()
        await hydrate()
        setPhase('ready')
      } catch (caught) {
        reportError(caught, { scope: 'boot', extra: { reset } })
        setPhase('failed')
      }
    },
    [hydrate],
  )

  const restart = useCallback(
    (reset: boolean) => {
      setRetrying(true)
      void boot(reset).finally(() => setRetrying(false))
    },
    [boot],
  )

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    void boot(false)
  }, [boot])

  const api = useMemo<ApiClient>(
    () =>
      createApiClient({
        supabaseUrl: env.supabaseUrl,
        supabaseAnonKey: env.supabaseAnonKey,
        getAccessToken,
        clock: systemClock,
        mode: isDemoMode() ? 'demo' : 'live',
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
              <ApiContext.Provider value={api}>
                {phase === 'ready' ? (
                  children
                ) : phase === 'failed' ? (
                  <BootRecovery
                    onRetry={() => restart(false)}
                    onStartFresh={() => restart(true)}
                    busy={retrying}
                  />
                ) : null}
              </ApiContext.Provider>
            </QueryClientProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
