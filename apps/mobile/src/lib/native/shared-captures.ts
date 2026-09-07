import { AppError } from '@da/domain'
import { Directory, File, Paths } from 'expo-file-system'
import { DaShareIntakeNative } from '../../../modules/da-native'
import { Platform } from 'react-native'
import { reportError } from '../error-reporting'

/**
 * Items shared into the app from other apps.
 *
 * iOS routes them through the share extension, which writes a queue into the
 * App Group container; Android delivers them as an intent, which Expo Router
 * surfaces as a deep link with the payload attached. Both end up here so the
 * capture screen has one shape to read.
 */

export interface SharedCapture {
  text: string | null
  url: string | null
  /** Absolute file URIs the extension copied into the shared container. */
  fileUris: string[]
  receivedAt: number
}

export function shareIntakeAvailable(): boolean {
  return DaShareIntakeNative !== null
}

/**
 * Read everything the share extension has queued.
 *
 * Returns an empty list — never throws — when the extension is not installed,
 * which is the normal case in Expo Go and on Android.
 */
export function drainSharedCaptures(): SharedCapture[] {
  if (!DaShareIntakeNative) return []
  try {
    const container = DaShareIntakeNative.sharedContainerPath()
    return DaShareIntakeNative.drainPendingCaptures().map((item) => ({
      text: item.text ?? null,
      url: item.url ?? null,
      fileUris: (item.files ?? []).map((name) =>
        container ? `file://${container.replace(/\/+$/, '')}/${name}` : name,
      ),
      receivedAt: item.receivedAt,
    }))
  } catch (error) {
    reportError(error, { scope: 'sharedCaptures:drain', extra: { platform: Platform.OS } })
    return []
  }
}

/**
 * Copy a shared file into the app's own cache.
 *
 * The App Group container is shared with the extension and is not a stable
 * place to read from while uploading — the extension may be replaced or the
 * container pruned — so the file is moved somewhere the app controls first.
 */
export function stageSharedFile(fileUri: string): string {
  const source = new File(fileUri)
  if (!source.exists) {
    throw new AppError('capture_failed', { detail: 'shared file is no longer available' })
  }

  const staging = new Directory(Paths.cache, 'shared-captures')
  if (!staging.exists) staging.create({ intermediates: true })

  const destination = new File(staging, source.name)
  if (destination.exists) destination.delete()
  source.copy(destination)
  return destination.uri
}
