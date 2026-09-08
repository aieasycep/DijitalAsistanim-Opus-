import type { IsoInstant } from '@da/domain'
import {
  ackResponse,
  dataExportRequestRequest,
  dataExportRequestResponse,
  dataExportStatusRequest,
  dataExportStatusResponse,
  type DeleteHistoryRequest,
  deleteAccountRequest,
  deleteHistoryRequest,
  deleteHistoryResponse,
} from '@da/validation'
import { parseRequest } from '../http'
import type { DeleteHistoryResult, EndpointContext, ExportStatusView } from '../types'

/**
 * The scopes the delete-history endpoint knows how to clear.
 *
 * Derived from the contract rather than restated, so a scope the server cannot
 * act on cannot be offered as a chip on the privacy screen.
 */
export type HistoryScope = DeleteHistoryRequest['scope']

export interface PrivacyApi {
  requestExport(): Promise<ExportStatusView>
  /** Null until the account has asked for an export at least once. */
  exportStatus(): Promise<ExportStatusView | null>
  deleteHistory(input: {
    scope: HistoryScope
    before?: IsoInstant | null
  }): Promise<DeleteHistoryResult>
  /** Irreversible, and gated twice: typed email plus an explicit acknowledgement. */
  deleteAccount(input: { confirmationEmail: string; acknowledgedIrreversible: true }): Promise<void>
}

/**
 * Building an export walks every table in the account, so it can outlast the
 * default timeout on a busy mailbox. A timeout here is not a failure — the
 * function keeps going and the status poll picks the result up — but waiting
 * long enough to get the answer directly is what the screen expects.
 */
const EXPORT_TIMEOUT_MS = 60_000

export function createPrivacyApi(ctx: EndpointContext): PrivacyApi {
  return {
    async requestExport() {
      const request = parseRequest(dataExportRequestRequest, {})
      const result = await ctx.http.callFunction(
        'data-export-request',
        request,
        dataExportRequestResponse,
        // A retry would build and store a second copy of the whole account.
        { retry: false, timeoutMs: EXPORT_TIMEOUT_MS },
      )
      return result.export
    },

    async exportStatus() {
      const request = parseRequest(dataExportStatusRequest, {})
      const result = await ctx.http.callFunction(
        'data-export-status',
        request,
        dataExportStatusResponse,
      )
      return result.export
    },

    async deleteHistory(input) {
      const request = parseRequest(deleteHistoryRequest, {
        scope: input.scope,
        before: input.before ?? null,
      })
      return ctx.http.callFunction('delete-history', request, deleteHistoryResponse, {
        retry: false,
        timeoutMs: EXPORT_TIMEOUT_MS,
      })
    },

    async deleteAccount(input) {
      const request = parseRequest(deleteAccountRequest, input)
      // `ackResponse`, not a bespoke `{ ok }`: the function used to answer
      // `{ deleted, providerRevoked, objectsRemoved }` and this parse failed
      // over an account that had already been deleted, so the caller was told
      // to keep the user signed in to a session whose user was gone. The
      // caller signs out on the resolution of this promise.
      await ctx.http.callFunction('delete-account', request, ackResponse, {
        retry: false,
        timeoutMs: EXPORT_TIMEOUT_MS,
      })
    },
  }
}
