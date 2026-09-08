import {
  DEFAULT_TIME_ZONE,
  toIsoDate,
  type Briefing,
  type BriefingKind,
  type IsoDate,
} from '@da/domain'
import {
  briefingAudioRequest,
  briefingAudioResponse,
  briefingGenerateRequest,
  briefingGenerateResponse,
  type BriefingAudioResponse,
  type BriefingReadyReason,
  type BriefingSkipReason,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapBriefing, mapBriefingItem } from '../mappers'
import type { BriefingItemRow, BriefingRow, BriefingWithItems, EndpointContext } from '../types'

/**
 * Rows the function already selected and RLS already scoped.
 *
 * The contract pins the envelope around them and leaves the rows themselves
 * permissive — adding a column must not require a contract change — so the
 * mapper is what narrows a row into a domain entity.
 */
function rowAs<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

function rowsAs<T>(values: readonly Record<string, unknown>[]): T[] {
  return values as unknown as T[]
}

export type BriefingAudio = BriefingAudioResponse

/**
 * What asking for a briefing produced.
 *
 * Not writing one is one of the answers: a quiet day, or a midday pulse with
 * nothing new to add. The reason travels with it so the screen can say which,
 * and the union means a caller cannot read a briefing out of an answer that
 * does not carry one.
 */
export type BriefingGenerateResult =
  | ({ status: 'ready'; reason: BriefingReadyReason } & BriefingWithItems)
  | { status: 'skipped'; reason: BriefingSkipReason }

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
  }): Promise<BriefingGenerateResult>
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
      const request = parseRequest(briefingGenerateRequest, {
        kind: input.kind,
        ...(input.forDate ? { forDate: input.forDate } : {}),
        force: input.force ?? false,
      })
      const result = await ctx.http.callFunction(
        'briefing-generate',
        request,
        briefingGenerateResponse,
        { retry: false, timeoutMs: 60_000 },
      )
      if (result.status === 'skipped') return { status: 'skipped', reason: result.reason }
      return {
        status: 'ready',
        reason: result.reason,
        briefing: mapBriefing(rowAs<BriefingRow>(result.briefing)),
        items: rowsAs<BriefingItemRow>(result.items).map(mapBriefingItem),
      }
    },

    async requestAudio(input) {
      const request = parseRequest(briefingAudioRequest, {
        briefingId: input.briefingId,
        voice: input.voice ?? null,
        speed: input.speed ?? 1,
      })
      return ctx.http.callFunction('briefing-audio', request, briefingAudioResponse, {
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
