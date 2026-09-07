import type { Commitment, CommitmentDirection, CommitmentStatus, IsoInstant } from '@da/domain'
import { commitmentCreatePayloadSchema, isoInstantSchema } from '@da/validation'
import { z } from 'zod'
import { parseRequest, rowOf } from '../http'
import { mapCommitment } from '../mappers'
import type { Filter } from '../supabase'
import type { CommitmentRow, EndpointContext } from '../types'

const commitmentEnvelopeSchema = z.object({ commitment: rowOf<CommitmentRow>() })

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
      const request = parseRequest(commitmentCreatePayloadSchema, {
        kind: 'commitment_create',
        text: input.text,
        direction: input.direction,
        personName: input.personName ?? null,
        dueAt: input.dueAt ?? null,
        quote: input.quote,
      })
      const result = await ctx.http.callFunction(
        'commitment-create',
        request,
        commitmentEnvelopeSchema,
        { retry: false },
      )
      return mapCommitment(result.commitment)
    },
  }
}
