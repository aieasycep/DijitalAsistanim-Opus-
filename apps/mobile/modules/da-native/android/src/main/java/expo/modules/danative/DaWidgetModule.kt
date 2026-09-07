package expo.modules.danative

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
