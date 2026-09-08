import {
  assistantAnswerSchema,
  assistantAskRequest,
  assistantProposedAction,
  assistantSourceType,
  type AssistantAskResponse,
  type AssistantCitation,
  type AssistantProposedAction,
} from '@da/validation'
import {
  AppError,
  approvalExpiryFrom,
  buildIdempotencyKey,
  endOfLocalDay,
  startOfLocalDay,
  systemClock,
  type AccountKind,
  type ApprovalActionType,
  type SourceType,
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

/** One retrieved record the model was allowed to read, and may cite. */
interface RetrievedChunk {
  id: string
  type: SourceType
  label: string
  occurredAt: string | null
  content: string
}

/** What a stored calendar event contributes to a `calendar_update` proposal. */
interface EventHandle {
  connectedAccountId: string | null
  externalEventId: string
  providerUpdatedAt: string | null
}

/**
 * The facts a draft needs that the model has no way of knowing.
 *
 * Account ids and provider event ids are never put in front of the model — it
 * could only invent them — so they are filled in here, from the caller's own
 * rows, before the draft is validated.
 */
interface DraftContext {
  mailAccountId: string | null
  calendarAccountId: string | null
  tasksAccountId: string | null
  timeZone: string
  events: ReadonlyMap<string, EventHandle>
}

/**
 * Complete a model draft with the fields the server owns.
 *
 * These are overwritten rather than defaulted: which mailbox a message leaves
 * from, and which provider event an update rewrites, are decisions the caller's
 * data makes, not decisions a sentence in a prompt can make. Anything the
 * server cannot supply is left absent, which is a rejection one step later —
 * an approval whose payload does not parse is never written.
 */
function completeDraft(
  type: ApprovalActionType,
  draft: Record<string, unknown>,
  context: DraftContext,
): Record<string, unknown> {
  switch (type) {
    case 'email_send':
      return { ...draft, connectedAccountId: context.mailAccountId }
    case 'calendar_create':
      return {
        ...draft,
        connectedAccountId: context.calendarAccountId,
        timeZone: context.timeZone,
      }
    case 'calendar_update': {
      // Only an event that was actually retrieved can be rewritten: the id is
      // the one part of the draft that can be checked against the database.
      const event =
        typeof draft.eventId === 'string' ? context.events.get(draft.eventId) : undefined
      if (!event) return draft
      return {
        ...draft,
        connectedAccountId: event.connectedAccountId,
        externalEventId: event.externalEventId,
        expectedProviderUpdatedAt: event.providerUpdatedAt,
      }
    }
    case 'task_create':
      return { ...draft, connectedAccountId: context.tasksAccountId }
    // A reminder and a commitment are local records; no account is involved.
    case 'reminder_create':
    case 'commitment_create':
      return draft
  }
}

/**
 * The assistant turn.
 *
 * Three invariants:
 *
 *  - it answers from the user's own retrieved data, and any citation pointing
 *    at something that was not retrieved is dropped before the answer is
 *    returned — a fabricated source is worse than no source;
 *  - it never acts. A turn that asks for a write produces a *pending* approval
 *    and tells the user what it proposed;
 *  - it never decides *which* write. The action type the model declared is
 *    authoritative, the draft is validated against that type's payload schema,
 *    and a draft that does not satisfy it fails the turn instead of becoming an
 *    approval card for something else.
 */
serveFunction('assistant-ask', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, assistantAskRequest)
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
  // which are what most questions actually turn on. The connected accounts ride
  // along because a proposed write needs one, and asking for them here costs
  // nothing next to the model call.
  const [memory, events, commitments, accounts] = await Promise.all([
    searchMemory(user.id, body.question, 8),
    client
      .from('calendar_events')
      .select(
        'id, title, starts_at, ends_at, location, connected_account_id, external_event_id, provider_updated_at',
      )
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
    client
      .from('connected_accounts')
      .select('id, kinds')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .order('is_primary', { ascending: false }),
  ])

  const chunks: RetrievedChunk[] = [
    ...memory.hits.flatMap((hit): RetrievedChunk[] => {
      // The column is the `source_type` enum, so this only guards the edge of
      // the runtime; a row that somehow held anything else is not citable.
      const type = assistantSourceType.safeParse(hit.sourceType)
      return type.success
        ? [
            {
              id: hit.sourceId,
              type: type.data,
              label: hit.sourceLabel,
              occurredAt: hit.occurredAt,
              content: hit.content,
            },
          ]
        : []
    }),
    ...(events.data ?? []).map((row): RetrievedChunk => {
      const title = (row.title as string | null) ?? ''
      return {
        id: row.id as string,
        type: 'calendar_event',
        label: title,
        occurredAt: row.starts_at as string,
        content: `${title} — ${row.starts_at} → ${row.ends_at}${
          row.location ? ` @ ${row.location}` : ''
        }`,
      }
    }),
    ...(commitments.data ?? []).map((row): RetrievedChunk => ({
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

  // A citation is verified by its id and then *read from the record it names*:
  // the label and the type are the retrieved row's, not the model's account of
  // it. Repeats collapse, so one source cannot fill the answer with chips.
  const retrieved = new Map(chunks.map((chunk) => [chunk.id, chunk]))
  const citations: AssistantCitation[] = []
  const cited = new Set<string>()
  for (const citation of answer.citations) {
    const chunk = retrieved.get(citation.sourceId)
    if (!chunk || cited.has(chunk.id)) continue
    cited.add(chunk.id)
    citations.push({
      sourceType: chunk.type,
      sourceId: chunk.id,
      label: chunk.label.trim().length > 0 ? chunk.label : citation.label,
      occurredAt: chunk.occurredAt,
    })
  }

  // The proposal is settled before anything is written. A draft the payload
  // schema rejects fails the turn rather than being stored: an answer that says
  // "hazırladım" beside an approval card that is missing, or that carries a
  // payload nothing validated, is the worse of the two outcomes.
  let proposed: AssistantProposedAction | null = null
  if (answer.proposedAction) {
    /**
     * The connected account that serves a resource, primary first.
     *
     * A lookup that returned nothing — including one that failed — reads as
     * "no account", which rejects the proposal rather than inventing one. The
     * answer itself does not depend on it, so a blip here costs a proposal
     * rather than the whole turn.
     */
    const accountFor = (kind: AccountKind): string | null => {
      for (const row of accounts.data ?? []) {
        const kinds = (row.kinds as string[] | null) ?? []
        if (kinds.includes(kind)) return row.id as string
      }
      return null
    }

    const parsed = assistantProposedAction.safeParse({
      ...answer.proposedAction,
      draft: completeDraft(answer.proposedAction.type, answer.proposedAction.draft, {
        mailAccountId: accountFor('mail'),
        calendarAccountId: accountFor('calendar'),
        tasksAccountId: accountFor('tasks'),
        timeZone: profile.timeZone,
        events: new Map(
          (events.data ?? []).map((row): [string, EventHandle] => [
            row.id as string,
            {
              connectedAccountId: (row.connected_account_id as string | null) ?? null,
              externalEventId: row.external_event_id as string,
              providerUpdatedAt: (row.provider_updated_at as string | null) ?? null,
            },
          ]),
        ),
      }),
    })

    if (!parsed.success) {
      throw new AppError('ai_invalid_output', {
        detail: `assistant_draft_rejected:${answer.proposedAction.type}`,
      })
    }
    proposed = parsed.data
  }

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

  const userMessage = await client.from('assistant_messages').insert({
    user_id: user.id,
    thread_id: threadId,
    role: 'user',
    content: body.question,
    citations: [],
    was_voice: body.wasVoice,
  })
  if (userMessage.error) throw dbError(userMessage.error)

  let proposedApprovalId: string | null = null
  if (proposed) {
    const created = await client
      .from('approval_actions')
      .upsert(
        {
          user_id: user.id,
          type: proposed.type,
          status: 'pending',
          what: proposed.what,
          why: proposed.why,
          source_type: 'user_input',
          source_id: threadId,
          payload: proposed.payload,
          original_payload: proposed.payload,
          idempotency_key: buildIdempotencyKey(
            user.id,
            proposed.type,
            `assistant:${threadId}:${now.getTime()}`,
          ),
          expires_at: approvalExpiryFrom(now),
        },
        { onConflict: 'user_id,idempotency_key' },
      )
      .select('id')
      .single()

    // The answer is about to say what was proposed, so a proposal that did not
    // land has to fail the turn instead of being quietly dropped.
    if (created.error) throw dbError(created.error)
    proposedApprovalId = created.data.id as string
    await audit({
      userId: user.id,
      action: 'approval.created',
      entityType: 'approval',
      entityId: proposedApprovalId,
      metadata: { type: proposed.type, origin: 'assistant' },
    })
  }

  const assistantMessage = await client
    .from('assistant_messages')
    .insert({
      user_id: user.id,
      thread_id: threadId,
      role: 'assistant',
      content: answer.answer,
      // The column holds `SourceRef` rows — that is what the messages reader
      // maps them back through — which is a wider shape than the wire's.
      citations: citations.map((citation) => ({
        type: citation.sourceType,
        id: citation.sourceId,
        label: citation.label,
        provider: null,
        person_name: null,
        occurred_at: citation.occurredAt,
        external_url: null,
      })),
      proposed_approval_id: proposedApprovalId,
      was_voice: false,
    })
    .select('id')
    .single()
  if (assistantMessage.error) throw dbError(assistantMessage.error)

  // Deliberately unchecked: the turn has already been persisted, and a failed
  // sort-order touch must not report a successful answer as a failure.
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

  const payload: AssistantAskResponse = {
    threadId,
    messageId: assistantMessage.data.id as string,
    answer: answer.answer,
    citations,
    proposedApprovalId,
    // An answer with no surviving citation is reported as ungrounded, whatever
    // the model claimed about itself.
    grounded: answer.grounded && citations.length > 0,
  }

  return jsonResponse(payload, 200, origin)
})
