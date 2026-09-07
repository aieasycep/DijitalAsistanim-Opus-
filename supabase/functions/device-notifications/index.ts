import { deviceNotificationBatchSchema } from '@da/validation'
import { AppError, systemClock, triage } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { loadEntitlements, requireFeature } from '../_shared/limits.ts'

/**
 * Android Notification Intelligence ingest.
 *
 * The client already filters, but the server filters again: one-time codes and
 * password-manager traffic must never be persisted, and a rule that only lives
 * on the device is a rule that a modified client can skip.
 */
const BLOCKED_PACKAGE_FRAGMENTS = [
  'authenticator',
  'password',
  'bitwarden',
  'lastpass',
  '1password',
  'dashlane',
  'keeper',
  'authy',
  'duo',
  'freeotp',
  'aegis',
  'messaging',
  'com.android.mms',
]

const OTP_PATTERNS = [
  /\b(otp|one[- ]time|doğrulama|dogrulama|onay)\s?kodu?\b/i,
  /\bverification code\b/i,
  /\b(şifreniz|sifreniz|parolanız|parolaniz)\b/i,
  /\b\d{4,8}\b.{0,40}(kod|code)/i,
  /(kod|code).{0,40}\b\d{4,8}\b/i,
]

function looksSensitive(packageName: string, title: string, text: string): boolean {
  const pkg = packageName.toLowerCase()
  if (BLOCKED_PACKAGE_FRAGMENTS.some((fragment) => pkg.includes(fragment))) return true
  const combined = `${title} ${text}`
  return OTP_PATTERNS.some((pattern) => pattern.test(combined))
}

serveFunction('device-notifications', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, deviceNotificationBatchSchema)
  const now = systemClock.now()
  const client = serviceClient()

  const entitlements = await loadEntitlements(user.id, now)
  requireFeature(entitlements, 'android_notification_intelligence')

  const prefs = await client
    .from('notification_preferences')
    .select('categories')
    .eq('user_id', user.id)
    .maybeSingle()
  if (prefs.error) throw dbError(prefs.error)

  const categories = (prefs.data?.categories as Record<string, boolean> | null) ?? {}
  if (categories.device_notifications === false) {
    throw new AppError('forbidden', { detail: 'feature_disabled_by_user' })
  }

  const accepted: Array<Record<string, unknown>> = []
  let rejected = 0

  for (const item of body.notifications) {
    const title = item.title ?? ''
    const text = item.text ?? ''
    if (looksSensitive(item.packageName, title, text)) {
      rejected++
      continue
    }
    if (!title.trim() && !text.trim()) {
      rejected++
      continue
    }

    const decision = triage({
      fromEmail: `${item.packageName}@device.local`,
      fromName: item.appName,
      subject: title,
      snippet: text,
      providerLabels: [],
      headers: {},
      isDirectlyAddressed: true,
      vipEmails: new Set(),
      ruleImportantSenders: new Set(),
      ruleImportantDomains: new Set(),
      ruleKeywords: [],
    })

    accepted.push({
      user_id: user.id,
      package_name: item.packageName,
      app_name: item.appName,
      title,
      text,
      posted_at: item.postedAt,
      importance: decision.sendToModel ? 'normal' : decision.importance,
      category: decision.sendToModel ? (decision.presumedCategory ?? 'information') : decision.category,
      processed_at: now.toISOString(),
    })
  }

  if (accepted.length > 0) {
    const { error } = await client
      .from('device_notifications')
      .upsert(accepted, { onConflict: 'user_id,package_name,posted_at,title', ignoreDuplicates: true })
    if (error) throw dbError(error)
  }

  return jsonResponse({ accepted: accepted.length, rejected }, 200, origin)
})
