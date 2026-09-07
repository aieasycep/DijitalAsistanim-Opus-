import { z } from 'zod'
import { replyDraftSchema, uuidSchema } from '@da/validation'
import { AppError, systemClock } from '../_shared/domain.ts'
import { completeJson, isAiConfigured, truncateForModel } from '../_shared/ai.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { checkAiBudget, consumeRateLimit, loadEntitlements } from '../_shared/limits.ts'
import { replyDraftSystem } from '../_shared/prompts.ts'

const requestSchema = z.object({
  threadId: uuidSchema,
  tone: z.enum(['short', 'professional', 'friendly', 'detailed']).default('professional'),
  instruction: z.string().max(500).nullish(),
})

const REPLY_JSON_SCHEMA: Record<string, unknown> = {
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
 * Draft a reply.
 *
 * This function never sends. It produces text the user reads, edits and then
 * approves — sending only ever happens through an executed approval, which is
 * the whole point of separating the two.
 */
serveFunction('reply-draft', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()

  await consumeRateLimit(user.id, 'replyDraft')
  const entitlements = await loadEntitlements(user.id, now)
  await checkAiBudget(user.id, entitlements, now)

  if (!isAiConfigured()) {
    throw new AppError('ai_unavailable', { detail: 'no_provider_configured' })
  }

  const thread = await client
    .from('email_threads')
    .select('id, subject, summary, connected_account_id')
    .eq('id', body.threadId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (thread.error) throw dbError(thread.error)
  if (!thread.data) throw new AppError('not_found', { detail: 'thread_missing' })

  const messages = await client
    .from('email_messages')
    .select(
      'from_email, from_name, to_emails, body_text, snippet, sent_at, is_from_user, external_message_id',
    )
    .eq('thread_id', body.threadId)
    .eq('user_id', user.id)
    .order('sent_at', { ascending: false })
    .limit(4)
  if (messages.error) throw dbError(messages.error)

  const ordered = [...(messages.data ?? [])].reverse()
  const transcript = ordered
    .map(
      (m) =>
        `${m.is_from_user ? 'BEN' : (m.from_name ?? m.from_email)} (${m.sent_at}):\n${truncateForModel(
          (m.body_text as string | null) ?? (m.snippet as string | null) ?? '',
          3000,
        )}`,
    )
    .join('\n\n---\n\n')

  const draft = await completeJson({
    userId: user.id,
    operation: 'reply_draft',
    parse: (value) => replyDraftSchema.safeParse(value),
    request: {
      tier: 'reasoning',
      schemaName: 'reply_draft',
      jsonSchema: REPLY_JSON_SCHEMA,
      system: replyDraftSystem({
        locale: profile.locale,
        tone: body.tone,
        userName: profile.givenName ?? profile.displayName,
        userEmail: user.email ?? '',
      }),
      messages: [
        {
          role: 'user',
          content: [
            `KONU: ${thread.data.subject ?? ''}`,
            body.instruction ? `KULLANICININ NOTU: ${body.instruction}` : '',
            '',
            'KONUŞMA:',
            transcript,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      maxOutputTokens: 1500,
      temperature: 0.5,
    },
  })

  const lastInbound = ordered.filter((m) => !m.is_from_user).at(-1)

  return jsonResponse(
    {
      draft,
      threadId: body.threadId,
      connectedAccountId: thread.data.connected_account_id,
      // Everything the approval payload needs, so the client does not have to
      // guess who the reply goes to.
      to: lastInbound ? [lastInbound.from_email] : [],
      inReplyToMessageId: lastInbound?.external_message_id ?? null,
    },
    200,
    origin,
  )
})
