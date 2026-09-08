import type { NotificationCategory } from '@da/domain'
import { useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useT } from '../i18n/I18nProvider'
import {
  appVersion,
  deviceId,
  deviceName,
  ensureAndroidChannels,
  getPermissionState,
  requestPushPermission,
  type PermissionState,
} from '../lib/notifications'
import { plainCache, STORAGE_KEYS } from '../lib/secure-storage'
import { reportError } from '../lib/error-reporting'
import { useApi } from '../providers/AppProviders'

/**
 * Push registration.
 *
 * The token is registered with the backend at most once per value: re-sending
 * an unchanged token on every launch would rewrite the row (and its
 * `last_seen_at`) for no benefit, and would make a genuine token rotation
 * harder to spot in the logs.
 *
 * A failure does not throw — the next launch tries again, and a background
 * registration is not worth interrupting a flow over — but it is no longer
 * swallowed either: `error` is what a screen that *asked* for registration
 * renders, so the user is not left looking at a granted permission and a device
 * the backend has never heard of.
 */
export function usePushRegistration(): {
  state: PermissionState
  register: () => Promise<void>
  isRegistering: boolean
  /** The last registration failure, or null. An `AppError` when it came from the API. */
  error: unknown
  ensureChannels: () => Promise<void>
} {
  const api = useApi()
  const t = useT()
  const [state, setState] = useState<PermissionState>('undetermined')
  const [isRegistering, setRegistering] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    void getPermissionState().then(setState)
  }, [])

  const ensureChannels = useCallback(async () => {
    await ensureAndroidChannels((category: NotificationCategory) =>
      t(`notifications.category.${category}`),
    )
  }, [t])

  const register = useCallback(async () => {
    setRegistering(true)
    setError(null)
    try {
      const result = await requestPushPermission()
      setState(result.state)
      if (!result.token) return

      await ensureChannels()

      if (plainCache.getString(STORAGE_KEYS.pushToken) === result.token) return
      await api.notifications.registerToken({
        token: result.token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        deviceId: deviceId(),
        deviceName: deviceName(),
        appVersion: appVersion(),
      })
      plainCache.set(STORAGE_KEYS.pushToken, result.token)
    } catch (caught) {
      // Failing to register is not worth blocking the flow over; the next
      // launch tries again. It is worth *saying*, though, when the user is the
      // one who pressed the button.
      setError(caught)
      reportError(caught, { scope: 'usePushRegistration:register' })
    } finally {
      setRegistering(false)
    }
  }, [api, ensureChannels])

  return { state, register, isRegistering, error, ensureChannels }
}
