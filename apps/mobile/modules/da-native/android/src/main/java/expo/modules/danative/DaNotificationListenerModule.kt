package expo.modules.danative

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

/**
 * JS bridge for the notification listener.
 *
 * Deliberately narrow: JS can ask whether access is granted, open the system
 * settings screen, set the opt-in flag and the allow-list, and drain the
 * buffer. It cannot read a notification the filters rejected, because those
 * were never written.
 */
class DaNotificationListenerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("DaNotificationListener")

        Function("isSupported") { true }

        Function("hasAccess") {
            val context = appContext.reactContext ?: return@Function false
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners",
            ) ?: return@Function false
            enabled.split(":").any {
                ComponentName.unflattenFromString(it)?.packageName == context.packageName
            }
        }

        Function("openSettings") {
            val context = appContext.reactContext ?: return@Function false
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }

        Function("setEnabled") { enabled: Boolean ->
            prefs()?.edit()?.putBoolean(DaNotificationListenerService.KEY_ENABLED, enabled)?.apply()
            // Turning the feature off discards anything already buffered.
            if (!enabled) {
                prefs()?.edit()?.putString(DaNotificationListenerService.KEY_BUFFER, "[]")?.apply()
            }
            true
        }

        Function("isEnabled") {
            prefs()?.getBoolean(DaNotificationListenerService.KEY_ENABLED, false) ?: false
        }

        Function("setAllowedPackages") { packages: List<String> ->
            val filtered = packages.filter {
                !DaNotificationListenerService.BLOCKED_PACKAGES.contains(it)
            }
            val array = JSONArray()
            filtered.forEach { array.put(it) }
            prefs()?.edit()
                ?.putString(DaNotificationListenerService.KEY_ALLOWED_PACKAGES, array.toString())
                ?.apply()
            filtered
        }

        Function("getAllowedPackages") {
            val raw = prefs()?.getString(
                DaNotificationListenerService.KEY_ALLOWED_PACKAGES,
                "[]",
            ) ?: "[]"
            val array = JSONArray(raw)
            (0 until array.length()).map { array.optString(it) }
        }

        Function("getBlockedPackages") {
            DaNotificationListenerService.BLOCKED_PACKAGES.toList()
        }

        Function("getInstalledApps") {
            val context = appContext.reactContext ?: return@Function emptyList<Map<String, String>>()
            val pm = context.packageManager
            val launchable = pm.queryIntentActivities(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),
                0,
            )
            launchable
                .map { it.activityInfo.packageName }
                .distinct()
                .filter { !DaNotificationListenerService.BLOCKED_PACKAGES.contains(it) }
                .filter { it != context.packageName }
                .mapNotNull { pkg ->
                    try {
                        mapOf(
                            "packageName" to pkg,
                            "appName" to pm.getApplicationLabel(
                                pm.getApplicationInfo(pkg, 0),
                            ).toString(),
                        )
                    } catch (e: Exception) {
                        null
                    }
                }
                .sortedBy { it["appName"] }
        }

        /** Returns the buffered notifications and clears the buffer atomically. */
        Function("drainBuffer") {
            val p = prefs() ?: return@Function emptyList<Map<String, Any>>()
            val raw = p.getString(DaNotificationListenerService.KEY_BUFFER, "[]") ?: "[]"
            p.edit().putString(DaNotificationListenerService.KEY_BUFFER, "[]").apply()
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { i ->
                val o = array.optJSONObject(i) ?: return@mapNotNull null
                mapOf(
                    "packageName" to o.optString("packageName"),
                    "appName" to o.optString("appName"),
                    "title" to o.optString("title"),
                    "text" to o.optString("text"),
                    "postedAt" to o.optLong("postedAt"),
                )
            }
        }
    }

    private fun prefs() = appContext.reactContext?.getSharedPreferences(
        DaNotificationListenerService.PREFS,
        Context.MODE_PRIVATE,
    )
}
