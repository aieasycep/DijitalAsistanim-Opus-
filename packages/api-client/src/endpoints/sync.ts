import type { AccountKind, SyncState } from '@da/domain'
import {
  initialAnalysisProgressSchema,
  initialAnalysisRequestSchema,
  syncRequestSchema,
  syncResponseSchema,
} from '@da/validation'
import type { z } from 'zod'
import { parseRequest } from '../http'
import { mapSyncState } from '../mappers'
import type { EndpointContext, SyncStateRow } from '../types'

export type InitialAnalysisProgress = z.infer<typeof initialAnalysisProgressSchema>
export type SyncStartResult = z.infer<typeof syncResponseSchema>

export interface SyncStartInput {
  connectedAccountId?: string
  resources?: AccountKind[]
  full?: boolean
}

export interface SyncApi {
  start(input?: SyncStartInput): Promise<SyncStartResult>
  /** The onboarding pass: read recent mail, classify it, produce a first briefing. */
  initialAnalysis(input?: { hours?: number }): Promise<InitialAnalysisProgress>
  initialAnalysisProgress(): Promise<InitialAnalysisProgress>
  status(): Promise<SyncState[]>
}

export function createSyncApi(ctx: EndpointContext): SyncApi {
  return {
    async start(input = {}) {
      const request = parseRequest(syncRequestSchema, {
        ...(input.connectedAccountId ? { connectedAccountId: input.connectedAccountId } : {}),
        resources: input.resources ?? ['mail', 'calendar'],
        full: input.full ?? false,
      })
      return ctx.http.callFunction('sync-start', request, syncResponseSchema, { retry: false })
    },

    async initialAnalysis(input = {}) {
      const request = parseRequest(initialAnalysisRequestSchema, { hours: input.hours ?? 72 })
      return ctx.http.callFunction('initial-analysis', request, initialAnalysisProgressSchema, {
        retry: false,
        timeoutMs: 60_000,
      })
    },

    async initialAnalysisProgress() {
      return ctx.http.callFunction('initial-analysis-progress', {}, initialAnalysisProgressSchema)
    },

    async status() {
      const rows = await ctx.db.selectMany<SyncStateRow>('sync_state', {
        order: { column: 'updated_at', ascending: false },
      })
      return rows.map(mapSyncState)
    },
  }
}
