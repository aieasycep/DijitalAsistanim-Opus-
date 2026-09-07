import {
  evaluateFollowUp,
  followUpDueAt,
  looksLikeReplyExpected,
  systemClock,
} from '../_shared/domain.ts'
import { dbError, requireServiceSecret, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'

/**
 * The follow-up sweep.
 *
 * Runs hourly over sent mail that expects an answer. Two things it must get
 * right: a thread that received a reply stops being watched immediately, and a
 * user who has dismissed a nudge is backed off from rather than asked again.
 */
serveFunction('detect-followups', async ({ request, origin }) => {
  await requireServiceSecret(request, 'CRON_SECRET')
  const now = systemClock.now()
  const client = serviceClient()

  // Close anything the other side has since answered.
  const waiting = await client
    .from('follow_ups')
    .select('id, user_id, thread_id, sent_at, dismiss_count')
    .eq('status', 'waiting')
    .limit(500)
  if (waiting.error) throw dbError(waiting.error)

  let replied = 0
  let surfaced = 0

  for (const row of waiting.data ?? []) {
    const inbound = await client
      .from('email_messages')
      .select('id')
      .eq('user_id', row.user_id as string)
      .eq('thread_id', row.thread_id as string)
      .eq('is_from_user', false)
      .gt('sent_at', row.sent_at as string)
      .limit(1)

    if ((inbound.data ?? []).length > 0) {
      await client
        .from('follow_ups')
        .update({ status: 'replied', replied_at: now.toISOString() })
        .eq('id', row.id as string)
      replied++
      continue
    }

    const profile = await client
      .from('profiles')
      .select('time_zone')
      .eq('id', row.user_id as string)
      .maybeSingle()

    const verdict = evaluateFollowUp(
      {
        sentAt: row.sent_at as string,
        expectsReply: true,
        recipientIsVip: false,
        importance: 'normal',
        dismissCount: (row.dismiss_count as number | null) ?? 0,
        repliedAt: null,
        closedAt: null,
      },
      now,
      (profile.data?.time_zone as string | null) ?? 'Europe/Istanbul',
    )

    if (verdict.shouldSurface) surfaced++
  }

  // Start watching sent mail that asks for something and is not yet tracked.
  const sent = await client
    .from('email_messages')
    .select('id, user_id, thread_id, to_emails, body_text, snippet, sent_at, external_message_id')
    .eq('is_from_user', true)
    .gte('sent_at', new Date(now.getTime() - 14 * 86_400_000).toISOString())
    .order('sent_at', { ascending: false })
    .limit(300)
  if (sent.error) throw dbError(sent.error)

  let created = 0
  for (const row of sent.data ?? []) {
    const text = ((row.body_text as string | null) ?? (row.snippet as string | null) ?? '').slice(
      0,
      4000,
    )
    if (!looksLikeReplyExpected(text)) continue

    const recipients = (row.to_emails as string[] | null) ?? []
    const recipient = recipients[0]
    if (!recipient) continue

    const profile = await client
      .from('profiles')
      .select('time_zone')
      .eq('id', row.user_id as string)
      .maybeSingle()

    const dueAt = followUpDueAt(
      {
        sentAt: row.sent_at as string,
        expectsReply: true,
        recipientIsVip: false,
        importance: 'normal',
        dismissCount: 0,
        repliedAt: null,
        closedAt: null,
      },
      (profile.data?.time_zone as string | null) ?? 'Europe/Istanbul',
    )
    if (!dueAt) continue

    const { error } = await client.from('follow_ups').upsert(
      {
        user_id: row.user_id as string,
        thread_id: row.thread_id as string,
        message_id: (row.external_message_id as string | null) ?? (row.id as string),
        recipient_email: recipient,
        recipient_name: null,
        sent_at: row.sent_at as string,
        due_at: dueAt,
        status: 'waiting',
        dismiss_count: 0,
      },
      { onConflict: 'user_id,thread_id,message_id', ignoreDuplicates: true },
    )
    if (!error) created++
  }

  return jsonResponse({ replied, surfaced, created }, 200, origin)
})
