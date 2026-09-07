import type { NotificationCategory } from '@da/domain'
import * as Application from 'expo-application'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { plainCache, STORAGE_KEYS } from './secure-storage'
import { reportError } from './error-reporting'

/**
 * Push notifications.
 *
 * Notification content is deliberately thin: a title and a deep link. The body
 * of a mail, the name of a sender and the subject line never travel through
 * APNs/FCM, so a lock-screen preview cannot leak what the app knows — and the
 * user's lock-screen privacy setting is honoured server-side as well.
 */

/** Android channels, one per category, so the OS controls are meaningful. */
const ANDROID_CHANNELS: ReadonlyArray<{
  id: NotificationCategory
  importance: Notifications.AndroidImportance
}> = [
  { id: 'morning_briefing', importance: Notifications.AndroidImportance.HIGH },
  { id: 'midday_pulse', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'evening_close', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'weekly_review', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'critical_email', importance: Notifications.AndroidImportance.MAX },
  { id: 'meeting', importance: Notifications.AndroidImportance.HIGH },
  { id: 'deadline', importance: Notifications.AndroidImportance.HIGH },
  { id: 'follow_up', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'life_event', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'approval', importance: Notifications.AndroidImportance.DEFAULT },
]

export type PermissionState = 'granted' | 'denied' | 'undetermined'

/** Configure how a notification behaves while the app is in the foreground. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
  })
}

/**
 * Create one Android channel per category.
 *
 * `labelFor` is the translator: channel names are user-visible OS strings, so
 * they have to come from the catalogue rather than be hard-coded English.
 */
export async function ensureAndroidChannels(
  labelFor: (category: NotificationCategory) => string,
): Promise<void> {
  if (Platform.OS !== 'android') return
  for (const channel of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: labelFor(channel.id),
      importance: channel.importance,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      enableVibrate: true,
      showBadge: false,
    })
  }
}

export async function getPermissionState(): Promise<PermissionState> {
  const settings = await Notifications.getPermissionsAsync()
  if (settings.granted) return 'granted'
  return settings.canAskAgain ? 'undetermined' : 'denied'
}

/**
 * Ask for permission and, if granted, return the push token.
 *
 * Returns null rather than throwing when permission is declined: a user who
 * says no is not an error condition, and the app stays fully usable without
 * notifications.
 */
export async function requestPushPermission(): Promise<{
  state: PermissionState
  token: string | null
}> {
  const current = await Notifications.getPermissionsAsync()
  const settings = current.granted
    ? current
    : await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      })

  if (!settings.granted) {
    return { state: settings.canAskAgain ? 'undetermined' : 'denied', token: null }
  }

  // A simulator has no push token, and asking for one throws.
  if (!Device.isDevice) return { state: 'granted', token: null }

  try {
    const projectId = getProjectId()
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    return { state: 'granted', token: token.data }
  } catch (error) {
    reportError(error, { scope: 'notifications:requestPushPermission' })
    return { state: 'granted', token: null }
  }
}

function getProjectId(): string | undefined {
  const value = process.env['EXPO_PUBLIC_EAS_PROJECT_ID']
  return value && value.trim() !== '' ? value.trim() : undefined
}

/** A stable per-install id, so re-registering replaces rather than duplicates. */
export function deviceId(): string {
  const cached = plainCache.getString(STORAGE_KEYS.deviceId)
  if (cached) return cached
  const generated =
    Application.getAndroidId() ??
    `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  plainCache.set(STORAGE_KEYS.deviceId, generated)
  return generated
}

export function deviceName(): string | null {
  return Device.modelName ?? null
}

export function appVersion(): string | null {
  return Application.nativeApplicationVersion ?? null
}

/** Cancel every locally-scheduled reminder. Used on sign-out and on wipe. */
export async function cancelAllLocalNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync()
  } catch (error) {
    reportError(error, { scope: 'notifications:cancelAll' })
  }
}
