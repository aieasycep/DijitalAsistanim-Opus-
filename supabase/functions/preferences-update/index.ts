import { updatePreferencesRequestSchema } from '@da/validation'
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
 * two copies would eventually disagree.
 */
serveFunction('preferences-update', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, updatePreferencesRequestSchema)
  const client = serviceClient()

  const patch: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(COLUMN)) {
    const value = (body as Record<string, unknown>)[key]
    if (value !== undefined) patch[column] = value
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await client.from('user_preferences').update(patch).eq('user_id', user.id)
    if (error) throw dbError(error)
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
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw dbError(error)

  const profile = await client.from('profiles').select('time_zone').eq('id', user.id).maybeSingle()

  return jsonResponse(
    { preferences: { ...(data ?? {}), time_zone: profile.data?.time_zone ?? null } },
    200,
    origin,
  )
})
