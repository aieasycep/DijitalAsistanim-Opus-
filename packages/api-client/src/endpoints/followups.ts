import type { FollowUp, IsoInstant } from '@da/domain'
import { isoInstantSchema, uuidSchema } from '@da/validation'
import { z } from 'zod'
import { parseRequest } from '../http'
import { mapFollowUp } from '../mappers'
import type { Filter } from '../supabase'
import type { EndpointContext, FollowUpRow, NudgeDraft } from '../types'

const nudgeDraftResponseSchema = z.object({
  followUpId: uuidSchema,
  subject: z.string(),
  body: z.string(),
  approvalId: uuidSchema.nullable().default(null),
})

export interface FollowUpFilter {
  status?: FollowUp['status']
  dueBefore?: IsoInstant
  limit?: number
}

export interface FollowUpsApi {
  list(filter?: FollowUpFilter): Promise<FollowUp[]>
  /** Writes a nudge the user can approve; nothing leaves the device on its own. */
  nudgeDraft(followUpId: string): Promise<NudgeDraft>
  snooze(followUpId: string, until: IsoInstant): Promise<FollowUp>
  close(followUpId: string): Promise<FollowUp>
}

export function createFollowUpsApi(ctx: EndpointContext): FollowUpsApi {
  return {
    async list(filter = {}) {
      const filters: Filter[] = []
      filters.push({ column: 'status', op: 'eq', value: filter.status ?? 'waiting' })
      if (filter.dueBefore) filters.push({ column: 'due_at', op: 'lte', value: filter.dueBefore })
      const rows = await ctx.db.selectMany<FollowUpRow>('follow_ups', {
        filters,
        order: { column: 'due_at', ascending: true },
        limit: filter.limit ?? 50,
      })
      return rows.map(mapFollowUp)
    },

    async nudgeDraft(followUpId) {
      const result = await ctx.http.callFunction(
        'followup-nudge',
        { followUpId },
        nudgeDraftResponseSchema,
        { retry: false, timeoutMs: 45_000 },
      )
      return {
        followUpId: result.followUpId,
        subject: result.subject,
        body: result.body,
        approvalId: result.approvalId,
      }
    },

    async snooze(followUpId, until) {
      const dueAt = parseRequest(isoInstantSchema, until)
      const row = await ctx.db.updateOne<FollowUpRow>('follow_ups', followUpId, { due_at: dueAt })
      return mapFollowUp(row)
    },

    async close(followUpId) {
      const row = await ctx.db.updateOne<FollowUpRow>('follow_ups', followUpId, {
        status: 'closed',
        closed_at: ctx.config.clock.now().toISOString(),
      })
      return mapFollowUp(row)
    },
  }
}
