import type { AccountKind, Provider, ScopeGroup } from '@da/domain'
import { ACCOUNT_KINDS } from '@da/domain'
import { z } from 'zod'
import { uuidSchema } from '../primitives.ts'
import { rowSchema } from './common.ts'

/**
 * The `accounts` group — `oauth-start`, `oauth-complete`, `accounts-disconnect`
 * and `sync-start`.
 *
 * `sync-start` lives here rather than in a contract of its own because the
 * connected-accounts screen is its only caller: "Şimdi eşitle" sits on the card
 * of the account it syncs, so the endpoint belongs to this surface.
 *
 * Four decisions, each of them a bug this file exists to make impossible:
 *
 *  1. **The callback is `{ code, state }`.** `oauth-complete` used to require
 *     `{ provider }` while the client posted `{ code, state }`, so every
 *     connection attempt was rejected with a 422 before it began. The provider
 *     is not the client's to assert anyway: it is read back from the stored
 *     state row, along with the user who started the consent and the scopes
 *     that were asked for. A client that could name the provider could name
 *     someone else's.
 *
 *  2. **Disconnect answers `ACK`.** It used to answer
 *     `{ disconnected, providerRevoked }` while the client parsed
 *     `{ ok: boolean }`, so a disconnection that had already revoked the token
 *     and deleted the row reported failure to the user — the worst possible
 *     lie for that particular button. Whether the provider accepted the
 *     revocation is recorded in the audit row, which is where that question is
 *     actually answered.
 *
 *  3. **`kinds` decides the scopes.** The field was in the request and the
 *     function ignored it: connecting a calendar asked for Gmail as well.
 *     Asking for a resource is now the same act as asking for its read scope,
 *     which is what makes `oauth-complete` able to answer "what does this
 *     account serve?" from what the provider actually granted.
 *
 *  4. **A sync that synced nothing did not start.** `sync-start` returns the
 *     per-account outcomes and failures it has always computed, instead of an
 *     unconditional `started: true` beside a `jobIds` array that never existed.
 */

// ── Shared leaves ───────────────────────────────────────────────────────────

/**
 * The two providers an OAuth connection can be made through.
 *
 * `Provider` also covers `apple`, `device` and `demo`; none of those has an
 * authorization-code flow, so they cannot appear on this wire.
 */
export const oauthProvider = z.enum(['google', 'microsoft']) satisfies z.ZodType<
  Extract<Provider, 'google' | 'microsoft'>
>

export type OAuthProvider = z.infer<typeof oauthProvider>

/** Which resource a connection serves. */
export const accountKind = z.enum(ACCOUNT_KINDS) satisfies z.ZodType<AccountKind>

/**
 * The resources a sync run can actually read.
 *
 * `contacts` is an account kind but has no sync path yet, so naming it here
 * would promise a run that never happens.
 */
export const SYNCABLE_RESOURCES = [
  'mail',
  'calendar',
  'tasks',
] as const satisfies readonly AccountKind[]

export const syncResource = z.enum(SYNCABLE_RESOURCES)

export type SyncResource = z.infer<typeof syncResource>

/**
 * A permission group asked for after connect, at the moment the user first
 * tries the action that needs it.
 *
 * The read groups (`identity`, `mailRead`, `calendarRead`) are deliberately
 * absent: those follow from `kinds` at connect time and are never a separate
 * request, so a caller cannot ask for read access without asking for the
 * resource it belongs to.
 */
export const progressiveScopeGroup = z.enum([
  'mailSend',
  'calendarWrite',
  'tasksWrite',
  'contactsRead',
  'tasksRead',
]) satisfies z.ZodType<ScopeGroup>

export type ProgressiveScopeGroup = z.infer<typeof progressiveScopeGroup>

// ── oauth-start ─────────────────────────────────────────────────────────────

export const oauthStartRequest = z.object({
  provider: oauthProvider,
  /**
   * What the connection is for. Each kind contributes its read scope, so a
   * calendar-only connection never asks to read mail.
   */
  kinds: z.array(accountKind).min(1).max(ACCOUNT_KINDS.length),
  /** Extra groups folded into the same consent screen, for progressive access. */
  additionalScopeGroups: z.array(progressiveScopeGroup).default([]),
  /** Where the provider should send the user back to. An app scheme URI. */
  redirectTo: z.string().min(1).max(500),
  /**
   * The account being re-authorised, when this is a step-up rather than a new
   * connection.
   *
   * It is checked against the caller before the consent screen opens and
   * carried on the state row, which is what lets `oauth-complete` widen an
   * existing grant instead of inserting a second row for the same mailbox.
   * The client used to accept it and drop it on the floor, so every step-up
   * came back looking like a fresh connection.
   */
  connectedAccountId: uuidSchema.nullable().default(null),
})

export type OAuthStartRequest = z.infer<typeof oauthStartRequest>

export const oauthStartResponse = z.object({
  authorizeUrl: z.string().url(),
  /**
   * Minted and stored server-side, and consumed exactly once by
   * `oauth-complete`. The client keeps it only to compare against the value
   * that comes back on the redirect.
   */
  state: z.string().min(1).max(200),
})

export type OAuthStartResponse = z.infer<typeof oauthStartResponse>

// ── oauth-complete ──────────────────────────────────────────────────────────

/**
 * What the browser round trip produced.
 *
 * Nothing else: the provider, the user, the scopes and the account being
 * stepped up all come from the state row, so a caller holding a stolen code
 * still cannot say whose account it belongs to.
 */
export const oauthCompleteRequest = z.object({
  /** The one-time authorization code. Exchanged server-side, never stored. */
  code: z.string().min(1).max(4096),
  state: z.string().min(1).max(200),
})

export type OAuthCompleteRequest = z.infer<typeof oauthCompleteRequest>

export const oauthCompleteResponse = z.object({
  /**
   * The `connected_accounts` row as it stands after the exchange, so the app
   * can show the connected mailbox without waiting for a refetch.
   *
   * There is no `connected` flag beside it: the row carries `status`, and two
   * fields answering one question is how they end up disagreeing.
   */
  account: rowSchema,
})

export type OAuthCompleteResponse = z.infer<typeof oauthCompleteResponse>

// ── accounts-disconnect ─────────────────────────────────────────────────────

export const accountsDisconnectRequest = z.object({
  connectedAccountId: uuidSchema,
  /** Attempt provider-side revocation as well as local deletion. */
  revoke: z.boolean().default(true),
})

export type AccountsDisconnectRequest = z.infer<typeof accountsDisconnectRequest>

// The response is `ackResponse` from `./common.ts`. Disconnecting has nothing
// to report back that the refetched account list does not already say.

// ── sync-start ──────────────────────────────────────────────────────────────

export const syncStartRequest = z.object({
  /** Sync one account only; omitted, every syncable account is included. */
  connectedAccountId: uuidSchema.optional(),
  resources: z.array(accountKind).min(1).default(['mail', 'calendar']),
})

export type SyncStartRequest = z.infer<typeof syncStartRequest>

/** What one account's run of one resource achieved. */
export const syncStartOutcome = z.object({
  resource: syncResource,
  processed: z.number().int().min(0),
  inserted: z.number().int().min(0),
  analyzed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  /** The provider delta token the next run resumes from. */
  cursor: z.string().nullable(),
  /** False while a historical backfill still has pages left. */
  complete: z.boolean(),
})

export type SyncStartOutcome = z.infer<typeof syncStartOutcome>

/**
 * One account that could not be synced.
 *
 * A broken Outlook connection must not stop Gmail from syncing, so a failure
 * is reported here rather than thrown — as long as something else succeeded.
 * When nothing did, the run failed and says so with an error instead.
 */
export const syncStartFailure = z.object({
  accountId: uuidSchema,
  resource: syncResource,
  /** An `ErrorCode`, so the app can translate it. */
  code: z.string().min(1).max(60),
})

export type SyncStartFailure = z.infer<typeof syncStartFailure>

export const syncStartResponse = z.object({
  /** True when at least one account ran. */
  started: z.boolean(),
  outcomes: z.array(syncStartOutcome).default([]),
  failures: z.array(syncStartFailure).default([]),
})

export type SyncStartResponse = z.infer<typeof syncStartResponse>
