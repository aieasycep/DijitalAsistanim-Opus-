import type { PushToken } from '@da/domain'
import {
  ackResponse,
  pushTokenRegisterRequest,
  pushTokenRegisterResponse,
  pushTokenUnregisterRequest,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapPushToken } from '../mappers'
import type { EndpointContext, PushTokenRow } from '../types'

/**
 * A row the function already selected and RLS already scoped.
 *
 * The contract pins the envelope around it — that is what drifts — and leaves
 * the row permissive, so the mapper is what narrows it into a domain entity.
 */
function rowOf<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

export interface RegisterPushTokenInput {
  token: string
  platform: 'ios' | 'android'
  deviceId: string
  deviceName?: string | null
  appVersion?: string | null
}

export interface NotificationsApi {
  registerToken(input: RegisterPushTokenInput): Promise<PushToken>
  unregisterToken(input: { deviceId: string }): Promise<void>
}

export function createNotificationsApi(ctx: EndpointContext): NotificationsApi {
  return {
    async registerToken(input) {
      const request = parseRequest(pushTokenRegisterRequest, {
        token: input.token,
        platform: input.platform,
        deviceId: input.deviceId,
        deviceName: input.deviceName ?? null,
        appVersion: input.appVersion ?? null,
      })
      const result = await ctx.http.callFunction(
        'push-token-register',
        request,
        pushTokenRegisterResponse,
        // The upsert is keyed on the device, so a retry would be harmless —
        // but a token that failed to register once is registered again by the
        // next launch anyway, and retrying here only delays that.
        { retry: false },
      )
      return mapPushToken(rowOf<PushTokenRow>(result.pushToken))
    },

    async unregisterToken(input) {
      const request = parseRequest(pushTokenUnregisterRequest, { deviceId: input.deviceId })
      await ctx.http.callFunction('push-token-unregister', request, ackResponse, { retry: false })
    },
  }
}
