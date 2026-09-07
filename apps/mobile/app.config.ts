import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * Expo app configuration.
 *
 * Every identifier is environment-overridable so a fork, a staging build and a
 * store build can coexist without editing this file. The defaults are the real
 * production values, so a clone with no `.env` still produces a coherent app.
 */

const env = (key: string, fallback: string): string => process.env[key]?.trim() || fallback

const BUNDLE_ID = env('APP_BUNDLE_ID', 'com.dijitalasistan.app')
const ANDROID_PACKAGE = env('APP_ANDROID_PACKAGE', 'com.dijitalasistan.app')
const SCHEME = env('APP_SCHEME', 'dijitalasistan')
const APP_GROUP = env('APP_IOS_APP_GROUP', 'group.com.dijitalasistan.app')
const WEB_URL = env('EXPO_PUBLIC_WEB_URL', 'https://dijitalasistan.app')
const WEB_HOST = (() => {
  try {
    return new URL(WEB_URL).host
  } catch {
    return 'dijitalasistan.app'
  }
})()

const VERSION = env('APP_VERSION', '1.0.0')
const IOS_BUILD = env('APP_IOS_BUILD_NUMBER', '1')
const ANDROID_VERSION_CODE = Number(env('APP_ANDROID_VERSION_CODE', '1'))

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: env('APP_DISPLAY_NAME', 'Dijital Asistan'),
  slug: 'dijital-asistan',
  version: VERSION,
  orientation: 'portrait',
  scheme: SCHEME,
  userInterfaceStyle: 'automatic',
  // The warm neutral background, so the gap before first paint matches the app.
  backgroundColor: '#F5F4F0',
  icon: './assets/icon.png',

  assetBundlePatterns: ['**/*'],

  ios: {
    bundleIdentifier: BUNDLE_ID,
    buildNumber: IOS_BUILD,
    supportsTablet: false,
    // Universal links, so a push or a referral link opens the app rather than Safari.
    associatedDomains: [`applinks:${WEB_HOST}`],
    entitlements: {
      'com.apple.security.application-groups': [APP_GROUP],
    },
    infoPlist: {
      CFBundleAllowMixedLocalizations: true,
      // Read by the local native module so the app, the widget and the share
      // extension all agree on one App Group without hard-coding it in Swift.
      DAAppGroup: APP_GROUP,
      UIBackgroundModes: ['remote-notification', 'audio'],
      // Every string is user-facing at the permission prompt and must say what
      // the app actually does with the data, in Turkish.
      NSCalendarsUsageDescription:
        'Toplantılarını görebilmek ve gününü planlayabilmek için takvimine erişmesi gerekiyor.',
      NSCalendarsFullAccessUsageDescription:
        'Toplantılarını görebilmek ve onayınla etkinlik oluşturabilmek için takvimine erişmesi gerekiyor.',
      NSRemindersUsageDescription:
        'Hatırlatıcılarını tek yerde toplayabilmek için Anımsatıcılar’a erişmesi gerekiyor.',
      NSRemindersFullAccessUsageDescription:
        'Hatırlatıcılarını tek yerde toplayabilmek için Anımsatıcılar’a erişmesi gerekiyor.',
      NSCameraUsageDescription:
        'Bir belgeyi ya da ekranı yakalayıp içindekileri çıkarabilmek için kameraya erişmesi gerekiyor.',
      NSPhotoLibraryUsageDescription:
        'Seçtiğin ekran görüntüsünü analiz edebilmek için fotoğraflarına erişmesi gerekiyor.',
      NSMicrophoneUsageDescription:
        'Sesli soru sorabilmen için mikrofona erişmesi gerekiyor. Ses kaydı cihazında kalır.',
      NSContactsUsageDescription:
        'Kişileri isimleriyle eşleştirebilmek için rehberine erişmesi gerekiyor. Bu izin isteğe bağlıdır.',
      NSUserTrackingUsageDescription:
        'Bu uygulama seni takip etmez ve verilerini reklamverenlerle paylaşmaz.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: ANDROID_PACKAGE,
    versionCode: ANDROID_VERSION_CODE,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/monochrome-icon.png',
      backgroundColor: '#5B5CE2',
    },
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.READ_CALENDAR',
      'android.permission.WRITE_CALENDAR',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_CONTACTS',
      'android.permission.VIBRATE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        // The two path prefixes the app can actually handle. Claiming the
        // legal or support pages would open the app when someone taps a link
        // to them in a browser, which is not what they asked for.
        data: [
          { scheme: 'https', host: WEB_HOST, pathPrefix: '/l' },
          { scheme: 'https', host: WEB_HOST, pathPrefix: '/davet' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
      // Share-sheet targets: text, links, images and documents shared from any
      // other app land in Universal Capture.
      {
        action: 'SEND',
        data: [
          { mimeType: 'text/plain' },
          { mimeType: 'image/*' },
          { mimeType: 'application/pdf' },
        ],
        category: ['DEFAULT'],
      },
      {
        action: 'SEND_MULTIPLE',
        data: [{ mimeType: 'image/*' }, { mimeType: 'application/pdf' }],
        category: ['DEFAULT'],
      },
    ],
  },

  web: {
    bundler: 'metro',
    output: 'single',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    'expo-apple-authentication',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        backgroundColor: '#F5F4F0',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#141311' },
        imageWidth: 180,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#5B5CE2',
      },
    ],
    [
      'expo-calendar',
      {
        calendarPermission:
          'Toplantılarını görebilmek ve gününü planlayabilmek için takvimine erişmesi gerekiyor.',
        remindersPermission: 'Hatırlatıcılarını tek yerde toplayabilmek için erişmesi gerekiyor.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Seçtiğin ekran görüntüsünü analiz edebilmek için erişmesi gerekiyor.',
        cameraPermission:
          'Bir belgeyi yakalayıp içindekileri çıkarabilmek için erişmesi gerekiyor.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission:
          'Sesli soru sorabilmen için mikrofona erişmesi gerekiyor. Ses kaydı cihazında kalır.',
      },
    ],
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/Geist-Regular.ttf',
          './assets/fonts/Geist-Medium.ttf',
          './assets/fonts/Geist-SemiBold.ttf',
          './assets/fonts/Lora-Regular.ttf',
          './assets/fonts/Lora-Medium.ttf',
        ],
      },
    ],
    // Local config plugins that generate the native pieces Expo has no module
    // for: the iOS share extension + widget, and the Android notification
    // listener service + app widget.
    './plugins/withIosShareExtension',
    './plugins/withIosWidget',
    './plugins/withAndroidNotificationListener',
    './plugins/withAndroidWidget',
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.0' },
        android: { minSdkVersion: 26, compileSdkVersion: 36, targetSdkVersion: 36 },
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    router: {},
    eas: {
      projectId: env('EAS_PROJECT_ID', '00000000-0000-0000-0000-000000000000'),
    },
    // Values the JS bundle is allowed to see. Nothing secret goes here: server
    // credentials live in Supabase function secrets, never in the app binary.
    appGroup: APP_GROUP,
    webUrl: WEB_URL,
    scheme: SCHEME,
    bundleId: BUNDLE_ID,
    androidPackage: ANDROID_PACKAGE,
  },

  updates: {
    fallbackToCacheTimeout: 0,
  },

  runtimeVersion: { policy: 'appVersion' },
})
