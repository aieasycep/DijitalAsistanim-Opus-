import { requireOptionalNativeModule } from 'expo-modules-core'

/**
 * The local native module.
 *
 * Three capabilities Expo has no package for: writing the home-screen widget's
 * snapshot, draining what the iOS share extension queued, and Android's
 * notification listener. Each handle is optional — `requireOptionalNativeModule`
 * returns null in Expo Go, on the wrong platform, and in any build where the
 * native side was not compiled in — so callers degrade instead of crashing.
 *
 * The typed wrappers the app actually uses live in `src/lib/native/*`; this
 * file is only the boundary where the native handles are obtained.
 */

export interface WidgetNativeModule {
  setSnapshot(json: string): boolean
  clearSnapshot(): boolean
}

export interface ShareIntakeNativeModule {
  drainPendingCaptures(): Array<{
    text?: string
    url?: string
    files?: string[]
    receivedAt: number
  }>
  sharedContainerPath(): string | null
}

export interface NotificationListenerNativeModule {
  isSupported(): boolean
  hasAccess(): boolean
  openSettings(): boolean
  setEnabled(enabled: boolean): boolean
  isEnabled(): boolean
  setAllowedPackages(packages: string[]): boolean
  getAllowedPackages(): string[]
  getBlockedPackages(): string[]
  getInstalledApps(): Array<{ packageName: string; appName: string }>
  drainBuffer(): Array<{
    packageName: string
    appName: string
    title: string
    text: string
    postedAt: number
  }>
}

export const DaWidgetNative = requireOptionalNativeModule<WidgetNativeModule>('DaWidget')

export const DaShareIntakeNative =
  requireOptionalNativeModule<ShareIntakeNativeModule>('DaShareIntake')

export const DaNotificationListenerNative =
  requireOptionalNativeModule<NotificationListenerNativeModule>('DaNotificationListener')
