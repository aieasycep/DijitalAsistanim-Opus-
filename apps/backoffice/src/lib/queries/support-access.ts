import 'server-only'

import { DAY_MS, isAppError, systemClock, type Clock } from '@da/domain'
import {
  countView,
  queryTableOne,
  queryView,
  queryViewOne,
  queryViewPage,
  type BoAdminUserRow,
  type BoAuditRow,
  type BoSupportAccessGrantRow,
  type BoSupportAccessRevealRow,
  type BoUserDetailRow,
  type BoUserRow,
  type SupportAccessScope,
  type SupportAccessStatus,
  type ViewFilter,
  type ViewPage,
} from '@/lib/db'
import { messages } from '@/lib/messages'
import {
  GRANTS_PAGE_SIZE,
  REVEALS_PAGE_SIZE,
  SUBJECT_HISTORY_LIMIT,
  TRAIL_LIMIT,
  type GrantListParams,
} from '@/components/support-access/contract'

/**
 * Every read behind the Support Access area.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE CAN AND CANNOT ASK FOR
 * ---------------------------------------------------------------------------
 *
 * Nothing here reaches a base table that holds content. `queryView`,
 * `queryViewPage` and `countView` accept only `BoViewName`, and the two views
 * this module lives on were built to answer "who was allowed to look, and did
 * they" without touching what was looked at:
 *
 *   - `bo_support_access_grants` projects the request, the written reason, the
 *     scopes, the four-eyes approval and the window. It joins `profiles` only
 *     through `bo_redact_email()`, so the subject arrives as `y•••@example.com`
 *     and never as an address.
 *   - `bo_support_access_reveals` projects one row per individual view: the
 *     grant, the admin, the scope, the *identifier* of the record opened, and
 *     the instant. `bo_identifier()` collapses anything that is not token
 *     shaped, so a subject line cannot arrive here even by accident.
 *
 * The one write-side table this module reads is `support_tickets`, and it names
 * four metadata columns explicitly — `subject`, `body` and `resolution_note`
 * are what a user wrote to support, and resolving `DA-001042` to a uuid needs
 * none of them.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Every count on screen is a `count=exact` HEAD request — a real `count(*)`
 * over an index with no row bodies crossing the wire — and every list is a
 * bounded page with the exact total beside it. There is no place in this file
 * where a table is fetched in order to measure it.
 */

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result that carries its own failure, so one dead panel renders an
 * error where it stands instead of blanking — and, more importantly here,
 * instead of rendering as "no grants", which on this page would read as "nobody
 * has access to anybody" and is the most expensive lie this screen could tell.
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; message: string }

export async function settle<T>(run: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (isAppError(error) && error.code === 'forbidden') {
      return { ok: false, message: messages.errors.forbidden }
    }
    return { ok: false, message: messages.errors.queryFailed }
  }
}

// ===========================================================================
// The list
// ===========================================================================

export interface GrantListQuery extends GrantListParams {
  /** Resolves the `mine` holder filter. The signed-in admin's own id. */
  readonly viewerAdminUserId: string
}

function listFilters(query: GrantListQuery): ViewFilter<BoSupportAccessGrantRow>[] {
  const filters: ViewFilter<BoSupportAccessGrantRow>[] = []
  if (query.status !== null) {
    filters.push({ column: 'status', op: 'eq', value: query.status })
  }
  if (query.liveOnly) {
    filters.push({ column: 'is_live', op: 'is', value: true })
  }
  if (query.holder === 'mine') {
    filters.push({ column: 'admin_user_id', op: 'eq', value: query.viewerAdminUserId })
  }
  if (query.subject !== null) {
    filters.push({ column: 'subject_user_id', op: 'eq', value: query.subject })
  }
  return filters
}

/**
 * One page of grants, newest request first, with the exact total behind it.
 *
 * Ordered by `requested_at` rather than by status: a queue sorted by an enum's
 * declaration order puts `pending_approval` on top by accident rather than by
 * intent, and the pending count has its own tile that links to the filter.
 */
export async function listGrants(
  query: GrantListQuery,
): Promise<ViewPage<BoSupportAccessGrantRow>> {
  return queryViewPage('bo_support_access_grants', {
    filters: listFilters(query),
    order: [
      { column: 'requested_at', ascending: false },
      { column: 'grant_id', ascending: false },
    ],
    limit: GRANTS_PAGE_SIZE,
    offset: (query.page - 1) * GRANTS_PAGE_SIZE,
  })
}

// ===========================================================================
// The tiles
// ===========================================================================

export interface GrantSummary {
  /** Requests nobody has decided yet. */
  readonly pending: number
  /**
   * Grants that are live *right now*, from the view's own `is_live` — which is
   * computed from the timestamps, not from the stored status, so a lapsed grant
   * the cleanup job has not swept yet is not counted as live.
   */
  readonly live: number
  /** Individual content views recorded in the last twenty-four hours. */
  readonly reveals24h: number
  /** Requests opened in the last thirty days, whatever became of them. */
  readonly requested30d: number
}

export async function loadGrantSummary(clock: Clock = systemClock): Promise<GrantSummary> {
  const now = clock.now().getTime()
  const since24h = new Date(now - DAY_MS).toISOString()
  const since30d = new Date(now - 30 * DAY_MS).toISOString()

  const [pending, live, reveals24h, requested30d] = await Promise.all([
    countView('bo_support_access_grants', [
      { column: 'status', op: 'eq', value: 'pending_approval' },
    ]),
    countView('bo_support_access_grants', [{ column: 'is_live', op: 'is', value: true }]),
    countView('bo_support_access_reveals', [{ column: 'revealed_at', op: 'gte', value: since24h }]),
    countView('bo_support_access_grants', [{ column: 'requested_at', op: 'gte', value: since30d }]),
  ])

  return { pending, live, reveals24h, requested30d }
}

// ===========================================================================
// One grant
// ===========================================================================

export async function loadGrant(grantId: string): Promise<BoSupportAccessGrantRow | null> {
  return queryViewOne('bo_support_access_grants', {
    filters: [{ column: 'grant_id', op: 'eq', value: grantId }],
  })
}

/** The admin roster row behind an id, for a redacted address and a role label. */
export async function loadAdminSummary(adminUserId: string): Promise<BoAdminUserRow | null> {
  return queryViewOne('bo_admin_users', {
    filters: [{ column: 'admin_user_id', op: 'eq', value: adminUserId }],
  })
}

// ===========================================================================
// The reveal log
// ===========================================================================

export interface RevealPageQuery {
  readonly grantId: string
  readonly page: number
}

/**
 * One page of the "who saw what, when" ledger for a single grant.
 *
 * This is a log of accesses, not a second copy of what was accessed: the view
 * carries a scope, an entity type, an identifier and a timestamp. There is no
 * column in it that could hold a subject line, and this module could not select
 * one if there were.
 */
export async function listReveals(
  query: RevealPageQuery,
): Promise<ViewPage<BoSupportAccessRevealRow>> {
  return queryViewPage('bo_support_access_reveals', {
    filters: [{ column: 'grant_id', op: 'eq', value: query.grantId }],
    order: [
      { column: 'revealed_at', ascending: false },
      { column: 'reveal_id', ascending: false },
    ],
    limit: REVEALS_PAGE_SIZE,
    offset: (query.page - 1) * REVEALS_PAGE_SIZE,
  })
}

export interface ScopeRevealCount {
  readonly scope: SupportAccessScope
  readonly count: number
}

/**
 * How many times each granted scope was actually spent.
 *
 * One exact count per scope rather than a tally over a fetched page: a grant
 * used two hundred times must not need two hundred rows transferred to say so,
 * and a scope that was granted and never used has to read as zero rather than
 * be missing from the list — "we asked for the mailbox and never opened it" is
 * a fact a reviewer needs.
 */
export async function countRevealsByScope(
  grantId: string,
  scopes: readonly SupportAccessScope[],
): Promise<readonly ScopeRevealCount[]> {
  if (scopes.length === 0) return []
  const counts = await Promise.all(
    scopes.map((scope) =>
      countView('bo_support_access_reveals', [
        { column: 'grant_id', op: 'eq', value: grantId },
        { column: 'scope', op: 'eq', value: scope },
      ]),
    ),
  )
  return scopes.map((scope, index) => ({ scope, count: counts[index] ?? 0 }))
}

// ===========================================================================
// The decision trail
// ===========================================================================

/**
 * Every audit row written against this grant, newest first.
 *
 * `bo_support_access_grants` deliberately does not project `denied_reason` or
 * `revoked_reason` — the grant row is the permission, not the paperwork — so
 * the sentences a reviewer needs come from `bo_audit`, where 0019 promoted
 * `admin_reason`, `actor_admin_user_id` and `support_access_grant_id` into real
 * columns precisely so the 400-day metadata sweep cannot erase them.
 *
 * A refused attempt is in here too: `runAdminAction` writes a `failure` row on
 * the denial and error paths, so an admin repeatedly reaching for an approval
 * they may not make is visible on the record it was aimed at.
 */
export async function loadGrantTrail(grantId: string): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [{ column: 'support_access_grant_id', op: 'eq', value: grantId }],
    order: { column: 'created_at', ascending: false },
    limit: TRAIL_LIMIT,
  })
}

// ===========================================================================
// The subject, before anybody has been granted anything
// ===========================================================================

/** The roster row for a subject: existence, and a redacted address to confirm. */
export async function loadSubjectSummary(userId: string): Promise<BoUserRow | null> {
  return queryViewOne('bo_users', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
  })
}

/**
 * The operational picture of an account — the panel that usually makes a
 * Support Access request unnecessary.
 *
 * Every column here is a count, a state or a timestamp that 0017/0019 computed
 * in the database. "743 processed, 2 failed, last sync 10:42" answers most
 * support calls, and it answers them without a grant, without an approval and
 * without anybody reading a word the user wrote.
 */
export async function loadSubjectOperations(userId: string): Promise<BoUserDetailRow | null> {
  return queryViewOne('bo_user_detail', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
  })
}

/** Recent grants about one user, so a requester sees the account's history. */
export async function listSubjectGrants(
  userId: string,
): Promise<readonly BoSupportAccessGrantRow[]> {
  return queryView('bo_support_access_grants', {
    filters: [{ column: 'subject_user_id', op: 'eq', value: userId }],
    order: { column: 'requested_at', ascending: false },
    limit: SUBJECT_HISTORY_LIMIT,
  })
}

/**
 * The live grant this admin already holds over this user, if there is one.
 *
 * `support_access_grants_one_active` is a partial unique index on
 * `(admin_user_id, subject_user_id) where status = 'active'`, so a second
 * approval for the same pair is refused by Postgres. Reading it here lets the
 * request form say so before the operator writes a paragraph that cannot be
 * approved; the index, not this query, is what actually prevents it.
 */
export async function findLiveGrantFor(
  adminUserId: string,
  subjectUserId: string,
): Promise<BoSupportAccessGrantRow | null> {
  return queryViewOne('bo_support_access_grants', {
    filters: [
      { column: 'admin_user_id', op: 'eq', value: adminUserId },
      { column: 'subject_user_id', op: 'eq', value: subjectUserId },
      { column: 'status', op: 'eq', value: 'active' },
    ],
    order: { column: 'expires_at', ascending: false },
  })
}

// ===========================================================================
// Tickets
// ===========================================================================

export interface TicketRef {
  readonly ticketId: string
  readonly reference: string
  readonly subjectUserId: string | null
}

/**
 * Resolve `DA-001042` to the ticket's id.
 *
 * `support_access_grants.ticket_id` is a foreign key to `support_tickets`, so
 * the form has to hand over a uuid; an operator has a reference. Four metadata
 * columns are named explicitly here — the ticket's `subject` and `body` are
 * what a user wrote to support, and nothing about linking a grant to a ticket
 * needs to read them.
 */
export async function resolveTicketReference(reference: string): Promise<TicketRef | null> {
  const row = await queryTableOne('support_tickets', {
    columns: ['id', 'reference', 'subject_user_id'],
    filters: [{ column: 'reference', op: 'eq', value: reference }],
  })
  if (row === null) return null
  return { ticketId: row.id, reference: row.reference, subjectUserId: row.subject_user_id }
}

/** The reference behind a stored `ticket_id`, for the detail page's link. */
export async function loadTicketReference(ticketId: string): Promise<TicketRef | null> {
  const row = await queryTableOne('support_tickets', {
    columns: ['id', 'reference', 'subject_user_id'],
    filters: [{ column: 'id', op: 'eq', value: ticketId }],
  })
  if (row === null) return null
  return { ticketId: row.id, reference: row.reference, subjectUserId: row.subject_user_id }
}

// ===========================================================================
// Diagnosis
//
// Used only after the database has already refused a write, to say which of its
// rules did the refusing. It decides nothing: by the time it runs, the answer
// is no and the audit row is written.
// ===========================================================================

export type ApprovalRefusal =
  'notfound' | 'stale' | 'fourEyes' | 'liveGrant' | 'ceiling' | 'unknown'

/** How long a grant may run from the moment it was requested. A DB constraint. */
export const APPROVAL_CEILING_MS = DAY_MS

export interface ApprovalRefusalQuery {
  readonly grantId: string
  readonly approverAdminUserId: string
  readonly now: Date
  /**
   * Which family of database refusal happened. `conflict` is a unique index or
   * a lost race (`23505`, or an UPDATE that matched no row); `validation` is a
   * check constraint (`23514`) or a precondition the handler asserted.
   */
  readonly kind: 'conflict' | 'validation'
}

/**
 * Name the rule that refused an approval.
 *
 * The order below is the order the database would have hit them in, and each
 * branch names a real constraint from 0019:
 * `support_access_grants_four_eyes`, `support_access_grants_window_is_short`
 * and the `support_access_grants_one_active` partial unique index.
 */
export async function diagnoseApprovalRefusal(
  query: ApprovalRefusalQuery,
): Promise<ApprovalRefusal> {
  let grant: BoSupportAccessGrantRow | null
  try {
    grant = await loadGrant(query.grantId)
  } catch {
    return 'unknown'
  }
  if (grant === null) return 'notfound'

  // Somebody else decided it while this form was open. True whatever refused.
  if (grant.status !== 'pending_approval') return 'stale'

  if (query.kind === 'conflict') {
    try {
      const live = await findLiveGrantFor(grant.admin_user_id, grant.subject_user_id)
      return live === null ? 'stale' : 'liveGrant'
    } catch {
      return 'unknown'
    }
  }

  if (grant.admin_user_id === query.approverAdminUserId) return 'fourEyes'

  const requestedAt = new Date(grant.requested_at).getTime()
  if (Number.isFinite(requestedAt) && requestedAt + APPROVAL_CEILING_MS <= query.now.getTime()) {
    return 'ceiling'
  }

  return 'unknown'
}

/** The same, for a denial or a revocation, where the states are simpler. */
export async function diagnoseTransitionRefusal(
  grantId: string,
  allowedFrom: readonly SupportAccessStatus[],
): Promise<'notfound' | 'stale' | 'unknown'> {
  let grant: BoSupportAccessGrantRow | null
  try {
    grant = await loadGrant(grantId)
  } catch {
    return 'unknown'
  }
  if (grant === null) return 'notfound'
  return allowedFrom.includes(grant.status) ? 'unknown' : 'stale'
}
