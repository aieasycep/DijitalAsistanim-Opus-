import { z } from 'zod'
import { replyDraftSchema, uuidSchema } from '@da/validation'
import { AppError, HOUR_MS, systemClock } from '../_shared/domain.ts'
import { completeJson, isAiConfigured } from '../_shared/ai.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { checkAiBudget, consumeRateLimit, loadEntitlements, requireFeature } from '../_shared/limits.ts'
import { followUpNudgeSystem } from '../_shared/prompts.ts'

const requestSchema = z.object({
  followUpId: uuidSchema,
  action: z.enum(['draft', 'snooze', 'close']),
})

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
 * `close` and `snooze` are internal state and take effect immediately. `draft`
 * produces text only — the nudge is still sent through an approval, so the
 * engine can never chase someone on the user's behalf.
 */
serveFunction('followup-nudge', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
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

  if (body.action === 'close') {
    await client
      .from('follow_ups')
      .update({ status: 'closed', closed_at: now.toISOString() })
      .eq('id', body.followUpId)
      .eq('user_id', user.id)
    return jsonResponse({ status: 'closed', draft: null }, 200, origin)
  }

  if (body.action === 'snooze') {
    // Each dismissal widens the engine's patience; after enough of them it
    // stops proposing follow-ups on this thread entirely.
    await client
      .from('follow_ups')
      .update({
        dismiss_count: ((followUp.data.dismiss_count as number | null) ?? 0) + 1,
        due_at: new Date(now.getTime() + 24 * HOUR_MS).toISOString(),
      })
      .eq('id', body.followUpId)
      .eq('user_id', user.id)
    return jsonResponse({ status: 'snoozed', draft: null }, 200, origin)
  }

  const entitlements = await loadEntitlements(user.id, now)
  requireFeature(entitlements, 'smart_follow_up')
  await consumeRateLimit(user.id, 'replyDraft')

  if (!isAiConfigured()) throw new AppError('ai_unavailable', { detail: 'no_provider_configured' })
  await checkAiBudget(user.id, entitlements, now)

  const profile = await loadUserContext(user.id)
  const thread = await client
    .from('email_threads')
    .select('subject, summary, connected_account_id')
    .eq('id', followUp.data.thread_id as string)
    .eq('user_id', user.id)
    .maybeSingle()
  if (thread.error) throw dbError(thread.error)

  const daysSilent = Math.max(
    1,
    Math.floor((now.getTime() - new Date(followUp.data.sent_at as string).getTime()) / (24 * HOUR_MS)),
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

  await client
    .from('follow_ups')
    .update({ status: 'nudged' })
    .eq('id', body.followUpId)
    .eq('user_id', user.id)

  return jsonResponse(
    {
      status: 'drafted',
      draft,
      threadId: followUp.data.thread_id,
      connectedAccountId: thread.data?.connected_account_id ?? null,
      to: [followUp.data.recipient_email],
    },
    200,
    origin,
  )
})
