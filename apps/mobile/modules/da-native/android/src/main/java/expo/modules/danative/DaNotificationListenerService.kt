package expo.modules.danative

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
            Regex("(?i)\\b(otp|one[- ]time|doğrulama|dogrulama|onay) ?kodu?\\b"),
            Regex("(?i)\\bverification code\\b"),
            Regex("(?i)\\bşifreniz|sifreniz\\b"),
            Regex("\\b\\d{4,8}\\b.{0,40}(?i)(kod|code)"),
            Regex("(?i)(kod|code).{0,40}\\b\\d{4,8}\\b"),
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
        if (looksLikeOneTimeCode("$title $text")) return

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
