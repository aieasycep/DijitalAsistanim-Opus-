const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require('expo/config-plugins')
const path = require('node:path')
const fs = require('node:fs')

/**
 * Android Notification Intelligence.
 *
 * Registers a `NotificationListenerService` and copies the Kotlin sources into
 * the generated project. This is Android-only by construction: iOS gives no
 * app any access to other apps' notification stream, and the product does not
 * pretend otherwise (see docs/KNOWN_PLATFORM_LIMITATIONS.md).
 *
 * The listener itself is inert until the user grants the special access in
 * system settings AND opts in inside the app — the service checks both before
 * it forwards anything.
 */

const PACKAGE_SUFFIX = 'notifications'

function javaPackagePath(androidPackage) {
  return androidPackage.split('.').join('/')
}

const LISTENER_KT = (androidPackage) => `package ${androidPackage}.${PACKAGE_SUFFIX}

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/**
 * Captures posted notifications and buffers them locally for the JS layer to
 * collect.
 *
 * Three filters run before anything is stored, in this order:
 *   1. the user must have switched the feature on in the app;
 *   2. the posting package must be in the user's allow-list;
 *   3. the package must not be in the permanent sensitive-app blocklist.
 *
 * The blocklist is not user-editable on purpose. One-time codes and password
 * manager notifications are exactly the payloads that must never be persisted
 * or leave the device, whatever the user has allowed elsewhere.
 */
class DaNotificationListenerService : NotificationListenerService() {

    companion object {
        const val PREFS = "da_notification_intelligence"
        const val KEY_ENABLED = "enabled"
        const val KEY_ALLOWED_PACKAGES = "allowed_packages"
        const val KEY_BUFFER = "buffer"
        const val MAX_BUFFERED = 200

        /**
         * Packages whose notifications are never captured. Authenticators and
         * password managers carry one-time codes; the messaging entries are
         * carriers for OTP SMS.
         */
        val BLOCKED_PACKAGES = setOf(
            "com.google.android.apps.authenticator2",
            "com.azure.authenticator",
            "com.authy.authy",
            "com.duosecurity.duomobile",
            "org.fedorahosted.freeotp",
            "com.beemdevelopment.aegis",
            "com.lastpass.lpandroid",
            "com.agilebits.onepassword",
            "com.onepassword.android",
            "com.bitwarden.authenticator",
            "com.x8bit.bitwarden",
            "com.dashlane",
            "com.keepersecurity.parseur",
            "com.google.android.gms",
            "com.android.settings",
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
        )

        /** Notification text that looks like a one-time code is dropped outright. */
        private val OTP_PATTERNS = listOf(
            Regex("(?i)\\\\b(otp|one[- ]time|doğrulama|dogrulama|onay) ?kodu?\\\\b"),
            Regex("(?i)\\\\bverification code\\\\b"),
            Regex("(?i)\\\\bşifreniz|sifreniz\\\\b"),
            Regex("\\\\b\\\\d{4,8}\\\\b.{0,40}(?i)(kod|code)"),
            Regex("(?i)(kod|code).{0,40}\\\\b\\\\d{4,8}\\\\b"),
        )

        fun looksLikeOneTimeCode(text: String): Boolean =
            OTP_PATTERNS.any { it.containsMatchIn(text) }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ENABLED, false)) return

        val pkg = sbn.packageName ?: return
        if (BLOCKED_PACKAGES.contains(pkg)) return

        val allowedRaw = prefs.getString(KEY_ALLOWED_PACKAGES, null) ?: return
        val allowed = try {
            JSONArray(allowedRaw)
        } catch (e: Exception) {
            return
        }
        var isAllowed = false
        for (i in 0 until allowed.length()) {
            if (allowed.optString(i) == pkg) { isAllowed = true; break }
        }
        if (!isAllowed) return

        // Ongoing notifications are progress bars and media controls, never news.
        if (sbn.isOngoing) return
        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        if (title.isBlank() && text.isBlank()) return
        if (looksLikeOneTimeCode("\$title \$text")) return

        val appName = try {
            val pm = applicationContext.packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
        } catch (e: Exception) {
            pkg
        }

        val entry = JSONObject().apply {
            put("packageName", pkg)
            put("appName", appName)
            put("title", title)
            put("text", text)
            put("postedAt", sbn.postTime)
        }

        val buffer = try {
            JSONArray(prefs.getString(KEY_BUFFER, "[]"))
        } catch (e: Exception) {
            JSONArray()
        }
        buffer.put(entry)

        // Bound the buffer so a chatty app cannot fill the device.
        val trimmed = if (buffer.length() > MAX_BUFFERED) {
            JSONArray().also { out ->
                for (i in (buffer.length() - MAX_BUFFERED) until buffer.length()) {
                    out.put(buffer.get(i))
                }
            }
        } else buffer

        prefs.edit().putString(KEY_BUFFER, trimmed.toString()).apply()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        // Removal carries no signal for this product.
    }
}
`

const MODULE_KT = (androidPackage) => `package ${androidPackage}.${PACKAGE_SUFFIX}

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
`

const withAndroidNotificationListener = (config) => {
  const androidPackage = config.android?.package ?? 'com.dijitalasistan.app'

  // 1. Declare the service and its permission in the manifest.
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults)
    app.service = app.service ?? []

    const serviceName = `${androidPackage}.${PACKAGE_SUFFIX}.DaNotificationListenerService`
    const already = app.service.some((s) => s.$?.['android:name'] === serviceName)
    if (!already) {
      app.service.push({
        $: {
          'android:name': serviceName,
          'android:label': 'Dijital Asistan',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.service.notification.NotificationListenerService' } }],
          },
        ],
      })
    }

    // `queryPackages` visibility is required on API 30+ to list launchable apps
    // for the picker; without it the allow-list screen would be empty.
    cfg.modResults.manifest['uses-permission'] = cfg.modResults.manifest['uses-permission'] ?? []
    const perms = cfg.modResults.manifest['uses-permission']
    const needed = 'android.permission.QUERY_ALL_PACKAGES'
    if (!perms.some((p) => p.$?.['android:name'] === needed)) {
      perms.push({ $: { 'android:name': needed } })
    }

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

  // 2. Write the Kotlin sources into the generated project.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot
      const dir = path.join(
        root,
        'app/src/main/java',
        javaPackagePath(androidPackage),
        PACKAGE_SUFFIX,
      )
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'DaNotificationListenerService.kt'),
        LISTENER_KT(androidPackage),
        'utf8',
      )
      fs.writeFileSync(
        path.join(dir, 'DaNotificationListenerModule.kt'),
        MODULE_KT(androidPackage),
        'utf8',
      )
      return cfg
    },
  ])

  return config
}

module.exports = withAndroidNotificationListener
