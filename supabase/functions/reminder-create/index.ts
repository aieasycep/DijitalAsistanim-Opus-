import { reminderCreateRequest, type ReminderCreateResponse } from '@da/validation'
import { AppError, DAY_MS, resolveReminderTime, systemClock } from '../_shared/domain.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * Set a reminder the user asked for.
 *
 * A reminder fires a notification and nothing leaves the app, so — like a
 * commitment — it takes effect immediately rather than through an approval:
 * the approval requirement covers external side effects, not the user asking
 * to be reminded of something.
 *
 * The instant is resolved here rather than on the device because all three
 * inputs live on this side:
 *
 *   - the user's own morning and evening, from `user_preferences`, so "this
 *     evening" means their evening and not a constant compiled into the app;
 *   - the quiet hours from `notification_preferences` — deliberately those and
 *     not the briefing quiet hours, because `sendPush` suppresses a delivery
 *     that lands inside *them*. A reminder scheduled into that window would be
 *     stored, would look set, and would never reach the user;
 *   - the calendar, for the `smart` preset, which looks for a gap between
 *     meetings.
 *
 * `resolveReminderTime` in `@da/domain` does the arithmetic for all of them,
 * and its answer travels back whole so the app can tell the user *why* the
 * reminder fires when it does.
 */

/** How far ahead the `smart` preset looks for a gap; it searches today and tomorrow. */
const SMART_LOOKAHEAD_MS = 2 * DAY_MS

/**
 * Postgres renders a `time` column as `HH:MM:SS`; the domain's clock helpers
 * parse `HH:MM` and throw on anything else, so the seconds are trimmed here
 * rather than at each call site.
 */
function localTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value)
  return match ? `${match[1]}:${match[2]}` : null
}

interface BusyRow {
  starts_at: string
  ends_at: string
}

serveFunction('reminder-create', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, reminderCreateRequest)
  const profile = await loadUserContext(user.id)
  const timeZone = body.timeZone ?? profile.timeZone
  const now = systemClock.now()

  const client = serviceClient()
  const [hours, quiet] = await Promise.all([
    client
      .from('user_preferences')
      .select('morning_briefing_time, evening_close_time')
      .eq('user_id', user.id)
      .maybeSingle(),
    client
      .from('notification_preferences')
      .select('quiet_hours_start, quiet_hours_end')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (hours.error) throw dbError(hours.error)
  if (quiet.error) throw dbError(quiet.error)
  // Both rows are created by `handle_new_user`; an account without preferences
  // is a broken account, and guessing a morning for it would put the reminder
  // at an hour the user never chose.
  if (!hours.data) throw new AppError('not_found', { detail: 'preferences_missing' })

  const morningTime = localTime(hours.data.morning_briefing_time)
  const eveningTime = localTime(hours.data.evening_close_time)
  if (!morningTime || !eveningTime) {
    throw new AppError('server_unavailable', { detail: 'unreadable_preference_time' })
  }

  const windows = {
    morningTime,
    eveningTime,
    // Null means the user set no quiet hours, which is exactly how `sendPush`
    // reads the same two columns.
    quietHoursStart: localTime(quiet.data?.quiet_hours_start),
    quietHoursEnd: localTime(quiet.data?.quiet_hours_end),
  }

  // Only the `smart` preset consults the calendar, so only it pays for the query.
  let busy: { startsAt: string; endsAt: string }[] = []
  if (body.preset === 'smart') {
    const events = await client
      .from('calendar_events')
      .select('starts_at, ends_at')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .eq('is_all_day', false)
      .gte('ends_at', now.toISOString())
      .lte('starts_at', new Date(now.getTime() + SMART_LOOKAHEAD_MS).toISOString())
      .order('starts_at', { ascending: true })

    if (events.error) throw dbError(events.error)
    busy = ((events.data ?? []) as BusyRow[]).map((row) => ({
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    }))
  }

  const resolution = resolveReminderTime({
    preset: body.preset,
    now,
    timeZone,
    windows,
    // `customAt` is required by the contract for the `custom` preset and
    // ignored by every other one.
    ...(body.customAt === null ? {} : { customAt: body.customAt }),
    ...(busy.length === 0 ? {} : { busy }),
  })

  /**
   * Inserted, not upserted. `reminders_user_entity_time_key` is a partial
   * unique index, whose predicate PostgREST cannot express as a conflict
   * target, so naming one would describe a statement the database was never
   * asked to run. The index still does its work as a constraint: asking twice
   * for the same reminder about the same record at the same instant is
   * reported as a conflict instead of nudging the user twice.
   */
  const { data, error } = await client
    .from('reminders')
    .insert({
      user_id: user.id,
      title: body.title,
      body: body.body,
      remind_at: resolution.remindAt,
      preset: body.preset,
      related_entity_type: body.relatedEntityType,
      related_entity_id: body.relatedEntityId,
      status: 'scheduled',
      // The user asked to be told, so the nudge survives "only notify me if it
      // is important" — the same category the approval executor files a
      // reminder under.
      category: 'deadline',
    })
    .select('*')
    .single()

  if (error) throw dbError(error)

  const payload: ReminderCreateResponse = { reminder: data, resolution }
  return jsonResponse(payload, 200, origin)
})
