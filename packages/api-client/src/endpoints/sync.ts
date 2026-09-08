import type { AccountKind, SyncState } from '@da/domain'
import {
  initialAnalysisProgressResponse,
  initialAnalysisRequest,
  initialAnalysisResponse,
  syncStartRequest,
  syncStartResponse,
  type InitialAnalysisResponse,
  type SyncStartResponse,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapSyncState } from '../mappers'
import type { EndpointContext, SyncStateRow } from '../types'

export type { InitialAnalysisResponse, SyncStartResponse }

export interface SyncStartInput {
  /** Sync one account only; omitted, every syncable account is included. */
  connectedAccountId?: string
  resources?: AccountKind[]
}

export interface SyncApi {
  start(input?: SyncStartInput): Promise<SyncStartResponse>
  /** The onboarding pass: read recent mail, classify it, produce a first briefing. */
  initialAnalysis(input?: { hours?: number }): Promise<InitialAnalysisResponse>
  initialAnalysisProgress(): Promise<InitialAnalysisResponse>
  status(): Promise<SyncState[]>
}

export function createSyncApi(ctx: EndpointContext): SyncApi {
  return {
    async start(input = {}) {
      const request = parseRequest(syncStartRequest, {
        ...(input.connectedAccountId ? { connectedAccountId: input.connectedAccountId } : {}),
        resources: input.resources ?? ['mail', 'calendar'],
      })
      return ctx.http.callFunction('sync-start', request, syncStartResponse, { retry: false })
    },

    async initialAnalysis(input = {}) {
      const request = parseRequest(initialAnalysisRequest, { hours: input.hours ?? 72 })
      return ctx.http.callFunction('initial-analysis', request, initialAnalysisResponse, {
        retry: false,
        timeoutMs: 60_000,
      })
    },

    async initialAnalysisProgress() {
      return ctx.http.callFunction('initial-analysis-progress', {}, initialAnalysisProgressResponse)
    },

    async status() {
      // `sync_states`, plural — the table this has always meant. Under the
      // singular name every read 404'd, so the integrations screen could never
      // show a last-sync time for any account.
      const rows = await ctx.db.selectMany<SyncStateRow>('sync_states', {
        order: { column: 'updated_at', ascending: false },
      })
      return rows.map(mapSyncState)
    },
  }
}
