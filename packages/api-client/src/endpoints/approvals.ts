import type {
  ApprovalAction,
  ApprovalActionType,
  ApprovalPayload,
  ApprovalStatus,
  SourceType,
} from '@da/domain'
import {
  approvalCreateRequest,
  approvalCreateResponse,
  approvalDecideRequest,
  approvalDecideResponse,
  approvalRetryRequest,
  approvalRetryResponse,
  type ApprovalExecutionResult,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapApprovalAction } from '../mappers'
import type { Filter } from '../supabase'
import type { ApprovalActionRow, EndpointContext } from '../types'

/**
 * A row the function already selected and RLS already scoped. The contract
 * pins the envelope around it and leaves the row permissive, so the mapper is
 * what narrows it into a domain entity.
 */
function rowOf<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

/** What an approve, a reject or a retry produced. */
export type ApprovalResult = ApprovalExecutionResult

export interface CreateApprovalInput {
  type: ApprovalActionType
  what: string
  why: string
  payload: ApprovalPayload
  sourceType?: SourceType | null
  sourceId?: string | null
  /** Folded into the idempotency key so a double tap cannot act twice. */
  discriminator: string
}

export interface DecideApprovalInput {
  approvalId: string
  decision: 'approve' | 'reject'
  editedPayload?: ApprovalPayload
}

export interface ApprovalsApi {
  list(input?: { status?: ApprovalStatus; limit?: number }): Promise<ApprovalAction[]>
  get(approvalId: string): Promise<ApprovalAction | null>
  create(input: CreateApprovalInput): Promise<ApprovalAction>
  /** The only path to an external write, and it needs the user's own decision. */
  decide(input: DecideApprovalInput): Promise<ApprovalResult>
  retry(approvalId: string): Promise<ApprovalResult>
}

export function createApprovalsApi(ctx: EndpointContext): ApprovalsApi {
  return {
    async list(input = {}) {
      const filters: Filter[] = []
      if (input.status) filters.push({ column: 'status', op: 'eq', value: input.status })
      const rows = await ctx.db.selectMany<ApprovalActionRow>('approval_actions', {
        filters,
        order: { column: 'created_at', ascending: false },
        limit: input.limit ?? 50,
      })
      return rows.map(mapApprovalAction)
    },

    async get(approvalId) {
      const row = await ctx.db.selectOne<ApprovalActionRow>('approval_actions', {
        filters: [{ column: 'id', op: 'eq', value: approvalId }],
      })
      return row ? mapApprovalAction(row) : null
    },

    async create(input) {
      const request = parseRequest(approvalCreateRequest, {
        type: input.type,
        what: input.what,
        why: input.why,
        payload: input.payload,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        discriminator: input.discriminator,
      })
      const result = await ctx.http.callFunction(
        'approval-create',
        request,
        approvalCreateResponse,
        { retry: false },
      )
      return mapApprovalAction(rowOf<ApprovalActionRow>(result.approval))
    },

    async decide(input) {
      const request = parseRequest(approvalDecideRequest, {
        approvalId: input.approvalId,
        decision: input.decision,
        ...(input.editedPayload ? { editedPayload: input.editedPayload } : {}),
      })
      // Never retried automatically: the server's idempotency key owns that call.
      return ctx.http.callFunction('approval-decide', request, approvalDecideResponse, {
        retry: false,
        timeoutMs: 45_000,
      })
    },

    async retry(approvalId) {
      const request = parseRequest(approvalRetryRequest, { approvalId })
      return ctx.http.callFunction('approval-retry', request, approvalRetryResponse, {
        retry: false,
        timeoutMs: 45_000,
      })
    },
  }
}
