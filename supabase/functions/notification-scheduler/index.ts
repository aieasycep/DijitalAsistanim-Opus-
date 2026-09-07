import {
  type BriefingKind,
  MINUTE_MS,
  systemClock,
  toIsoDate,
  toZonedParts,
} from '../_shared/domain.ts'
import { dbError, requireServiceSecret, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'
import { sendPush } from '../_shared/push.ts'
import { briefingStats, buildBriefing, collectBriefingInputs } from '../_shared/briefing-builder.ts'

/**
 * The scheduler, run every few minutes by cron.
 *
 * Three jobs: fire briefings whose local time has just passed, fire reminders
 * that have come due, and warn about imminent meetings. Everything goes out
 * through `sendPush`, which already enforces quiet hours, per-category
 * preferences and once-only delivery — reimplementing any of that here would
 * be how the two copies eventually disagree.
 */

/** How wide a window counts as "just passed". Must exceed the cron interval. */
const WINDOW_MINUTES = 10

interface UserRow {
  user_id: string
  time_zone: string
  locale: string
  given_name: string | null
  display_name: string | null
  morning_briefing_time: string | null
  midday_pulse_enabled: boolean | null
  midday_pulse_time: string | null
  evening_close_enabled: boolean | null
  evening_close_time: string | null
  weekly_review_enabled: boolean | null
  weekly_review_weekday: number | null
  weekly_review_time: string | null
  briefing_on_weekends: boolean | null
  quiet_days: number[] | null
}

/** Minutes past local midnight for a Postgres `time` value. */
function minutesOf(value: string | null): number | null {
  if (!value) return null
  const [h, m] = value.split(':')
  const hours = Number(h)
  const minutes = Number(m)
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null
}

function justPassed(target: number | null, currentMinutes: number): boolean {
  if (target === null) return false
  const delta = currentMinutes - target
  return delta >= 0 && delta < WINDOW_MINUTES
}

serveFunction('notification-scheduler', async ({ request, origin }) => {
  await requireServiceSecret(request, 'CRON_SECRET')
  const now = systemClock.now()
  const client = serviceClient()

  const users = await client.from('user_preferences').select(
    `user_id, morning_briefing_time, midday_pulse_enabled, midday_pulse_time,
     evening_close_enabled, evening_close_time, weekly_review_enabled,
     weekly_review_weekday, weekly_review_time, briefing_on_weekends, quiet_days,
     profiles!inner(time_zone, locale, given_name, display_name)`,
  )
  if (users.error) throw dbError(users.error)

  let briefingsSent = 0
  let remindersSent = 0
  let meetingsSent = 0

  for (const raw of users.data ?? []) {
    const profile = (raw as unknown as { profiles: Record<string, unknown> }).profiles
    const row: UserRow = {
      user_id: raw.user_id as string,
      time_zone: (profile?.time_zone as string | null) ?? 'Europe/Istanbul',
      locale: (profile?.locale as string | null) ?? 'tr',
      given_name: (profile?.given_name as string | null) ?? null,
      display_name: (profile?.display_name as string | null) ?? null,
      morning_briefing_time: raw.morning_briefing_time as string | null,
      midday_pulse_enabled: raw.midday_pulse_enabled as boolean | null,
      midday_pulse_time: raw.midday_pulse_time as string | null,
      evening_close_enabled: raw.evening_close_enabled as boolean | null,
      evening_close_time: raw.evening_close_time as string | null,
      weekly_review_enabled: raw.weekly_review_enabled as boolean | null,
      weekly_review_weekday: raw.weekly_review_weekday as number | null,
      weekly_review_time: raw.weekly_review_time as string | null,
      briefing_on_weekends: raw.briefing_on_weekends as boolean | null,
      quiet_days: raw.quiet_days as number[] | null,
    }

    const parts = toZonedParts(now, row.time_zone)
    const currentMinutes = parts.hour * 60 + parts.minute
    const isWeekend = parts.weekday === 0 || parts.weekday === 6
    const quiet =
      (row.quiet_days ?? []).includes(parts.weekday) ||
      (isWeekend && row.briefing_on_weekends === false)

    if (quiet) continue

    const due: BriefingKind[] = []
    if (justPassed(minutesOf(row.morning_briefing_time), currentMinutes)) due.push('morning')
    if (row.midday_pulse_enabled && justPassed(minutesOf(row.midday_pulse_time), currentMinutes)) {
      due.push('midday')
    }
    if (
      row.evening_close_enabled &&
      justPassed(minutesOf(row.evening_close_time), currentMinutes)
    ) {
      due.push('evening')
    }
    if (
      row.weekly_review_enabled &&
      parts.weekday === (row.weekly_review_weekday ?? 0) &&
      justPassed(minutesOf(row.weekly_review_time), currentMinutes)
    ) {
      due.push('weekly')
    }

    for (const kind of due) {
      try {
        const forDate = toIsoDate(now, row.time_zone)
        const collected = await collectBriefingInputs(
          row.user_id,
          kind,
          forDate,
          row.time_zone,
          now,
        )

        // The midday pulse only exists to report change.
        if (kind === 'midday') {
          const morning = await client
            .from('briefings')
            .select('content_hash')
            .eq('user_id', row.user_id)
            .eq('kind', 'morning')
            .eq('for_date', forDate)
            .maybeSingle()
          if (collected.isEmpty || morning.data?.content_hash === collected.contentHash) continue
        }

        const built = await buildBriefing(
          row.user_id,
          kind,
          row.locale === 'en' ? 'en' : 'tr',
          row.given_name ?? row.display_name,
          row.time_zone,
          now,
          collected.inputs,
        )

        const saved = await client
          .from('briefings')
          .upsert(
            {
              user_id: row.user_id,
              kind,
              for_date: forDate,
              status: 'ready',
              headline: built.headline,
              narrative: built.narrative,
              duration_seconds: built.durationSeconds,
              generated_at: now.toISOString(),
              content_hash: collected.contentHash,
              stats: briefingStats(collected.inputs),
            },
            { onConflict: 'user_id,kind,for_date' },
          )
          .select('id')
          .single()

        if (saved.error) continue
        const briefingId = saved.data.id as string

        await client.from('briefing_items').delete().eq('briefing_id', briefingId)
        if (built.items.length > 0) {
          await client.from('briefing_items').insert(
            built.items.map((item, index) => ({
              user_id: row.user_id,
              briefing_id: briefingId,
              section: item.section,
              position: index,
              title: item.title,
              detail: item.detail,
              source_type: item.sourceType,
              source_id: item.sourceId,
              related_entity_type: item.sourceType,
              related_entity_id: item.sourceId,
              importance: item.importance,
            })),
          )
        }

        const category =
          kind === 'morning'
            ? 'morning_briefing'
            : kind === 'midday'
              ? 'midday_pulse'
              : kind === 'evening'
                ? 'evening_close'
                : 'weekly_review'

        const outcome = await sendPush(
          {
            userId: row.user_id,
            category,
            title: built.headline,
            body:
              built.narrative.split(/(?<=\.)\s/)[0]?.slice(0, 140) ?? built.narrative.slice(0, 140),
            path: `briefing/${kind}`,
            dedupeKey: `${kind}:${forDate}`,
            data: { briefingId },
          },
          now,
        )
        if (outcome.sent) briefingsSent++
      } catch {
        // One user's briefing failing must not stop the sweep.
      }
    }
  }

  // ── Reminders that have come due ──────────────────────────────────────────
  const reminders = await client
    .from('reminders')
    .select('id, user_id, title, body, category, related_entity_type, related_entity_id')
    .eq('status', 'scheduled')
    .lte('remind_at', now.toISOString())
    .limit(200)
  if (reminders.error) throw dbError(reminders.error)

  for (const reminder of reminders.data ?? []) {
    const outcome = await sendPush(
      {
        userId: reminder.user_id as string,
        category: (reminder.category as 'deadline' | null) ?? 'deadline',
        title: (reminder.title as string | null) ?? '',
        body: (reminder.body as string | null) ?? '',
        path:
          reminder.related_entity_type === 'email'
            ? `thread/${reminder.related_entity_id}`
            : reminder.related_entity_type === 'calendar_event'
              ? `event/${reminder.related_entity_id}`
              : 'today',
        dedupeKey: `reminder:${reminder.id}`,
      },
      now,
    )
    // Marked fired either way: a reminder suppressed by quiet hours has still
    // had its moment, and re-firing it later would be worse than missing it.
    await client
      .from('reminders')
      .update({ status: 'fired', fired_at: now.toISOString() })
      .eq('id', reminder.id as string)
    if (outcome.sent) remindersSent++
  }

  // ── Meetings starting soon ────────────────────────────────────────────────
  const soon = new Date(now.getTime() + 15 * MINUTE_MS)
  const meetings = await client
    .from('calendar_events')
    .select('id, user_id, title, starts_at, location')
    .neq('status', 'cancelled')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', soon.toISOString())
    .limit(200)
  if (meetings.error) throw dbError(meetings.error)

  for (const meeting of meetings.data ?? []) {
    const outcome = await sendPush(
      {
        userId: meeting.user_id as string,
        category: 'meeting',
        title: (meeting.title as string | null) ?? '',
        body: (meeting.location as string | null) ?? '',
        path: `meeting/${meeting.id}`,
        dedupeKey: `meeting:${meeting.id}`,
      },
      now,
    )
    if (outcome.sent) meetingsSent++
  }

  return jsonResponse({ briefingsSent, remindersSent, meetingsSent }, 200, origin)
})
