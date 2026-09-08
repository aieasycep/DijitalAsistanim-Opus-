import type { EmailMessage, EmailThread, FeedbackSignal, SourceType } from '@da/domain'
import {
  THREAD_COMMITMENT_SOURCE_ID_COLUMN,
  THREAD_COMMITMENT_SOURCE_TYPE,
  THREAD_COMMITMENT_SOURCE_TYPE_COLUMN,
  THREAD_LIVE_FOLLOW_UP_STATUSES,
  ackResponse,
  feedbackRequestSchema,
  threadFlowCut,
  threadRefRequest,
  threadsListRequest,
  threadsMarkReadRequest,
  type ThreadFlow,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapCommitment, mapEmailMessage, mapEmailThread, mapFollowUp } from '../mappers'
import type { Filter, SelectOptions } from '../supabase'
import type {
  CommitmentRow,
  EmailMessageRow,
  EmailThreadRow,
  EndpointContext,
  FlowFilter,
  FollowUpRow,
  ThreadDetail,
  ThreadFilter,
} from '../types'

export interface ThreadFeedbackInput {
  signal: FeedbackSignal
  entityType: SourceType
  entityId: string
  note?: string | null
}

export interface ThreadsApi {
  list(filter?: ThreadFilter): Promise<EmailThread[]>
  get(threadId: string): Promise<EmailThread | null>
  messages(threadId: string): Promise<EmailMessage[]>
  /** Teaches the personalisation engine; never mutates the mail itself. */
  feedback(input: ThreadFeedbackInput): Promise<void>
  suppress(threadId: string): Promise<EmailThread>
  markRead(threadId: string, isRead: boolean): Promise<EmailThread>
  detail(threadId: string): Promise<ThreadDetail | null>
}

/**
 * The chip the caller asked for, in the contract's vocabulary.
 *
 * The narrowing is the point: `FlowFilter` is the name this package exports to
 * the app and `ThreadFlow` is the contract's, so a chip added to one and not
 * the other fails to compile here rather than falling through
 * `threadFlowCut`'s `switch` at runtime.
 */
function flowOf(flow: FlowFilter | undefined): ThreadFlow {
  return flow ?? 'all'
}

/**
 * The `in` clause a flow spends, if it spends one.
 *
 * `SelectOptions` has room for exactly one, which is why `ThreadFlowCut` is a
 * union that can only ever ask for one.
 */
function inFilterFor(flow: ThreadFlow): SelectOptions['inFilter'] {
  const cut = threadFlowCut(flow)
  switch (cut.by) {
    case 'category':
      return { column: 'category', values: cut.categories }
    case 'importance':
      return { column: 'importance', values: cut.levels }
    case 'requiresUserAction':
    case 'nothing':
      return undefined
  }
}

/** The equality filters a flow adds on top of its `in` clause. */
function filtersFor(flow: ThreadFlow): Filter[] {
  const cut = threadFlowCut(flow)
  return cut.by === 'requiresUserAction'
    ? [{ column: 'requires_user_action', op: 'eq', value: true }]
    : []
}

/**
 * Mail reads, and the one signal that crosses the wire.
 *
 * Straight table reads under RLS: a thread is the user's own mirrored row, and
 * the only two things the app changes about one are flags the user set
 * deliberately — read state, and the mute that `suppress` writes. Anything that
 * touches the mailbox itself goes through an approval instead, which is why
 * there is no send, no archive and no delete here.
 */
export function createThreadsApi(ctx: EndpointContext): ThreadsApi {
  async function loadThread(threadId: string): Promise<EmailThreadRow | null> {
    return ctx.db.selectOne<EmailThreadRow>('email_threads', {
      filters: [{ column: 'id', op: 'eq', value: threadId }],
    })
  }

  async function loadMessages(threadId: string): Promise<EmailMessageRow[]> {
    return ctx.db.selectMany<EmailMessageRow>('email_messages', {
      filters: [{ column: 'thread_id', op: 'eq', value: threadId }],
      order: { column: 'sent_at', ascending: true },
    })
  }

  return {
    async list(filter = {}) {
      const request = parseRequest(threadsListRequest, {
        flow: flowOf(filter.flow),
        category: filter.category ?? null,
        importance: filter.importance ?? null,
        accountId: filter.accountId ?? null,
        unreadOnly: filter.unreadOnly ?? false,
        requiresAction: filter.requiresAction ?? false,
        includeSuppressed: filter.includeSuppressed ?? false,
        limit: filter.limit ?? undefined,
      })

      const filters: Filter[] = filtersFor(request.flow)
      if (!request.includeSuppressed) {
        filters.push({ column: 'suppressed_at', op: 'is', value: null })
      }
      if (request.category) {
        filters.push({ column: 'category', op: 'eq', value: request.category })
      }
      if (request.importance) {
        filters.push({ column: 'importance', op: 'eq', value: request.importance })
      }
      if (request.accountId) {
        filters.push({ column: 'connected_account_id', op: 'eq', value: request.accountId })
      }
      if (request.unreadOnly) filters.push({ column: 'is_read', op: 'eq', value: false })
      if (request.requiresAction) {
        filters.push({ column: 'requires_user_action', op: 'eq', value: true })
      }

      const inFilter = inFilterFor(request.flow)
      const rows = await ctx.db.selectMany<EmailThreadRow>('email_threads', {
        filters,
        ...(inFilter ? { inFilter } : {}),
        order: { column: 'last_message_at', ascending: false },
        limit: request.limit,
      })
      return rows.map(mapEmailThread)
    },

    async get(threadId) {
      const request = parseRequest(threadRefRequest, { threadId })
      const row = await loadThread(request.threadId)
      return row ? mapEmailThread(row) : null
    },

    async messages(threadId) {
      const request = parseRequest(threadRefRequest, { threadId })
      const rows = await loadMessages(request.threadId)
      return rows.map(mapEmailMessage)
    },

    async feedback(input) {
      const request = parseRequest(feedbackRequestSchema, {
        signal: input.signal,
        entityType: input.entityType,
        entityId: input.entityId,
        note: input.note ?? null,
      })
      // `ACK` and nothing else: the signal is recorded and, for the two that
      // have an immediate meaning, acted on. Parsing anything wider is how
      // every "bu önemli değil" came back to the user as a failure.
      await ctx.http.callFunction('feedback', request, ackResponse, { retry: false })
    },

    async suppress(threadId) {
      const request = parseRequest(threadRefRequest, { threadId })
      const row = await ctx.db.updateOne<EmailThreadRow>('email_threads', request.threadId, {
        suppressed_at: ctx.config.clock.now().toISOString(),
      })
      return mapEmailThread(row)
    },

    async markRead(threadId, isRead) {
      const request = parseRequest(threadsMarkReadRequest, { threadId, isRead })
      const row = await ctx.db.updateOne<EmailThreadRow>('email_threads', request.threadId, {
        is_read: request.isRead,
      })
      return mapEmailThread(row)
    },

    async detail(threadId) {
      const request = parseRequest(threadRefRequest, { threadId })
      const threadRow = await loadThread(request.threadId)
      if (!threadRow) return null
      const [messageRows, commitmentRows, followUpRows] = await Promise.all([
        loadMessages(request.threadId),
        // `commitments` names its origin in three columns, not in a `source`
        // jsonb: asking for `source->>id` was a `42703` that failed the whole
        // detail read, so every thread opened straight into its error state.
        ctx.db.selectMany<CommitmentRow>('commitments', {
          filters: [
            {
              column: THREAD_COMMITMENT_SOURCE_TYPE_COLUMN,
              op: 'eq',
              value: THREAD_COMMITMENT_SOURCE_TYPE,
            },
            { column: THREAD_COMMITMENT_SOURCE_ID_COLUMN, op: 'eq', value: request.threadId },
          ],
          order: { column: 'due_at', ascending: true },
        }),
        // Only the follow-ups still waiting on this conversation: a `replied`
        // or `closed` one shown as "henüz dönüş gelmedi" would be asking the
        // user to chase a thread that has already ended.
        ctx.db.selectMany<FollowUpRow>('follow_ups', {
          filters: [{ column: 'thread_id', op: 'eq', value: request.threadId }],
          inFilter: { column: 'status', values: THREAD_LIVE_FOLLOW_UP_STATUSES },
          order: { column: 'due_at', ascending: true },
        }),
      ])
      return {
        thread: mapEmailThread(threadRow),
        messages: messageRows.map(mapEmailMessage),
        commitments: commitmentRows.map(mapCommitment),
        followUps: followUpRows.map(mapFollowUp),
      }
    },
  }
}
