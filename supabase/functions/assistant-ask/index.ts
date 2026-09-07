import { assistantAnswerSchema, assistantAskRequestSchema } from '@da/validation'
import {
  AppError,
  approvalExpiryFrom,
  buildIdempotencyKey,
  endOfLocalDay,
  startOfLocalDay,
  systemClock,
} from '../_shared/domain.ts'
import { completeJson, isAiConfigured } from '../_shared/ai.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { checkAiBudget, consumeRateLimit, loadEntitlements } from '../_shared/limits.ts'
import { searchMemory } from '../_shared/memory.ts'
import { assistantContextBlock, assistantSystem } from '../_shared/prompts.ts'

const ASSISTANT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'citations', 'proposedAction', 'grounded', 'confidence'],
  properties: {
    answer: { type: 'string', maxLength: 4000 },
    citations: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceType', 'sourceId', 'label'],
        properties: {
          sourceType: {
            type: 'string',
            enum: [
              'email',
              'calendar_event',
              'task',
              'capture',
              'commitment',
              'notification',
              'contact',
            ],
          },
          sourceId: { type: 'string', maxLength: 100 },
          label: { type: 'string', maxLength: 160 },
        },
      },
    },
    proposedAction: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['type', 'what', 'why', 'draft'],
      properties: {
        type: {
          type: 'string',
          enum: [
            'email_send',
            'calendar_create',
            'calendar_update',
            'task_create',
            'reminder_create',
            'commitment_create',
          ],
        },
        what: { type: 'string', maxLength: 200 },
        why: { type: 'string', maxLength: 300 },
        draft: { type: 'object', additionalProperties: true },
      },
    },
    grounded: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
}

/**
 * The assistant turn.
 *
 * Two invariants:
 *
 *  - it answers from the user's own retrieved data, and any citation pointing
 *    at something that was not retrieved is dropped before the answer is
 *    returned — a fabricated source is worse than no source;
 *  - it never acts. A turn that asks for a write produces a *pending* approval
 *    and tells the user what it proposed.
 */
serveFunction('assistant-ask', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, assistantAskRequestSchema)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()

  await consumeRateLimit(user.id, 'assistant')
  const entitlements = await loadEntitlements(user.id, now)
  await checkAiBudget(user.id, entitlements, now)

  if (!isAiConfigured()) {
    throw new AppError('ai_unavailable', { detail: 'no_provider_configured' })
  }

  // Retrieval: semantic memory, plus today's calendar and open commitments,
  // which are what most questions actually turn on.
  const [memory, events, commitments] = await Promise.all([
    searchMemory(user.id, body.question, 8),
    client
      .from('calendar_events')
      .select('id, title, starts_at, ends_at, location')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .gte('ends_at', startOfLocalDay(now, profile.timeZone).toISOString())
      .lte('starts_at', endOfLocalDay(now, profile.timeZone).toISOString())
      .order('starts_at', { ascending: true })
      .limit(10),
    client
      .from('commitments')
      .select('id, text, person_name, due_at, direction')
      .eq('user_id', user.id)
      .in('status', ['open', 'overdue'])
      .limit(10),
  ])

  const chunks = [
    ...memory.hits.map((hit) => ({
      id: hit.sourceId,
      type: hit.sourceType,
      label: hit.sourceLabel,
      occurredAt: hit.occurredAt,
      content: hit.content,
    })),
    ...(events.data ?? []).map((row) => ({
      id: row.id as string,
      type: 'calendar_event',
      label: (row.title as string | null) ?? '',
      occurredAt: row.starts_at as string,
      content: `${row.title ?? ''} — ${row.starts_at} → ${row.ends_at}${
        row.location ? ` @ ${row.location}` : ''
      }`,
    })),
    ...(commitments.data ?? []).map((row) => ({
      id: row.id as string,
      type: 'commitment',
      label: (row.person_name as string | null) ?? '',
      occurredAt: (row.due_at as string | null) ?? null,
      content: `${row.direction === 'user_owes' ? 'Söz verdim' : 'Bana söz verildi'}: ${row.text}`,
    })),
  ]

  const answer = await completeJson({
    userId: user.id,
    operation: 'assistant_ask',
    parse: (value) => assistantAnswerSchema.safeParse(value),
    request: {
      tier: 'reasoning',
      schemaName: 'assistant_answer',
      jsonSchema: ASSISTANT_JSON_SCHEMA,
      system: assistantSystem({
        locale: profile.locale,
        nowIso: now.toISOString(),
        timeZone: profile.timeZone,
        userName: profile.givenName ?? profile.displayName,
      }),
      messages: [
        { role: 'user', content: assistantContextBlock(chunks) },
        { role: 'user', content: body.question },
      ],
      maxOutputTokens: 1200,
      temperature: 0.3,
    },
  })

  const knownIds = new Set(chunks.map((chunk) => chunk.id))
  const citations = answer.citations.filter((citation) => knownIds.has(citation.sourceId))

  // Ensure a thread exists so the conversation has somewhere to live.
  let threadId = body.threadId
  if (!threadId) {
    const created = await client
      .from('assistant_threads')
      .insert({
        user_id: user.id,
        title: body.question.slice(0, 80),
        last_message_at: now.toISOString(),
        message_count: 0,
      })
      .select('id')
      .single()
    if (created.error) throw dbError(created.error)
    threadId = created.data.id as string
  }

  await client.from('assistant_messages').insert({
    user_id: user.id,
    thread_id: threadId,
    role: 'user',
    content: body.question,
    citations: [],
    was_voice: body.wasVoice,
  })

  let proposedApprovalId: string | null = null
  if (answer.proposedAction) {
    const action = answer.proposedAction
    const created = await client
      .from('approval_actions')
      .upsert(
        {
          user_id: user.id,
          type: action.type,
          status: 'pending',
          what: action.what,
          why: action.why,
          source_type: 'user_input',
          source_id: threadId,
          payload: { kind: action.type, ...action.draft },
          original_payload: { kind: action.type, ...action.draft },
          idempotency_key: buildIdempotencyKey(
            user.id,
            action.type,
            `assistant:${threadId}:${now.getTime()}`,
          ),
          expires_at: approvalExpiryFrom(now),
        },
        { onConflict: 'user_id,idempotency_key' },
      )
      .select('id')
      .single()

    if (!created.error) {
      proposedApprovalId = created.data.id as string
      await audit({
        userId: user.id,
        action: 'approval.created',
        entityType: 'approval',
        entityId: proposedApprovalId,
        metadata: { type: action.type, origin: 'assistant' },
      })
    }
  }

  const assistantMessage = await client
    .from('assistant_messages')
    .insert({
      user_id: user.id,
      thread_id: threadId,
      role: 'assistant',
      content: answer.answer,
      citations,
      proposed_approval_id: proposedApprovalId,
      was_voice: false,
    })
    .select('id')
    .single()
  if (assistantMessage.error) throw dbError(assistantMessage.error)

  await client
    .from('assistant_threads')
    .update({ last_message_at: now.toISOString() })
    .eq('id', threadId)
    .eq('user_id', user.id)

  await audit({
    userId: user.id,
    action: 'assistant.query',
    entityType: 'assistant_thread',
    entityId: threadId,
    metadata: {
      grounded: answer.grounded && citations.length > 0,
      citations: citations.length,
      retrieved: chunks.length,
      voice: body.wasVoice,
      mode: memory.mode,
    },
  })

  return jsonResponse(
    {
      threadId,
      messageId: assistantMessage.data.id,
      answer: answer.answer,
      citations: citations.map((citation) => ({
        sourceType: citation.sourceType,
        sourceId: citation.sourceId,
        label: citation.label,
        occurredAt: chunks.find((chunk) => chunk.id === citation.sourceId)?.occurredAt ?? null,
      })),
      proposedApprovalId,
      // An answer with no surviving citation is reported as ungrounded, whatever
      // the model claimed about itself.
      grounded: answer.grounded && citations.length > 0,
    },
    200,
    origin,
  )
})
