import type { NotificationPreferences, Profile, UserPreferences } from '@da/domain'
import {
  notificationPreferencesUpdateRequest,
  notificationPreferencesUpdateResponse,
  preferencesUpdateRequest,
  preferencesUpdateResponse,
  profileUpdateRequest,
  profileUpdateResponse,
  type NotificationPreferencesUpdateRequest,
  type PreferencesUpdateRequest,
  type ProfileUpdateRequest,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapNotificationPreferences, mapProfile, mapUserPreferences } from '../mappers'
import type {
  EndpointContext,
  NotificationPreferencesRow,
  ProfileRow,
  UserPreferencesRow,
} from '../types'

/**
 * A row the function already selected and RLS already scoped.
 *
 * The contract pins the envelope around it and leaves the row itself
 * permissive — adding a column must not require a contract change — so the
 * mapper is what narrows a row into a domain entity.
 */
function rowAs<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

export type PreferencesPatch = PreferencesUpdateRequest
export type NotificationPreferencesPatch = NotificationPreferencesUpdateRequest
export type ProfilePatch = ProfileUpdateRequest

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
      const request = parseRequest(preferencesUpdateRequest, patch)
      const result = await ctx.http.callFunction(
        'preferences-update',
        request,
        preferencesUpdateResponse,
        { retry: false },
      )
      return mapUserPreferences(rowAs<UserPreferencesRow>(result.preferences))
    },

    async notificationPrefs() {
      const row = await ctx.db.selectOne<NotificationPreferencesRow>('notification_preferences')
      return row ? mapNotificationPreferences(row) : null
    },

    async updateNotificationPrefs(patch) {
      const request = parseRequest(notificationPreferencesUpdateRequest, patch)
      const result = await ctx.http.callFunction(
        'notification-preferences-update',
        request,
        notificationPreferencesUpdateResponse,
        { retry: false },
      )
      return mapNotificationPreferences(
        rowAs<NotificationPreferencesRow>(result.notificationPreferences),
      )
    },

    async profile() {
      const row = await ctx.db.selectOne<ProfileRow>('profiles')
      return row ? mapProfile(row) : null
    },

    async updateProfile(patch) {
      const request = parseRequest(profileUpdateRequest, patch)
      const result = await ctx.http.callFunction('profile-update', request, profileUpdateResponse, {
        retry: false,
      })
      return mapProfile(rowAs<ProfileRow>(result.profile))
    },
  }
}
