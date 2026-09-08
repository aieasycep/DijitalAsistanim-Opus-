import { replyDraftRequest, replyDraftSchema, type ReplyDraftResponse } from '@da/validation'
import { AppError, systemClock } from '../_shared/domain.ts'
import { completeJson, isAiConfigured, truncateForModel } from '../_shared/ai.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { checkAiBudget, consumeRateLimit, loadEntitlements } from '../_shared/limits.ts'
import { replyDraftSystem } from '../_shared/prompts.ts'

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

/** One message of the conversation, as far as this function needs it. */
interface ThreadMessage {
  fromEmail: string
  fromName: string | null
  toEmails: string[]
  text: string
  sentAt: string
  isFromUser: boolean
  externalMessageId: string | null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * What the wire calls an address. The contract parses `to` with the approval
 * payload's own email schema, so anything this lets through has to survive
 * that — a display name or an empty slot in the column is dropped here rather
 * than failing the whole draft on the device.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The approval payload accepts at most this many recipients. */
const MAX_RECIPIENTS = 25

/**
 * The addresses the reply goes to, first non-empty answer wins:
 *
 *  1. whoever wrote the last message that was not the user's — the person
 *     actually being answered;
 *  2. failing that (the user wrote last), whoever that message was sent to;
 *  3. failing that, the thread's participants.
 *
 * The user's own address is removed from every candidate list, because a reply
 * addressed to yourself is the kind of thing that only ever ships once.
 */
function resolveRecipients(
  messages: readonly ThreadMessage[],
  participants: readonly string[],
  selfEmail: string,
): string[] {
  const lastInbound = messages.filter((message) => !message.isFromUser).at(-1)
  const lastMessage = messages.at(-1)
  const candidates = lastInbound
    ? [lastInbound.fromEmail]
    : (lastMessage?.toEmails ?? []).concat(participants)

  const seen = new Set<string>()
  const recipients: string[] = []
  for (const candidate of candidates) {
    const email = candidate.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(email) || email === selfEmail || seen.has(email)) continue
    seen.add(email)
    recipients.push(email)
    if (recipients.length === MAX_RECIPIENTS) break
  }
  return recipients
}

/**
 * Draft a reply.
 *
 * This function never sends. It produces text the user reads, edits and then
 * approves — sending only ever happens through an executed approval, which is
 * the whole point of separating the two.
 *
 * It answers with the draft flattened into the envelope, alongside the mailbox,
 * the recipients and the message being replied to: the composer turns that
 * straight into an `email_send` approval instead of guessing any of it from the
 * thread row, which is how replies used to end up addressed to the user and
 * detached from their conversation.
 */
serveFunction('reply-draft', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, replyDraftRequest)
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
    .select('id, subject, summary, connected_account_id, participant_emails')
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

  // Oldest first: the model reads a conversation, not a stack.
  const ordered: ThreadMessage[] = [...(messages.data ?? [])].reverse().map((row) => ({
    fromEmail: asString(row.from_email) ?? '',
    fromName: asString(row.from_name),
    toEmails: asEmails(row.to_emails),
    text: asString(row.body_text) ?? asString(row.snippet) ?? '',
    sentAt: asString(row.sent_at) ?? '',
    isFromUser: row.is_from_user === true,
    externalMessageId: asString(row.external_message_id),
  }))

  const selfEmail = (user.email ?? '').trim().toLowerCase()
  const recipients = resolveRecipients(ordered, asEmails(thread.data.participant_emails), selfEmail)
  if (recipients.length === 0) {
    throw new AppError('not_found', { detail: 'reply_recipient_missing' })
  }

  // The mailbox the reply leaves from. A thread with no account behind it can
  // be read but not answered, and the composer needs to hear that now.
  const connectedAccountId = asString(thread.data.connected_account_id)
  if (!connectedAccountId) {
    throw new AppError('not_found', { detail: 'thread_account_missing' })
  }

  const transcript = ordered
    .map(
      (message) =>
        `${message.isFromUser ? 'BEN' : (message.fromName ?? message.fromEmail)} (${
          message.sentAt
        }):\n${truncateForModel(message.text, 3000)}`,
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
            `KONU: ${asString(thread.data.subject) ?? ''}`,
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

  // The reply continues the newest message in the thread, whoever wrote it —
  // that is what keeps it in the conversation the user is looking at.
  const lastMessage = ordered.at(-1)

  const payload: ReplyDraftResponse = {
    threadId: body.threadId,
    connectedAccountId,
    subject: draft.subject,
    body: draft.body,
    tone: draft.tone,
    to: recipients,
    inReplyToMessageId: lastMessage?.externalMessageId ?? null,
    openQuestions: draft.openQuestions,
    // A draft that left a blank for the user is not one we can call grounded.
    grounded: draft.openQuestions.length === 0,
  }

  return jsonResponse(payload, 200, origin)
})
