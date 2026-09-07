const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require('expo/config-plugins')
const path = require('node:path')
const fs = require('node:fs')

/**
 * Android home-screen widget (2×2 and 4×2).
 *
 * Like the iOS widget, it renders from a snapshot the app writes into shared
 * preferences and never performs its own network I/O. Tapping any row opens
 * the app on the matching deep link.
 */

const PACKAGE_SUFFIX = 'widget'

const javaPath = (pkg) => pkg.split('.').join('/')

const PROVIDER_KT = (pkg) => `package ${pkg}.${PACKAGE_SUFFIX}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import ${pkg}.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * Renders the snapshot the app stores under `widgetSnapshot`.
 *
 * A missing or stale snapshot renders the localised empty label carried inside
 * the snapshot itself, so the widget never has to bundle its own strings and
 * cannot fall out of sync with the app's language setting.
 */
class DaWidgetProvider : AppWidgetProvider() {

    companion object {
        const val PREFS = "da_widget"
        const val KEY_SNAPSHOT = "widgetSnapshot"

        /** Called from JS after every refresh so the widget updates immediately. */
        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, DaWidgetProvider::class.java))
            if (ids.isNotEmpty()) {
                DaWidgetProvider().onUpdate(context, manager, ids)
            }
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val snapshot = readSnapshot(context)
        for (id in appWidgetIds) {
            val options = manager.getAppWidgetOptions(id)
            val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110)
            // A 4×2 cell is roughly 250dp wide; below that only one row fits.
            val wide = minWidth >= 200
            manager.updateAppWidget(id, buildViews(context, snapshot, wide))
        }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        manager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: android.os.Bundle,
    ) {
        val minWidth = newOptions.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110)
        manager.updateAppWidget(
            appWidgetId,
            buildViews(context, readSnapshot(context), minWidth >= 200),
        )
    }

    private fun readSnapshot(context: Context): JSONObject? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_SNAPSHOT, null) ?: return null
        return try { JSONObject(raw) } catch (e: Exception) { null }
    }

    private fun deepLinkIntent(context: Context, path: String): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("dijitalasistan://\$path")).apply {
            setPackage(context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            context,
            path.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun buildViews(context: Context, snapshot: JSONObject?, wide: Boolean): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.da_widget)

        val headline = snapshot?.optString("headline").orEmpty()
        val empty = snapshot?.optString("emptyLabel").orEmpty()
        views.setTextViewText(R.id.da_widget_headline, headline.ifBlank { "Dijital Asistan" })
        views.setOnClickPendingIntent(R.id.da_widget_root, deepLinkIntent(context, "today"))

        val items: JSONArray = snapshot?.optJSONArray("items") ?: JSONArray()
        val rowIds = listOf(R.id.da_widget_row_1, R.id.da_widget_row_2, R.id.da_widget_row_3)
        val textIds = listOf(R.id.da_widget_row_1_text, R.id.da_widget_row_2_text, R.id.da_widget_row_3_text)
        val visibleRows = if (wide) 3 else 1

        for (i in rowIds.indices) {
            val item = if (i < items.length()) items.optJSONObject(i) else null
            if (i < visibleRows && item != null) {
                views.setViewVisibility(rowIds[i], View.VISIBLE)
                views.setTextViewText(textIds[i], item.optString("title"))
                views.setOnClickPendingIntent(
                    rowIds[i],
                    deepLinkIntent(context, item.optString("path", "today")),
                )
            } else {
                views.setViewVisibility(rowIds[i], View.GONE)
            }
        }

        val isEmpty = items.length() == 0
        views.setViewVisibility(R.id.da_widget_empty, if (isEmpty) View.VISIBLE else View.GONE)
        if (isEmpty) views.setTextViewText(R.id.da_widget_empty, empty.ifBlank { "—" })

        return views
    }
}
`

const MODULE_KT = (pkg) => `package ${pkg}.${PACKAGE_SUFFIX}

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Lets JS publish a widget snapshot and force a redraw. */
class DaWidgetModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("DaWidget")

        Function("setSnapshot") { json: String ->
            val context = appContext.reactContext ?: return@Function false
            context.getSharedPreferences(DaWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(DaWidgetProvider.KEY_SNAPSHOT, json)
                .apply()
            DaWidgetProvider.refreshAll(context)
            true
        }

        Function("clearSnapshot") {
            val context = appContext.reactContext ?: return@Function false
            context.getSharedPreferences(DaWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(DaWidgetProvider.KEY_SNAPSHOT)
                .apply()
            DaWidgetProvider.refreshAll(context)
            true
        }
    }
}
`

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="110dp"
    android:minHeight="110dp"
    android:targetCellWidth="2"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:initialLayout="@layout/da_widget"
    android:previewLayout="@layout/da_widget"
    android:updatePeriodMillis="1800000"
    android:description="@string/da_widget_description" />
`

const WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/da_widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="14dp"
    android:background="@drawable/da_widget_background">

    <TextView
        android:id="@+id/da_widget_headline"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:textSize="13sp"
        android:textStyle="bold"
        android:maxLines="1"
        android:ellipsize="end"
        android:textColor="@color/da_widget_text" />

    <TextView
        android:id="@+id/da_widget_empty"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:textSize="12sp"
        android:visibility="gone"
        android:textColor="@color/da_widget_text_secondary" />

    <LinearLayout
        android:id="@+id/da_widget_row_1"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:orientation="horizontal">
        <TextView
            android:id="@+id/da_widget_row_1_text"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textSize="13sp"
            android:maxLines="2"
            android:ellipsize="end"
            android:textColor="@color/da_widget_text" />
    </LinearLayout>

    <LinearLayout
        android:id="@+id/da_widget_row_2"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="6dp"
        android:orientation="horizontal">
        <TextView
            android:id="@+id/da_widget_row_2_text"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textSize="13sp"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="@color/da_widget_text" />
    </LinearLayout>

    <LinearLayout
        android:id="@+id/da_widget_row_3"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="6dp"
        android:orientation="horizontal">
        <TextView
            android:id="@+id/da_widget_row_3_text"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textSize="13sp"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="@color/da_widget_text" />
    </LinearLayout>
</LinearLayout>
`

const BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <corners android:radius="20dp" />
    <solid android:color="@color/da_widget_background" />
</shape>
`

// Light values; the -night qualifier below supplies the dark palette so the
// widget follows the system theme without any code path of its own.
const COLORS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="da_widget_background">#FFFFFFFF</color>
    <color name="da_widget_text">#FF1A1917</color>
    <color name="da_widget_text_secondary">#FF6B6860</color>
</resources>
`

const COLORS_NIGHT_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="da_widget_background">#FF1F1E1B</color>
    <color name="da_widget_text">#FFF2F0EB</color>
    <color name="da_widget_text_secondary">#FFA39F96</color>
</resources>
`

const STRINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="da_widget_description">Bugün bilmen gerekenler.</string>
</resources>
`

const withAndroidWidget = (config) => {
  const androidPackage = config.android?.package ?? 'com.dijitalasistan.app'

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults)
    app.receiver = app.receiver ?? []
    const name = `${androidPackage}.${PACKAGE_SUFFIX}.DaWidgetProvider`
    if (!app.receiver.some((r) => r.$?.['android:name'] === name)) {
      app.receiver.push({
        $: { 'android:name': name, 'android:exported': 'false' },
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

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot
      const main = path.join(root, 'app/src/main')

      const kotlinDir = path.join(main, 'java', javaPath(androidPackage), PACKAGE_SUFFIX)
      fs.mkdirSync(kotlinDir, { recursive: true })
      fs.writeFileSync(path.join(kotlinDir, 'DaWidgetProvider.kt'), PROVIDER_KT(androidPackage), 'utf8')
      fs.writeFileSync(path.join(kotlinDir, 'DaWidgetModule.kt'), MODULE_KT(androidPackage), 'utf8')

      const write = (relative, contents) => {
        const target = path.join(main, 'res', relative)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, contents, 'utf8')
      }

      write('xml/da_widget_info.xml', WIDGET_INFO_XML)
      write('layout/da_widget.xml', WIDGET_LAYOUT_XML)
      write('drawable/da_widget_background.xml', BACKGROUND_XML)
      write('values/da_widget_colors.xml', COLORS_XML)
      write('values-night/da_widget_colors.xml', COLORS_NIGHT_XML)
      write('values/da_widget_strings.xml', STRINGS_XML)

      return cfg
    },
  ])

  return config
}

module.exports = withAndroidWidget
