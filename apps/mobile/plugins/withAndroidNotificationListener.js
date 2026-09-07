const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins')

/**
 * Android Notification Intelligence.
 *
 * The service and its JS module live in the local Expo module at
 * `modules/da-native`; this plugin declares the pieces that only the
 * application's merged manifest can carry — the bound service, the package
 * visibility needed to build an allow-list, and nothing else.
 *
 * Android-only by construction: iOS gives no app access to other apps'
 * notification stream, and the product does not pretend otherwise (see
 * docs/KNOWN_PLATFORM_LIMITATIONS.md).
 */

const SERVICE = 'expo.modules.danative.DaNotificationListenerService'

const withAndroidNotificationListener = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults)
    app.service = app.service ?? []

    if (!app.service.some((service) => service.$?.['android:name'] === SERVICE)) {
      app.service.push({
        $: {
          'android:name': SERVICE,
          'android:label': 'Dijital Asistan',
          // Only the system may bind a notification listener.
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.service.notification.NotificationListenerService' } },
            ],
          },
        ],
      })
    }

    // Package visibility, so the allow-list picker can list launchable apps.
    // Without the <queries> block the picker would simply be empty on API 30+.
    cfg.modResults.manifest.queries = cfg.modResults.manifest.queries ?? [{}]
    const queries = cfg.modResults.manifest.queries[0]
    queries.intent = queries.intent ?? []
    if (queries.intent.length === 0) {
      queries.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
      })
    }

    return cfg
  })

module.exports = withAndroidNotificationListener
