import { preferencesUpdateRequest, type PreferencesUpdateResponse } from '@da/validation'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/** Camel-cased request fields to their snake_case columns. */
const COLUMN: Record<string, string> = {
  colorScheme: 'color_scheme',
  language: 'language',
  morningBriefingTime: 'morning_briefing_time',
  middayPulseEnabled: 'midday_pulse_enabled',
  middayPulseTime: 'midday_pulse_time',
  eveningCloseEnabled: 'evening_close_enabled',
  eveningCloseTime: 'evening_close_time',
  weeklyReviewEnabled: 'weekly_review_enabled',
  weeklyReviewWeekday: 'weekly_review_weekday',
  weeklyReviewTime: 'weekly_review_time',
  briefingOnWeekends: 'briefing_on_weekends',
  quietDays: 'quiet_days',
  quietHoursStart: 'quiet_hours_start',
  quietHoursEnd: 'quiet_hours_end',
  learnFromInteractions: 'learn_from_interactions',
  analyzeAttachments: 'analyze_attachments',
  retentionWindow: 'retention_window',
  historyDays: 'history_days',
  reduceMotion: 'reduce_motion',
  audioBriefingVoice: 'audio_briefing_voice',
  audioBriefingSpeed: 'audio_briefing_speed',
}

/**
 * Partial preference update.
 *
 * The time zone lives on `profiles` rather than `user_preferences`, so it is
 * split out here — every scheduled job reads it from the profile, and having
 * two copies would eventually disagree. It is written where it belongs and is
 * *not* echoed back on the preferences row: the row has no such column, and the
 * answer used to imply it did.
 *
 * The write and the read-back are one statement, and it upserts rather than
 * updates. The row is seeded by the signup trigger, so a user who signed up
 * before this table existed has nothing to update — and the old code answered
 * that user with an empty object, which `mapUserPreferences` turned into a
 * `UserPreferences` of `undefined`s instead of an error anyone could see.
 */
serveFunction('preferences-update', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, preferencesUpdateRequest)
  const client = serviceClient()

  // Only the fields the caller actually sent: the patch is partial, and an
  // absent field means "leave it alone", not "reset it".
  const patch: Record<string, unknown> = { user_id: user.id }
  for (const [key, column] of Object.entries(COLUMN)) {
    const value = (body as Record<string, unknown>)[key]
    if (value !== undefined) patch[column] = value
  }

  if (body.timeZone !== undefined) {
    const { error } = await client
      .from('profiles')
      .update({ time_zone: body.timeZone })
      .eq('id', user.id)
    if (error) throw dbError(error)
  }

  const { data, error } = await client
    .from('user_preferences')
    .upsert(patch, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) throw dbError(error)

  const payload: PreferencesUpdateResponse = { preferences: data as Record<string, unknown> }

  return jsonResponse(payload, 200, origin)
})
