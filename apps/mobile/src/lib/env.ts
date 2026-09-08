import Constants from 'expo-constants'

/**
 * Runtime configuration.
 *
 * Everything here is public by construction: it ships inside the app binary, so
 * nothing secret may appear. Provider API keys, the OAuth client secrets, the
 * encryption key and the AI keys all live in Supabase function secrets and are
 * only ever used server-side.
 */

function publicEnv(key: string): string | undefined {
  const value = process.env[key]
  return value && value.trim() !== '' ? value.trim() : undefined
}

function extra(key: string): string | undefined {
  const value = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

export const env = {
  supabaseUrl: publicEnv('EXPO_PUBLIC_SUPABASE_URL') ?? '',
  supabaseAnonKey: publicEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY') ?? '',

  webUrl: publicEnv('EXPO_PUBLIC_WEB_URL') ?? extra('webUrl') ?? 'https://dijitalasistan.app',
  scheme: extra('scheme') ?? 'dijitalasistan',
  appGroup: extra('appGroup') ?? 'group.com.dijitalasistan.app',
  bundleId: extra('bundleId') ?? 'com.dijitalasistan.app',

  revenueCatApiKeyIos: publicEnv('EXPO_PUBLIC_REVENUECAT_IOS_KEY'),
  revenueCatApiKeyAndroid: publicEnv('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY'),

  posthogKey: publicEnv('EXPO_PUBLIC_POSTHOG_KEY'),
  posthogHost: publicEnv('EXPO_PUBLIC_POSTHOG_HOST') ?? 'https://eu.i.posthog.com',

  sentryDsn: publicEnv('EXPO_PUBLIC_SENTRY_DSN'),

  googleIosClientId: publicEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
  googleAndroidClientId: publicEnv('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'),
  googleWebClientId: publicEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
  microsoftClientId: publicEnv('EXPO_PUBLIC_MICROSOFT_CLIENT_ID'),

  /**
   * Demo mode was asked for explicitly, or this is a development build with no
   * project configured.
   *
   * This is the *request*, not the answer. Ask `isDemoMode()` instead — an app
   * with no backend to talk to is serving fixtures whether or not anybody asked
   * it to, and reading this flag alone is how three parts of the app came to
   * disagree about which mode they were in.
   */
  demoModeRequested:
    publicEnv('EXPO_PUBLIC_DEMO_MODE') === 'true' ||
    (!publicEnv('EXPO_PUBLIC_SUPABASE_URL') && __DEV__),
} as const

export type Env = typeof env

/** True when the app has enough configuration to talk to a real backend. */
export function hasBackendConfig(): boolean {
  return env.supabaseUrl !== '' && env.supabaseAnonKey !== ''
}

/**
 * True when the app is serving itself from deterministic local fixtures.
 *
 * There is one answer to this question and every caller needs the same one.
 * There used to be three: the API client asked whether a Supabase URL existed,
 * auth asked whether a URL *and* a key existed, and purchases and the
 * diagnostics screen read `demoModeRequested` — which is false in any release
 * build, because it is guarded by `__DEV__`.
 *
 * A release APK built with no project configured therefore served fixtures for
 * every screen while reporting `mode: live` in the diagnostics a tester copies
 * into a bug report, and hid the purchase path on the grounds that this was a
 * real build. Three answers to one question is a bug in whichever two disagree
 * with what the app is actually doing, so there is now one.
 *
 * Note what this does NOT do: it does not stop a misconfigured production build
 * from falling back to fixtures. It never did — the `__DEV__` guard read as if
 * it prevented that, but the API client's own check meant fake data was served
 * regardless. The honest protection is that demo mode is visible on screen, not
 * that a flag quietly claims it cannot happen.
 */
export function isDemoMode(): boolean {
  return env.demoModeRequested || !hasBackendConfig()
}

/**
 * Which optional integrations are wired up. Screens use this to hide a path
 * that genuinely cannot work rather than showing a control that would fail.
 */
export const integrations = {
  revenueCat: Boolean(env.revenueCatApiKeyIos ?? env.revenueCatApiKeyAndroid),
  analytics: Boolean(env.posthogKey),
  errorReporting: Boolean(env.sentryDsn),
  google: Boolean(env.googleWebClientId),
  microsoft: Boolean(env.microsoftClientId),
} as const
