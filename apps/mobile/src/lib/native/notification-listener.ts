import { Platform } from 'react-native'
import { DaNotificationListenerNative } from '../../../modules/da-native'
import { reportError } from '../error-reporting'

/**
 * Android notification intelligence.
 *
 * Reading other apps' notifications is powerful and, handled carelessly, an
 * outright privacy hazard — so three rules are enforced on the native side and
 * restated here because they are the reason this module is acceptable at all:
 *
 *  1. Password managers, authenticators and messaging apps are on a blocked
 *     list that the user cannot override.
 *  2. Anything that looks like a one-time code is dropped before it is ever
 *     buffered, so an OTP never reaches storage, let alone a server.
 *  3. The buffer stays on the device until the user has opted in explicitly;
 *     nothing is uploaded by default.
 *
 * iOS has no equivalent API and this module does not pretend otherwise:
 * `isSupported()` is false there, and the settings screen says so.
 */

export interface DeviceNotificationRecord {
  packageName: string
  appName: string
  title: string
  text: string
  /** Milliseconds since the epoch, as Android reports it. */
  postedAt: number
}

export interface InstalledApp {
  packageName: string
  appName: string
}

export function isSupported(): boolean {
  return (
    Platform.OS === 'android' &&
    DaNotificationListenerNative !== null &&
    DaNotificationListenerNative.isSupported()
  )
}

/** Whether the OS-level "notification access" permission has been granted. */
export function hasAccess(): boolean {
  if (!DaNotificationListenerNative) return false
  try {
    return DaNotificationListenerNative.hasAccess()
  } catch (error) {
    reportError(error, { scope: 'notificationListener:hasAccess' })
    return false
  }
}

/** Opens the system settings page; there is no in-app way to grant this. */
export function openAccessSettings(): void {
  DaNotificationListenerNative?.openSettings()
}

/** The in-app opt-in, independent of the OS permission. */
export function setEnabled(enabled: boolean): void {
  DaNotificationListenerNative?.setEnabled(enabled)
}

export function isEnabled(): boolean {
  return DaNotificationListenerNative?.isEnabled() ?? false
}

export function setAllowedPackages(packages: readonly string[]): void {
  DaNotificationListenerNative?.setAllowedPackages([...packages])
}

export function getAllowedPackages(): string[] {
  return DaNotificationListenerNative?.getAllowedPackages() ?? []
}

/** Packages the service refuses to read, whatever the user selects. */
export function getBlockedPackages(): string[] {
  return DaNotificationListenerNative?.getBlockedPackages() ?? []
}

export function getInstalledApps(): InstalledApp[] {
  try {
    return DaNotificationListenerNative?.getInstalledApps() ?? []
  } catch (error) {
    reportError(error, { scope: 'notificationListener:getInstalledApps' })
    return []
  }
}

/**
 * Take everything buffered since the last drain.
 *
 * Draining clears the buffer, so the caller owns what it receives: the sync
 * routine uploads it in one request and does not retry from the buffer, which
 * is what stops a failed upload from re-reading notifications forever.
 */
export function drainBuffer(): DeviceNotificationRecord[] {
  try {
    return DaNotificationListenerNative?.drainBuffer() ?? []
  } catch (error) {
    reportError(error, { scope: 'notificationListener:drainBuffer' })
    return []
  }
}
