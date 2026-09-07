import type { PushToken } from '@da/domain'
import { registerPushTokenRequestSchema } from '@da/validation'
import { z } from 'zod'
import { okSchema, parseRequest, rowOf } from '../http'
import { mapPushToken } from '../mappers'
import type { EndpointContext, PushTokenRow } from '../types'

const pushTokenEnvelopeSchema = z.object({ pushToken: rowOf<PushTokenRow>() })

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
      const request = parseRequest(registerPushTokenRequestSchema, {
        token: input.token,
        platform: input.platform,
        deviceId: input.deviceId,
        deviceName: input.deviceName ?? null,
        appVersion: input.appVersion ?? null,
      })
      const result = await ctx.http.callFunction(
        'push-token-register',
        request,
        pushTokenEnvelopeSchema,
        { retry: false },
      )
      return mapPushToken(result.pushToken)
    },

    async unregisterToken(input) {
      await ctx.http.callFunction('push-token-unregister', { deviceId: input.deviceId }, okSchema, {
        retry: false,
      })
    },
  }
}
