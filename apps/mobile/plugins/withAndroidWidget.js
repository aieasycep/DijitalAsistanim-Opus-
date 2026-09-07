const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins')

/**
 * Android home-screen widget.
 *
 * The provider, its layouts and the JS-facing module all live in the local
 * Expo module at `modules/da-native`, where they are real Kotlin and XML files
 * that the compiler and Android Studio can see. This plugin only does the one
 * thing a module cannot: declare the receiver in the application's merged
 * manifest.
 */

const PROVIDER = 'expo.modules.danative.DaWidgetProvider'

const withAndroidWidget = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults)
    app.receiver = app.receiver ?? []

    if (!app.receiver.some((receiver) => receiver.$?.['android:name'] === PROVIDER)) {
      app.receiver.push({
        // Not exported: only the system's AppWidgetManager needs to reach it,
        // and an exported receiver would let any app force a redraw.
        $: { 'android:name': PROVIDER, 'android:exported': 'false' },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/da_widget_info',
            },
          },
        ],
      })
    }

    return cfg
  })

module.exports = withAndroidWidget
