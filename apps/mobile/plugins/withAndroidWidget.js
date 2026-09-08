const { withAndroidManifest, withStringsXml, AndroidConfig } = require('expo/config-plugins')

/**
 * Android home-screen widget.
 *
 * The provider, its layouts and the JS-facing module all live in the local
 * Expo module at `modules/da-native`, where they are real Kotlin and XML files
 * that the compiler and Android Studio can see. This plugin does the two things
 * a module cannot: declare the receiver in the application's merged manifest,
 * and hand the provider the deep-link scheme this particular build was
 * configured with.
 */

const PROVIDER = 'expo.modules.danative.DaWidgetProvider'
/** Kept in sync with `da_widget_strings.xml` in the local module. */
const SCHEME_RESOURCE = 'da_widget_scheme'

const withAndroidWidget = (config) => {
  const scheme = typeof config.scheme === 'string' ? config.scheme : 'dijitalasistan'

  // The application module's value wins over the library's default at resource
  // merge time, which is how `R.string.da_widget_scheme` resolves to the scheme
  // in app.config.ts rather than the one the module was written against.
  config = withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [
        AndroidConfig.Resources.buildResourceItem({
          name: SCHEME_RESOURCE,
          value: scheme,
          translatable: false,
        }),
      ],
      cfg.modResults,
    )
    return cfg
  })

  return withAndroidManifest(config, (cfg) => {
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
}

module.exports = withAndroidWidget
