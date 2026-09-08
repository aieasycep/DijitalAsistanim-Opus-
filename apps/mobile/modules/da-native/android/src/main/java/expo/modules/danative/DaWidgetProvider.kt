package expo.modules.danative

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import expo.modules.danative.R
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

    /**
     * The scheme comes from a resource the app's config plugin writes from
     * `APP_SCHEME`, the same value the iOS widget is generated with. Hard-coding
     * it here would send a fork's or a staging build's widget taps to whichever
     * app happens to own `dijitalasistan://` on the device.
     */
    private fun deepLinkIntent(context: Context, path: String): PendingIntent {
        val scheme = context.getString(R.string.da_widget_scheme)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("$scheme://$path")).apply {
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
