import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { Stack, useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { useCallback, useEffect } from 'react'
import { AppProviders } from '../src/providers/AppProviders'
import { useTheme } from '../src/theme/ThemeProvider'
import { FONT_ASSETS, setFontsLoaded } from '../src/theme/fonts'
import { parseDeepLink, targetToRoute } from '../src/lib/deep-links'
import { useSessionStore } from '../src/stores/session'
import { ErrorBoundary as AppErrorBoundary } from '../src/components/ErrorBoundary'

// Keep the native splash up until fonts have settled, so the first frame is
// already using the real type rather than flashing a system fallback.
void SplashScreen.preventAutoHideAsync()

/** Expo Router renders this for an uncaught error in any route. */
export { AppErrorBoundary as ErrorBoundary }

function RootNavigator() {
  const theme = useTheme()
  const router = useRouter()
  const status = useSessionStore((s) => s.status)
  const onboardingCompleted = useSessionStore((s) => s.onboardingCompleted)

  const handleUrl = useCallback(
    (url: string) => {
      const target = parseDeepLink(url)
      // A deep link into the app while signed out would land on a screen with no
      // data, so it is dropped and the auth flow runs instead.
      if (!target || status !== 'signed_in' || !onboardingCompleted) return
      router.push(targetToRoute(target))
    },
    [router, status, onboardingCompleted],
  )

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url)
    })
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url))
    return () => subscription.remove()
  }, [handleUrl])

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Protected guard={status === 'signed_in' && onboardingCompleted}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'signed_in' && !onboardingCompleted}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'signed_out'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      {/* Modals and detail routes, reachable once signed in. */}
      <Stack.Screen name="briefing" options={{ animation: 'fade_from_bottom' }} />
      <Stack.Screen name="thread" />
      <Stack.Screen name="event" />
      <Stack.Screen name="meeting" />
      <Stack.Screen name="person" />
      <Stack.Screen name="life" />
      <Stack.Screen name="commitment" />
      <Stack.Screen name="approvals" />
      <Stack.Screen name="approval" />
      <Stack.Screen name="followups" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="capture" options={{ presentation: 'modal' }} />
      <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      <Stack.Screen name="referral" options={{ presentation: 'modal' }} />
      <Stack.Screen name="search" options={{ presentation: 'modal', animation: 'fade' }} />
      <Stack.Screen name="voice" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS)

  useEffect(() => {
    // A font failure is not fatal — `resolveFont` falls back to the system face
    // — so the splash is dismissed either way rather than hanging forever.
    if (fontsLoaded || fontError) {
      setFontsLoaded(fontsLoaded && !fontError)
      void SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  )
}
