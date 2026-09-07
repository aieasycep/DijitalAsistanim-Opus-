import {
  LOCALES,
  type NotificationPreferences,
  type Profile,
  type UserPreferences,
} from '@da/domain'
import {
  timeZoneSchema,
  updateNotificationPreferencesRequestSchema,
  updatePreferencesRequestSchema,
} from '@da/validation'
import { z } from 'zod'
import { parseRequest, rowOf } from '../http'
import { mapNotificationPreferences, mapProfile, mapUserPreferences } from '../mappers'
import type {
  EndpointContext,
  NotificationPreferencesRow,
  ProfileRow,
  UserPreferencesRow,
} from '../types'

const preferencesEnvelopeSchema = z.object({ preferences: rowOf<UserPreferencesRow>() })
const notificationEnvelopeSchema = z.object({
  notificationPreferences: rowOf<NotificationPreferencesRow>(),
})
const profileEnvelopeSchema = z.object({ profile: rowOf<ProfileRow>() })

const profileUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(120).nullable(),
    givenName: z.string().min(1).max(60).nullable(),
    avatarUrl: z.string().url().nullable(),
    timeZone: timeZoneSchema,
    locale: z.enum(LOCALES),
  })
  .partial()

export type PreferencesPatch = z.infer<typeof updatePreferencesRequestSchema>
export type NotificationPreferencesPatch = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>
export type ProfilePatch = z.infer<typeof profileUpdateSchema>

export interface SettingsApi {
  preferences(): Promise<UserPreferences | null>
  updatePreferences(patch: PreferencesPatch): Promise<UserPreferences>
  notificationPrefs(): Promise<NotificationPreferences | null>
  updateNotificationPrefs(patch: NotificationPreferencesPatch): Promise<NotificationPreferences>
  profile(): Promise<Profile | null>
  updateProfile(patch: ProfilePatch): Promise<Profile>
}

export function createSettingsApi(ctx: EndpointContext): SettingsApi {
  return {
    async preferences() {
      // RLS scopes the table to one row per user, so no filter is needed.
      const row = await ctx.db.selectOne<UserPreferencesRow>('user_preferences')
      return row ? mapUserPreferences(row) : null
    },

    async updatePreferences(patch) {
      const request = parseRequest(updatePreferencesRequestSchema, patch)
      const result = await ctx.http.callFunction(
        'preferences-update',
        request,
        preferencesEnvelopeSchema,
        { retry: false },
      )
      return mapUserPreferences(result.preferences)
    },

    async notificationPrefs() {
      const row = await ctx.db.selectOne<NotificationPreferencesRow>('notification_preferences')
      return row ? mapNotificationPreferences(row) : null
    },

    async updateNotificationPrefs(patch) {
      const request = parseRequest(updateNotificationPreferencesRequestSchema, patch)
      const result = await ctx.http.callFunction(
        'notification-preferences-update',
        request,
        notificationEnvelopeSchema,
        { retry: false },
      )
      return mapNotificationPreferences(result.notificationPreferences)
    },

    async profile() {
      const row = await ctx.db.selectOne<ProfileRow>('profiles')
      return row ? mapProfile(row) : null
    },

    async updateProfile(patch) {
      const request = parseRequest(profileUpdateSchema, patch)
      const result = await ctx.http.callFunction('profile-update', request, profileEnvelopeSchema, {
        retry: false,
      })
      return mapProfile(result.profile)
    },
  }
}
