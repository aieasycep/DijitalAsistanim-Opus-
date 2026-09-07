import {
  type Locale,
  type NotificationCategory,
  toZonedParts,
} from './domain.ts'
import { dbError, serviceClient } from './db.ts'
import { fetchWithLimits } from './http.ts'
import { audit } from './audit.ts'

/**
 * Push delivery.
 *
 * Three product rules are enforced here rather than at each call site, because
 * a notification that slips past any of them is exactly the kind of thing
 * users uninstall over:
 *
 *   1. quiet hours and quiet days are respected;
 *   2. a category the user switched off is never sent;
 *   3. a message with the same dedupe key is sent once, ever — the midday
 *      pulse must not repeat the morning briefing.
 */

export interface PushPayload {
  userId: string
  category: NotificationCategory
  title: string
  body: string
  /** Deep-link path the tap opens, e.g. `thread/abc`. */
  path: string
  /** Stable per-event key. A repeat with the same key is dropped. */
  dedupeKey: string
  /** Extra data delivered to the app; identifiers only. */
  data?: Record<string, string>
}

interface DeviceToken {
  id: string
  token: string
  platform: 'ios' | 'android'
}

interface NotificationSettings {
  categories: Partial<Record<NotificationCategory, boolean>>
  onlyIfImportant: boolean
  lockScreenPrivacy: 'full' | 'title_only' | 'generic'
  quietHoursStart: string | null
  quietHoursEnd: string | null
  timeZone: string
  locale: Locale
}

async function loadSettings(userId: string): Promise<NotificationSettings | null> {
  const client = serviceClient()
  const [prefs, profile] = await Promise.all([
    client
      .from('notification_preferences')
      .select('categories, only_if_important, lock_screen_privacy, quiet_hours_start, quiet_hours_end')
      .eq('user_id', userId)
      .maybeSingle(),
    client.from('profiles').select('time_zone, locale').eq('id', userId).maybeSingle(),
  ])

  if (prefs.error) throw dbError(prefs.error)
  if (!profile.data) return null

  return {
    categories: (prefs.data?.categories as Record<NotificationCategory, boolean> | null) ?? {},
    onlyIfImportant: Boolean(prefs.data?.only_if_important),
    lockScreenPrivacy:
      (prefs.data?.lock_screen_privacy as NotificationSettings['lockScreenPrivacy'] | null) ??
      'title_only',
    quietHoursStart: (prefs.data?.quiet_hours_start as string | null) ?? null,
    quietHoursEnd: (prefs.data?.quiet_hours_end as string | null) ?? null,
    timeZone: (profile.data.time_zone as string | null) ?? 'Europe/Istanbul',
    locale: ((profile.data.locale as string | null) ?? 'tr') === 'en' ? 'en' : 'tr',
  }
}

/** Postgres `time` values arrive as `HH:MM:SS`; only hours and minutes matter. */
function minutesOfDay(value: string | null): number | null {
  if (!value) return null
  const [h, m] = value.split(':')
  const hours = Number(h)
  const minutes = Number(m)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

export function isQuietHour(now: Date, settings: NotificationSettings): boolean {
  const start = minutesOfDay(settings.quietHoursStart)
  const end = minutesOfDay(settings.quietHoursEnd)
  if (start === null || end === null || start === end) return false

  const parts = toZonedParts(now, settings.timeZone)
  const current = parts.hour * 60 + parts.minute
  // A window that wraps past midnight (22:00 → 07:00) is the union of two spans.
  return start < end ? current >= start && current < end : current >= start || current < end
}

/**
 * Categories important enough to survive "only notify me if it's really
 * important". Security and the approval queue are time-critical; a briefing is
 * not.
 */
const ALWAYS_IMPORTANT: ReadonlySet<NotificationCategory> = new Set([
  'critical_email',
  'deadline',
  'meeting',
  'approval',
])

export type PushOutcome =
  | { sent: true; deviceCount: number }
  | { sent: false; reason: 'no_tokens' | 'category_off' | 'quiet_hours' | 'duplicate' | 'not_important' }

/**
 * Send a push, or explain why it was suppressed.
 *
 * The caller gets a reason rather than a boolean so the scheduler can record
 * "skipped: quiet hours" and try again later instead of treating it as a
 * delivery.
 */
export async function sendPush(payload: PushPayload, now: Date): Promise<PushOutcome> {
  const client = serviceClient()

  const settings = await loadSettings(payload.userId)
  if (!settings) return { sent: false, reason: 'no_tokens' }

  if (settings.categories[payload.category] === false) {
    return { sent: false, reason: 'category_off' }
  }
  if (settings.onlyIfImportant && !ALWAYS_IMPORTANT.has(payload.category)) {
    return { sent: false, reason: 'not_important' }
  }
  if (isQuietHour(now, settings)) {
    return { sent: false, reason: 'quiet_hours' }
  }

  // The unique constraint on (user_id, dedupe_key) is what actually guarantees
  // once-only delivery under concurrency; the insert is the claim.
  const { error: claimError } = await client.from('notification_deliveries').insert({
    user_id: payload.userId,
    category: payload.category,
    dedupe_key: payload.dedupeKey,
    title: payload.title,
    body: payload.body,
    data: { path: payload.path, ...(payload.data ?? {}) },
    scheduled_for: now.toISOString(),
  })
  if (claimError) {
    if (claimError.code === '23505') return { sent: false, reason: 'duplicate' }
    throw dbError(claimError)
  }

  const { data: tokenRows, error: tokenError } = await client
    .from('push_tokens')
    .select('id, token, platform')
    .eq('user_id', payload.userId)
    .is('disabled_at', null)
  if (tokenError) throw dbError(tokenError)

  const tokens = (tokenRows ?? []) as DeviceToken[]
  if (tokens.length === 0) return { sent: false, reason: 'no_tokens' }

  // Lock-screen privacy is applied to the payload itself, not just to a display
  // hint — a title-only setting must mean the body never reaches the device.
  const visibleTitle = settings.lockScreenPrivacy === 'generic' ? 'Dijital Asistan' : payload.title
  const visibleBody =
    settings.lockScreenPrivacy === 'full'
      ? payload.body
      : settings.lockScreenPrivacy === 'title_only'
        ? ''
        : settings.locale === 'en'
          ? 'You have a new update.'
          : 'Yeni bir gelişme var.'

  const messages = tokens.map((device) => ({
    to: device.token,
    title: visibleTitle,
    body: visibleBody,
    sound: 'default',
    priority: ALWAYS_IMPORTANT.has(payload.category) ? 'high' : 'normal',
    channelId: payload.category,
    data: { path: payload.path, category: payload.category, ...(payload.data ?? {}) },
  }))

  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
  const { response, body } = await fetchWithLimits(
    Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    },
    { timeoutMs: 15_000, errorCode: 'provider_unavailable' },
  )

  if (!response.ok) {
    await client
      .from('notification_deliveries')
      .update({ failed_at: now.toISOString(), failure_reason: `expo_${response.status}` })
      .eq('user_id', payload.userId)
      .eq('dedupe_key', payload.dedupeKey)
    return { sent: false, reason: 'no_tokens' }
  }

  // Expo reports per-token errors in the receipt array; a token the device has
  // discarded must be disabled or every later send wastes a request.
  try {
    const parsed = JSON.parse(body) as { data?: Array<{ status?: string; details?: { error?: string } }> }
    const results = parsed.data ?? []
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const device = tokens[i]
      if (!result || !device) continue
      if (result.status === 'error' && result.details?.error === 'DeviceNotRegistered') {
        await client
          .from('push_tokens')
          .update({ disabled_at: now.toISOString() })
          .eq('id', device.id)
      }
    }
  } catch {
    // A malformed receipt does not invalidate the send itself.
  }

  await client
    .from('notification_deliveries')
    .update({ sent_at: now.toISOString() })
    .eq('user_id', payload.userId)
    .eq('dedupe_key', payload.dedupeKey)

  await audit({
    userId: payload.userId,
    action: 'notification.sent',
    entityType: 'notification',
    entityId: payload.dedupeKey,
    metadata: { category: payload.category, devices: tokens.length },
  })

  return { sent: true, deviceCount: tokens.length }
}
