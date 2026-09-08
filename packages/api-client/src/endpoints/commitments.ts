import type { Commitment, CommitmentDirection, CommitmentStatus, IsoInstant } from '@da/domain'
import {
  commitmentCreateRequest,
  commitmentCreateResponse,
  isoInstantSchema,
  type CommitmentSourceType,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapCommitment } from '../mappers'
import type { Filter } from '../supabase'
import type { CommitmentRow, EndpointContext } from '../types'

/**
 * A row the function already selected and RLS already scoped.
 *
 * The contract pins the envelope around it and leaves the row permissive —
 * adding a column must not require a contract change — so the mapper is what
 * narrows a row into a domain entity.
 */
function asRow<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

export interface CommitmentFilter {
  status?: CommitmentStatus
  direction?: CommitmentDirection
  dueBefore?: IsoInstant
  limit?: number
}

export interface CreateCommitmentInput {
  text: string
  direction: CommitmentDirection
  personName?: string | null
  dueAt?: IsoInstant | null
  /** The verbatim sentence this came from — a commitment is never invented. */
  quote: string
  /** Where the sentence was read from. Defaults to the user typing it. */
  sourceType?: CommitmentSourceType
  /** The record it was read from, when the caller can name one. */
  sourceId?: string | null
}

export interface CommitmentsApi {
  list(filter?: CommitmentFilter): Promise<Commitment[]>
  complete(commitmentId: string): Promise<Commitment>
  snooze(commitmentId: string, until: IsoInstant): Promise<Commitment>
  create(input: CreateCommitmentInput): Promise<Commitment>
}

export function createCommitmentsApi(ctx: EndpointContext): CommitmentsApi {
  return {
    async list(filter = {}) {
      const filters: Filter[] = []
      if (filter.status) filters.push({ column: 'status', op: 'eq', value: filter.status })
      if (filter.direction) filters.push({ column: 'direction', op: 'eq', value: filter.direction })
      if (filter.dueBefore) filters.push({ column: 'due_at', op: 'lte', value: filter.dueBefore })
      const rows = await ctx.db.selectMany<CommitmentRow>('commitments', {
        filters,
        order: { column: 'due_at', ascending: true },
        limit: filter.limit ?? 100,
      })
      return rows.map(mapCommitment)
    },

    async complete(commitmentId) {
      const now = ctx.config.clock.now().toISOString()
      const row = await ctx.db.updateOne<CommitmentRow>('commitments', commitmentId, {
        status: 'done',
        completed_at: now,
      })
      return mapCommitment(row)
    },

    async snooze(commitmentId, until) {
      const snoozedUntil = parseRequest(isoInstantSchema, until)
      const row = await ctx.db.updateOne<CommitmentRow>('commitments', commitmentId, {
        status: 'snoozed',
        snoozed_until: snoozedUntil,
      })
      return mapCommitment(row)
    },

    async create(input) {
      const request = parseRequest(commitmentCreateRequest, {
        text: input.text,
        direction: input.direction,
        personName: input.personName ?? null,
        dueAt: input.dueAt ?? null,
        quote: input.quote,
        sourceType: input.sourceType ?? 'user_input',
        sourceId: input.sourceId ?? null,
      })
      const result = await ctx.http.callFunction(
        'commitment-create',
        request,
        commitmentCreateResponse,
        { retry: false },
      )
      return mapCommitment(asRow<CommitmentRow>(result.commitment))
    },
  }
}
