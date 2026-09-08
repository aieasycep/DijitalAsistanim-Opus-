import { EXPORT_STATUSES } from '@da/domain'
import { z } from 'zod'
import { deleteAccountRequestSchema, deleteHistoryRequestSchema } from '../api-schemas.ts'
import { isoInstantSchema, uuidSchema } from '../primitives.ts'

/**
 * The `privacy` group — `data-export-request`, `data-export-status`,
 * `delete-history` and `delete-account`.
 *
 * This is the group where drift was most expensive, so four decisions are
 * worth stating:
 *
 *  1. **Deleting an account answers `ACK`.** It used to answer
 *     `{ deleted, providerRevoked, objectsRemoved }` while the client parsed
 *     `{ ok: boolean }`. The function revoked the provider tokens, deleted the
 *     stored objects and deleted the auth user — and then the parse failed at
 *     the client boundary, so the sheet showed an error over an account that
 *     no longer existed and left the user sitting in a session whose user was
 *     gone. How many tokens a provider agreed to revoke is a question the
 *     audit row answers; it was never something this sheet could act on.
 *
 *  2. **"No export yet" is `export: null`, not a placeholder row.**
 *     `data-export-status` used to invent `{ requestId: null,
 *     status: 'requested' }` for a user who had never asked for an export —
 *     which its own client schema rejected, because `requestId` is a uuid.
 *     Nesting the snapshot states absence once, in the envelope, instead of
 *     smuggling it into a field that is a uuid whenever it exists.
 *
 *  3. **Both export endpoints answer the same snapshot.** Requesting an export
 *     and polling for one report the same four facts, so the screen renders
 *     the result of either through one code path and the polling loop cannot
 *     disagree with the answer that started it.
 *
 *  4. **Deleting history answers a count.** The function returned a per-table
 *     map (`{ email_messages: 12, … }`) while the client parsed
 *     `{ deletedCount }` — so a deletion that had already run reported failure.
 *     The total is what the client's `DeleteHistoryResult` has always
 *     promised and the only number the screen has copy for; the per-table
 *     breakdown belongs in the audit row, which is where "what exactly went?"
 *     is actually asked.
 */

// ── Shared leaves ───────────────────────────────────────────────────────────

/**
 * Where an export has got to.
 *
 * The domain's own list, not a copy of it: `EXPORT_STATUSES` is also the
 * `export_status` enum in the database, so a status added there cannot be
 * silently absent here — and every value has a `privacy.dataExport.status.*`
 * message behind it.
 */
export const dataExportState = z.enum(EXPORT_STATUSES)

export type DataExportState = z.infer<typeof dataExportState>

/**
 * One export request, as both export endpoints report it.
 *
 * `downloadUrl` is a signed URL minted per answer rather than stored, so it is
 * null until the file exists and can never outlive `expiresAt`; `expiresAt` is
 * the export's own expiry, which is what the screen puts in front of the user.
 */
export const dataExportSnapshot = z.object({
  requestId: uuidSchema,
  status: dataExportState,
  downloadUrl: z.string().url().nullable(),
  expiresAt: isoInstantSchema.nullable(),
})

export type DataExportSnapshot = z.infer<typeof dataExportSnapshot>

// ── data-export-request ─────────────────────────────────────────────────────

/**
 * Nothing to ask for: the export covers the whole account by definition, and
 * narrowing it would produce a file that answers a data-protection request
 * only partly. The client sends an empty body.
 */
export const dataExportRequestRequest = z.object({})

export type DataExportRequestRequest = z.infer<typeof dataExportRequestRequest>

export const dataExportRequestResponse = z.object({
  /** Never null: this call is what creates the export it describes. */
  export: dataExportSnapshot,
})

export type DataExportRequestResponse = z.infer<typeof dataExportRequestResponse>

// ── data-export-status ──────────────────────────────────────────────────────

/** The latest export is the only one the screen can act on; nothing to ask. */
export const dataExportStatusRequest = z.object({})

export type DataExportStatusRequest = z.infer<typeof dataExportStatusRequest>

export const dataExportStatusResponse = z.object({
  /** The most recent request, or null when the account has never made one. */
  export: dataExportSnapshot.nullable(),
})

export type DataExportStatusResponse = z.infer<typeof dataExportStatusResponse>

// ── delete-history ──────────────────────────────────────────────────────────

/**
 * Which slice to clear, and how far back.
 *
 * An alias, not a copy: `api-schemas.ts` has always owned this schema and both
 * sides already import it. Re-declaring it here would create the second
 * definition this module exists to abolish.
 */
export const deleteHistoryRequest = deleteHistoryRequestSchema

export type DeleteHistoryRequest = z.infer<typeof deleteHistoryRequest>

export const deleteHistoryResponse = z.object({
  /** Rows removed across every table the scope covers. */
  deletedCount: z.number().int().min(0),
})

export type DeleteHistoryResponse = z.infer<typeof deleteHistoryResponse>

// ── delete-account ──────────────────────────────────────────────────────────

/** Aliased from `api-schemas.ts` for the same reason as the history request. */
export const deleteAccountRequest = deleteAccountRequestSchema

export type DeleteAccountRequest = z.infer<typeof deleteAccountRequest>

// The response is `ackResponse` from `./common.ts`. There is no account left to
// describe, and the client's only remaining job is to sign the session out.
