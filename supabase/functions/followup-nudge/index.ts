import { followupNudgeRequest, replyDraftSchema, type FollowupNudgeResponse } from '@da/validation'
import { AppError, HOUR_MS, systemClock } from '../_shared/domain.ts'
import { completeJson, isAiConfigured } from '../_shared/ai.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import {
  checkAiBudget,
  consumeRateLimit,
  loadEntitlements,
  requireFeature,
} from '../_shared/limits.ts'
import { followUpNudgeSystem } from '../_shared/prompts.ts'

const NUDGE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'body', 'tone', 'openQuestions'],
  properties: {
    subject: { type: 'string', maxLength: 300 },
    body: { type: 'string', maxLength: 8000 },
    tone: { type: 'string', enum: ['short', 'professional', 'friendly', 'detailed'] },
    openQuestions: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 200 } },
  },
}

/**
 * Act on a surfaced follow-up.
 *
 * The actions are the domain's own — `draft_nudge`, `remind_tomorrow`,
 * `close` — so the three buttons on the card, the vocabulary on the wire and
 * `FOLLOW_UP_ACTIONS` in `@da/domain` are one list rather than three.
 *
 * `remind_tomorrow` and `close` are internal state and take effect
 * immediately; both answer with the stored row, so the app shows what the
 * database now holds rather than what it assumed the write did. `draft_nudge`
 * produces text only — the nudge is still sent through an approval, so the
 * engine can never chase someone on the user's behalf.
 */
serveFunction('followup-nudge', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, followupNudgeRequest)
  const now = systemClock.now()
  const client = serviceClient()

  const followUp = await client
    .from('follow_ups')
    .select('id, thread_id, recipient_email, recipient_name, sent_at, dismiss_count')
    .eq('id', body.followUpId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (followUp.error) throw dbError(followUp.error)
  if (!followUp.data) throw new AppError('not_found', { detail: 'followup_missing' })

  /**
   * Write the change and read back what was stored.
   *
   * The user filter is repeated on the update itself rather than trusted from
   * the select above: the service client bypasses RLS, so the ownership check
   * has to be part of every statement it runs.
   */
  const apply = async (patch: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const updated = await client
      .from('follow_ups')
      .update(patch)
      .eq('id', body.followUpId)
      .eq('user_id', user.id)
      .select('*')
      .single()
    if (updated.error) throw dbError(updated.error)
    return updated.data
  }

  if (body.action === 'close') {
    const payload: FollowupNudgeResponse = {
      followUp: await apply({ status: 'closed', closed_at: now.toISOString() }),
      draft: null,
    }
    return jsonResponse(payload, 200, origin)
  }

  if (body.action === 'remind_tomorrow') {
    // Each dismissal widens the engine's patience, and `detect-followups`
    // stops watching the thread once the domain has had enough of them. The
    // instant itself is the caller's: `nextWorkingDay` decided it, in the
    // user's zone, on the app's clock.
    const payload: FollowupNudgeResponse = {
      followUp: await apply({
        dismiss_count: ((followUp.data.dismiss_count as number | null) ?? 0) + 1,
        due_at: body.remindAt,
      }),
      draft: null,
    }
    return jsonResponse(payload, 200, origin)
  }

  const entitlements = await loadEntitlements(user.id, now)
  requireFeature(entitlements, 'smart_follow_up')
  await consumeRateLimit(user.id, 'replyDraft')

  if (!isAiConfigured()) throw new AppError('ai_unavailable', { detail: 'no_provider_configured' })
  await checkAiBudget(user.id, entitlements, now)

  const profile = await loadUserContext(user.id)
  const thread = await client
    .from('email_threads')
    .select('subject, summary')
    .eq('id', followUp.data.thread_id as string)
    .eq('user_id', user.id)
    .maybeSingle()
  if (thread.error) throw dbError(thread.error)

  const daysSilent = Math.max(
    1,
    Math.floor(
      (now.getTime() - new Date(followUp.data.sent_at as string).getTime()) / (24 * HOUR_MS),
    ),
  )

  const draft = await completeJson({
    userId: user.id,
    operation: 'followup_nudge',
    parse: (value) => replyDraftSchema.safeParse(value),
    request: {
      tier: 'fast',
      schemaName: 'reply_draft',
      jsonSchema: NUDGE_JSON_SCHEMA,
      system: followUpNudgeSystem({
        locale: profile.locale,
        recipientName:
          (followUp.data.recipient_name as string | null) ??
          (followUp.data.recipient_email as string),
        daysSilent,
      }),
      messages: [
        {
          role: 'user',
          content: `KONU: ${thread.data?.subject ?? ''}\nÖZET: ${thread.data?.summary ?? ''}`,
        },
      ],
      maxOutputTokens: 600,
      temperature: 0.5,
    },
  })

  const payload: FollowupNudgeResponse = {
    followUp: await apply({ status: 'nudged' }),
    draft: { followUpId: body.followUpId, subject: draft.subject, body: draft.body },
  }
  return jsonResponse(payload, 200, origin)
})
