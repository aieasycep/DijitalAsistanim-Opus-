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
   * Demo mode serves the whole app from deterministic local fixtures. It is on
   * by default only when no Supabase project is configured, so a fresh clone
   * runs end-to-end with no credentials — and it is forced off in a release
   * build so a shipped binary can never fall back to fake data.
   */
  demoMode:
    publicEnv('EXPO_PUBLIC_DEMO_MODE') === 'true' ||
    (!publicEnv('EXPO_PUBLIC_SUPABASE_URL') && __DEV__),
} as const

export type Env = typeof env

/** True when the app has enough configuration to talk to a real backend. */
export function hasBackendConfig(): boolean {
  return env.supabaseUrl !== '' && env.supabaseAnonKey !== ''
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
