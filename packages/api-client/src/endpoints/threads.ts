import type { EmailMessage, EmailThread, FeedbackSignal, SourceType } from '@da/domain'
import { feedbackRequestSchema } from '@da/validation'
import { okSchema, parseRequest } from '../http'
import { mapCommitment, mapEmailMessage, mapEmailThread, mapFollowUp } from '../mappers'
import type { Filter } from '../supabase'
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

const WAITING_CATEGORIES = ['waiting_for_user', 'waiting_for_other']
const PERSONAL_CATEGORIES = ['shipment', 'travel', 'payment', 'subscription', 'security']
const IMPORTANT_LEVELS = ['critical', 'high']

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

function flowFilters(flow: FlowFilter): {
  filters: Filter[]
  inFilter?: { column: string; values: string[] }
} {
  switch (flow) {
    case 'important':
      return { filters: [], inFilter: { column: 'importance', values: IMPORTANT_LEVELS } }
    case 'action_required':
      return { filters: [{ column: 'requires_user_action', op: 'eq', value: true }] }
    case 'waiting':
      return { filters: [], inFilter: { column: 'category', values: WAITING_CATEGORIES } }
    case 'deadlines':
      return { filters: [{ column: 'category', op: 'eq', value: 'deadline' }] }
    case 'meetings':
      return { filters: [{ column: 'category', op: 'eq', value: 'meeting' }] }
    case 'personal':
      return { filters: [], inFilter: { column: 'category', values: PERSONAL_CATEGORIES } }
    case 'all':
    default:
      return { filters: [] }
  }
}

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
      const flow = flowFilters(filter.flow ?? 'all')
      const filters: Filter[] = [...flow.filters]
      if (!filter.includeSuppressed) {
        filters.push({ column: 'suppressed_at', op: 'is', value: null })
      }
      if (filter.category) filters.push({ column: 'category', op: 'eq', value: filter.category })
      if (filter.importance) {
        filters.push({ column: 'importance', op: 'eq', value: filter.importance })
      }
      if (filter.accountId) {
        filters.push({ column: 'connected_account_id', op: 'eq', value: filter.accountId })
      }
      if (filter.unreadOnly) filters.push({ column: 'is_read', op: 'eq', value: false })
      if (filter.requiresAction) {
        filters.push({ column: 'requires_user_action', op: 'eq', value: true })
      }
      const rows = await ctx.db.selectMany<EmailThreadRow>('email_threads', {
        filters,
        ...(flow.inFilter ? { inFilter: flow.inFilter } : {}),
        order: { column: 'last_message_at', ascending: false },
        limit: filter.limit ?? 100,
      })
      return rows.map(mapEmailThread)
    },

    async get(threadId) {
      const row = await loadThread(threadId)
      return row ? mapEmailThread(row) : null
    },

    async messages(threadId) {
      const rows = await loadMessages(threadId)
      return rows.map(mapEmailMessage)
    },

    async feedback(input) {
      const request = parseRequest(feedbackRequestSchema, {
        signal: input.signal,
        entityType: input.entityType,
        entityId: input.entityId,
        note: input.note ?? null,
      })
      await ctx.http.callFunction('feedback', request, okSchema, { retry: false })
    },

    async suppress(threadId) {
      const row = await ctx.db.updateOne<EmailThreadRow>('email_threads', threadId, {
        suppressed_at: ctx.config.clock.now().toISOString(),
      })
      return mapEmailThread(row)
    },

    async markRead(threadId, isRead) {
      const row = await ctx.db.updateOne<EmailThreadRow>('email_threads', threadId, {
        is_read: isRead,
      })
      return mapEmailThread(row)
    },

    async detail(threadId) {
      const threadRow = await loadThread(threadId)
      if (!threadRow) return null
      const [messageRows, commitmentRows, followUpRows] = await Promise.all([
        loadMessages(threadId),
        ctx.db.selectMany<CommitmentRow>('commitments', {
          filters: [{ column: 'source->>id', op: 'eq', value: threadId }],
          order: { column: 'due_at', ascending: true },
        }),
        ctx.db.selectMany<FollowUpRow>('follow_ups', {
          filters: [{ column: 'thread_id', op: 'eq', value: threadId }],
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
