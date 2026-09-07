import type { IsoInstant } from '@da/domain'
import {
  dataExportResponseSchema,
  deleteAccountRequestSchema,
  deleteHistoryRequestSchema,
} from '@da/validation'
import { z } from 'zod'
import { okSchema, parseRequest } from '../http'
import type { DeleteHistoryResult, EndpointContext, ExportStatusView } from '../types'

const deleteHistoryResponseSchema = z.object({ deletedCount: z.number().int().min(0) })

export type HistoryScope = 'emails' | 'briefings' | 'assistant' | 'captures' | 'memory' | 'all'

export interface PrivacyApi {
  requestExport(): Promise<ExportStatusView>
  exportStatus(): Promise<ExportStatusView | null>
  deleteHistory(input: {
    scope: HistoryScope
    before?: IsoInstant | null
  }): Promise<DeleteHistoryResult>
  /** Irreversible, and gated twice: typed email plus an explicit acknowledgement. */
  deleteAccount(input: { confirmationEmail: string; acknowledgedIrreversible: true }): Promise<void>
}

export function createPrivacyApi(ctx: EndpointContext): PrivacyApi {
  return {
    async requestExport() {
      const result = await ctx.http.callFunction(
        'data-export-request',
        {},
        dataExportResponseSchema,
        { retry: false },
      )
      return {
        requestId: result.requestId,
        status: result.status,
        downloadUrl: result.downloadUrl,
        expiresAt: result.expiresAt,
      }
    },

    async exportStatus() {
      const result = await ctx.http.callFunction(
        'data-export-status',
        {},
        dataExportResponseSchema.nullable(),
      )
      if (!result) return null
      return {
        requestId: result.requestId,
        status: result.status,
        downloadUrl: result.downloadUrl,
        expiresAt: result.expiresAt,
      }
    },

    async deleteHistory(input) {
      const request = parseRequest(deleteHistoryRequestSchema, {
        scope: input.scope,
        before: input.before ?? null,
      })
      return ctx.http.callFunction('delete-history', request, deleteHistoryResponseSchema, {
        retry: false,
        timeoutMs: 60_000,
      })
    },

    async deleteAccount(input) {
      const request = parseRequest(deleteAccountRequestSchema, input)
      await ctx.http.callFunction('delete-account', request, okSchema, {
        retry: false,
        timeoutMs: 60_000,
      })
    },
  }
}
