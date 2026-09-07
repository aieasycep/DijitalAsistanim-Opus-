import {
  DEFAULT_TIME_ZONE,
  toIsoDate,
  type Briefing,
  type BriefingKind,
  type IsoDate,
} from '@da/domain'
import {
  briefingAudioRequestSchema,
  briefingAudioResponseSchema,
  generateBriefingRequestSchema,
} from '@da/validation'
import { z } from 'zod'
import { parseRequest, rowOf } from '../http'
import { mapBriefing, mapBriefingItem } from '../mappers'
import type { BriefingItemRow, BriefingRow, BriefingWithItems, EndpointContext } from '../types'

const briefingEnvelopeSchema = z.object({
  briefing: rowOf<BriefingRow>(),
  items: z.array(rowOf<BriefingItemRow>()).default([]),
})

export type BriefingAudio = z.infer<typeof briefingAudioResponseSchema>

export interface BriefingsApi {
  get(input: {
    kind: BriefingKind
    forDate?: IsoDate
    timeZone?: string
  }): Promise<BriefingWithItems | null>
  list(input?: { limit?: number }): Promise<Briefing[]>
  generate(input: {
    kind: BriefingKind
    forDate?: IsoDate
    force?: boolean
  }): Promise<BriefingWithItems>
  /** Server TTS when configured; otherwise the device speaks `ssmlOrText`. */
  requestAudio(input: {
    briefingId: string
    voice?: string | null
    speed?: number
  }): Promise<BriefingAudio>
  markOpened(briefingId: string): Promise<Briefing>
}

export function createBriefingsApi(ctx: EndpointContext): BriefingsApi {
  return {
    async get(input) {
      const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE
      const forDate = input.forDate ?? toIsoDate(ctx.config.clock.now(), timeZone)
      const briefingRow = await ctx.db.selectOne<BriefingRow>('briefings', {
        filters: [
          { column: 'kind', op: 'eq', value: input.kind },
          { column: 'for_date', op: 'eq', value: forDate },
        ],
        order: { column: 'created_at', ascending: false },
      })
      if (!briefingRow) return null
      const itemRows = await ctx.db.selectMany<BriefingItemRow>('briefing_items', {
        filters: [{ column: 'briefing_id', op: 'eq', value: briefingRow.id }],
        order: { column: 'position', ascending: true },
      })
      return { briefing: mapBriefing(briefingRow), items: itemRows.map(mapBriefingItem) }
    },

    async list(input = {}) {
      const rows = await ctx.db.selectMany<BriefingRow>('briefings', {
        order: { column: 'for_date', ascending: false },
        limit: input.limit ?? 30,
      })
      return rows.map(mapBriefing)
    },

    async generate(input) {
      const request = parseRequest(generateBriefingRequestSchema, {
        kind: input.kind,
        ...(input.forDate ? { forDate: input.forDate } : {}),
        force: input.force ?? false,
      })
      const result = await ctx.http.callFunction(
        'briefing-generate',
        request,
        briefingEnvelopeSchema,
        { retry: false, timeoutMs: 60_000 },
      )
      return { briefing: mapBriefing(result.briefing), items: result.items.map(mapBriefingItem) }
    },

    async requestAudio(input) {
      const request = parseRequest(briefingAudioRequestSchema, {
        briefingId: input.briefingId,
        voice: input.voice ?? null,
        speed: input.speed ?? 1,
      })
      return ctx.http.callFunction('briefing-audio', request, briefingAudioResponseSchema, {
        timeoutMs: 45_000,
      })
    },

    async markOpened(briefingId) {
      const row = await ctx.db.updateOne<BriefingRow>('briefings', briefingId, {
        opened_at: ctx.config.clock.now().toISOString(),
      })
      return mapBriefing(row)
    },
  }
}
