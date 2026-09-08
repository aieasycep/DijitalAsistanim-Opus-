import 'server-only'

import { AppError, systemClock, type Clock } from '@da/domain'
import {
  adminInsert,
  adminSelect,
  adminSelectOne,
  adminUpdate,
  adminRpc,
  assertPermissionAtSource,
  sessionCan,
  type AdminFilter,
  type AdminPage,
  type AdminSession,
} from './auth.ts'
import { writeAudit } from './audit.ts'
import type { AdminPermission } from './permissions.ts'
import {
  SUPPORT_ACCESS_SCOPES,
  assertRevealAllowed,
  grantMinutesRemaining,
  isGrantLive,
  isSupportAccessScope,
  isSupportAccessStatus,
  type GrantSnapshot,
  type SupportAccessScope,
  type SupportAccessStatus,
} from './redact.ts'
import { RATE_LIMITS, adminBucket, assertRateLimit, grantBucket } from './rate-limit.ts'
import {
  DEFAULT_SUPPORT_ACCESS_WINDOW_MINUTES,
  MAX_SUPPORT_ACCESS_REASON,
  MAX_SUPPORT_ACCESS_WINDOW_MINUTES,
  MIN_SUPPORT_ACCESS_REASON,
  clampWindowMinutes,
} from '@/components/support-access/contract'

/**
 * Support Access: the one controlled route by which an operator may see a
 * user's content, end to end.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE OF THE MECHANISM
 * ---------------------------------------------------------------------------
 *
 *   request  — a named admin, about one named user, for named scopes, with a
 *              written reason of at least twenty characters, for a window of at
 *              most twenty-four hours.
 *   approve  — by a *different* admin who holds `support.access.approve`. The
 *              four-eyes rule is a database constraint, so self-approval is not
 *              a policy somebody could relax in a form handler.
 *   reveal   — one `sa_reveal_*` call per record actually opened. Each writes a
 *              `support_access_reveals` row in the same statement that returns
 *              the data, and this module writes an `audit_logs` row alongside
 *              it. A reveal that was not logged did not happen.
 *   expire   — automatically, by timestamp. `revoke` ends it early.
 *
 * A grant is never deleted. It is the evidence that somebody was allowed to
 * look, and it has to outlive the looking.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DOES NOT DO
 * ---------------------------------------------------------------------------
 *
 * There is no impersonation, no "sign in as user", and no scope that returns a
 * user's credentials. The eight scopes each map to exactly one function that
 * reads exactly one kind of record for exactly one user. `user_consent_ref` on
 * the grant is there for the day consent becomes mandatory; recording it today
 * strengthens a grant, and nothing here weakens one.
 */

// ===========================================================================
// 2. Rows
// ===========================================================================

/** One row of `bo_support_access_grants`. */
export interface SupportAccessGrant {
  readonly grantId: string
  readonly adminUserId: string
  readonly adminEmailRedacted: string | null
  readonly adminRole: string
  readonly subjectUserId: string
  readonly subjectEmailRedacted: string | null
  readonly scopes: readonly SupportAccessScope[]
  readonly reason: string
  readonly ticketId: string | null
  readonly status: SupportAccessStatus
  readonly requestedAt: string
  readonly approvedByAdminUserId: string | null
  readonly approvedAt: string | null
  readonly grantedAt: string | null
  readonly expiresAt: string
  readonly deniedAt: string | null
  readonly revokedAt: string | null
  readonly isLive: boolean
  readonly minutesRemaining: number
  readonly windowMinutes: number
  readonly hasRecordedConsent: boolean
  readonly revealCount: number
  readonly lastRevealAt: string | null
  readonly createdAt: string
}

interface GrantViewRow {
  grant_id: string
  admin_user_id: string
  admin_email_redacted: string | null
  admin_role: string
  subject_user_id: string
  subject_email_redacted: string | null
  scopes: string[]
  reason: string
  ticket_id: string | null
  status: string
  requested_at: string
  approved_by_admin_user_id: string | null
  approved_at: string | null
  granted_at: string | null
  expires_at: string
  denied_at: string | null
  revoked_at: string | null
  is_live: boolean
  minutes_remaining: number
  window_minutes: number
  has_recorded_consent: boolean
  reveal_count: number
  last_reveal_at: string | null
  created_at: string
}

const GRANT_COLUMNS =
  'grant_id,admin_user_id,admin_email_redacted,admin_role,subject_user_id,' +
  'subject_email_redacted,scopes,reason,ticket_id,status,requested_at,' +
  'approved_by_admin_user_id,approved_at,granted_at,expires_at,denied_at,revoked_at,' +
  'is_live,minutes_remaining,window_minutes,has_recorded_consent,reveal_count,' +
  'last_reveal_at,created_at'

function toGrant(row: GrantViewRow): SupportAccessGrant {
  return {
    grantId: row.grant_id,
    adminUserId: row.admin_user_id,
    adminEmailRedacted: row.admin_email_redacted,
    adminRole: row.admin_role,
    subjectUserId: row.subject_user_id,
    subjectEmailRedacted: row.subject_email_redacted,
    // A value the view produced that is not a member of the enum is dropped
    // rather than passed along: an unknown scope must never widen a grant.
    scopes: row.scopes.filter(isSupportAccessScope),
    reason: row.reason,
    ticketId: row.ticket_id,
    status: isSupportAccessStatus(row.status) ? row.status : 'expired',
    requestedAt: row.requested_at,
    approvedByAdminUserId: row.approved_by_admin_user_id,
    approvedAt: row.approved_at,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    deniedAt: row.denied_at,
    revokedAt: row.revoked_at,
    isLive: row.is_live,
    minutesRemaining: row.minutes_remaining,
    windowMinutes: row.window_minutes,
    hasRecordedConsent: row.has_recorded_consent,
    revealCount: row.reveal_count,
    lastRevealAt: row.last_reveal_at,
    createdAt: row.created_at,
  }
}

/** The subset every guard reads, as `redact.ts` wants it. */
export function toGrantSnapshot(grant: SupportAccessGrant): GrantSnapshot {
  return {
    grantId: grant.grantId,
    adminUserId: grant.adminUserId,
    subjectUserId: grant.subjectUserId,
    scopes: grant.scopes,
    status: grant.status,
    grantedAt: grant.grantedAt === null ? null : new Date(grant.grantedAt),
    expiresAt: new Date(grant.expiresAt),
    revokedAt: grant.revokedAt === null ? null : new Date(grant.revokedAt),
  }
}

/** One row of `bo_support_access_reveals` — who saw what, and when. */
export interface SupportAccessReveal {
  readonly revealId: string
  readonly grantId: string
  readonly adminUserId: string
  readonly adminEmailRedacted: string | null
  readonly adminRole: string
  readonly subjectUserId: string
  readonly scope: SupportAccessScope
  readonly entityType: string | null
  readonly entityId: string | null
  readonly itemCount: number
  readonly requestId: string | null
  readonly revealedAt: string
  readonly grantReason: string
  readonly grantExpiresAt: string
}

interface RevealViewRow {
  reveal_id: string
  grant_id: string
  admin_user_id: string
  admin_email_redacted: string | null
  admin_role: string
  subject_user_id: string
  scope: string
  entity_type: string | null
  entity_id: string | null
  item_count: number
  request_id: string | null
  revealed_at: string
  grant_reason: string
  grant_expires_at: string
}

const REVEAL_COLUMNS =
  'reveal_id,grant_id,admin_user_id,admin_email_redacted,admin_role,subject_user_id,' +
  'scope,entity_type,entity_id,item_count,request_id,revealed_at,grant_reason,grant_expires_at'

function toReveal(row: RevealViewRow): SupportAccessReveal | null {
  if (!isSupportAccessScope(row.scope)) return null
  return {
    revealId: row.reveal_id,
    grantId: row.grant_id,
    adminUserId: row.admin_user_id,
    adminEmailRedacted: row.admin_email_redacted,
    adminRole: row.admin_role,
    subjectUserId: row.subject_user_id,
    scope: row.scope,
    entityType: row.entity_type,
    entityId: row.entity_id,
    itemCount: row.item_count,
    requestId: row.request_id,
    revealedAt: row.revealed_at,
    grantReason: row.grant_reason,
    grantExpiresAt: row.grant_expires_at,
  }
}

// ===========================================================================
// 3. Reading
// ===========================================================================

export interface GrantListFilter {
  readonly status?: SupportAccessStatus
  readonly adminUserId?: string
  readonly subjectUserId?: string
  readonly liveOnly?: boolean
  readonly limit?: number
  readonly offset?: number
}

/** Server-side paginated. The whole table is never fetched into the browser. */
export async function listSupportAccessGrants(
  filter: GrantListFilter = {},
): Promise<AdminPage<SupportAccessGrant>> {
  const filters: AdminFilter[] = []
  if (filter.status !== undefined) {
    filters.push({ column: 'status', op: 'eq' as const, value: filter.status })
  }
  if (filter.adminUserId !== undefined) {
    filters.push({ column: 'admin_user_id', op: 'eq' as const, value: filter.adminUserId })
  }
  if (filter.subjectUserId !== undefined) {
    filters.push({ column: 'subject_user_id', op: 'eq' as const, value: filter.subjectUserId })
  }
  if (filter.liveOnly === true) {
    filters.push({ column: 'is_live', op: 'is' as const, value: true })
  }
  const page = await adminSelect<GrantViewRow>('bo_support_access_grants', {
    columns: GRANT_COLUMNS,
    filters,
    order: { column: 'requested_at', ascending: false },
    limit: filter.limit ?? 25,
    offset: filter.offset ?? 0,
  })
  return { rows: page.rows.map(toGrant), total: page.total }
}

export async function loadGrant(grantId: string): Promise<SupportAccessGrant | null> {
  const row = await adminSelectOne<GrantViewRow>('bo_support_access_grants', {
    columns: GRANT_COLUMNS,
    filters: [{ column: 'grant_id', op: 'eq', value: grantId }],
  })
  return row === null ? null : toGrant(row)
}

export interface RevealListFilter {
  readonly grantId?: string
  readonly adminUserId?: string
  readonly subjectUserId?: string
  readonly limit?: number
  readonly offset?: number
}

export async function listSupportAccessReveals(
  filter: RevealListFilter = {},
): Promise<AdminPage<SupportAccessReveal>> {
  const filters: AdminFilter[] = []
  if (filter.grantId !== undefined) {
    filters.push({ column: 'grant_id', op: 'eq' as const, value: filter.grantId })
  }
  if (filter.adminUserId !== undefined) {
    filters.push({ column: 'admin_user_id', op: 'eq' as const, value: filter.adminUserId })
  }
  if (filter.subjectUserId !== undefined) {
    filters.push({ column: 'subject_user_id', op: 'eq' as const, value: filter.subjectUserId })
  }
  const page = await adminSelect<RevealViewRow>('bo_support_access_reveals', {
    columns: REVEAL_COLUMNS,
    filters,
    order: { column: 'revealed_at', ascending: false },
    limit: filter.limit ?? 50,
    offset: filter.offset ?? 0,
  })
  const rows: SupportAccessReveal[] = []
  for (const row of page.rows) {
    const mapped = toReveal(row)
    if (mapped !== null) rows.push(mapped)
  }
  return { rows, total: page.total }
}

/**
 * The grants this admin currently holds, for the banner the console shows while
 * one is open.
 *
 * `is_live` is not trusted on its own: `admin_cleanup_expired()` moves a lapsed
 * grant to `expired` on a schedule, so between the lapse and the sweep the row
 * still reads active. The timestamps are re-checked here against the injected
 * clock, which is why a stale sweep is cosmetic rather than a hole.
 */
export async function loadActiveGrantsFor(
  adminUserId: string,
  clock: Clock = systemClock,
): Promise<readonly SupportAccessGrant[]> {
  const page = await listSupportAccessGrants({ adminUserId, status: 'active', limit: 20 })
  const now = clock.now()
  return page.rows.filter((grant) => isGrantLive(toGrantSnapshot(grant), now))
}

/** What the active-grant banner renders. */
export interface SupportAccessBanner {
  readonly grantId: string
  readonly subjectUserId: string
  readonly subjectEmailRedacted: string | null
  readonly scopes: readonly SupportAccessScope[]
  readonly reason: string
  readonly minutesRemaining: number
  readonly revealCount: number
}

export async function loadSupportAccessBanner(
  session: AdminSession,
  clock: Clock = systemClock,
): Promise<readonly SupportAccessBanner[]> {
  if (!sessionCan(session, 'support.access.reveal')) return []
  const grants = await loadActiveGrantsFor(session.adminUserId, clock)
  const now = clock.now()
  return grants.map((grant) => ({
    grantId: grant.grantId,
    subjectUserId: grant.subjectUserId,
    subjectEmailRedacted: grant.subjectEmailRedacted,
    scopes: grant.scopes,
    reason: grant.reason,
    minutesRemaining: grantMinutesRemaining(toGrantSnapshot(grant), now),
    revealCount: grant.revealCount,
  }))
}

// ===========================================================================
// 4. The workflow
// ===========================================================================

function requirePermissionOn(session: AdminSession, permission: AdminPermission): void {
  if (!sessionCan(session, permission)) {
    throw new AppError('forbidden', {
      status: 403,
      detail: `support access: ${session.role} does not hold ${permission}`,
    })
  }
}

/**
 * A state change that matched no row means somebody else moved the grant while
 * this form was open. Reporting success — and writing an audit row saying so —
 * would put a lie in the trail, so the transition is refused instead.
 */
function assertChanged(rows: readonly unknown[], grantId: string, transition: string): void {
  if (rows.length > 0) return
  throw new AppError('validation_failed', {
    status: 409,
    detail: `grant ${grantId} was not in a state that allows ${transition}`,
  })
}

function assertScopes(scopes: readonly string[]): readonly SupportAccessScope[] {
  const valid = scopes.filter(isSupportAccessScope)
  const unique = [...new Set(valid)]
  if (unique.length === 0) {
    throw new AppError('validation_failed', {
      status: 422,
      detail: 'a support access request must name at least one scope',
    })
  }
  // Keep the enum's own order so the stored array is comparable between rows.
  return SUPPORT_ACCESS_SCOPES.filter((scope) => unique.includes(scope))
}

function assertReason(reason: string, minimum: number): string {
  const trimmed = reason.trim()
  if (trimmed.length < minimum) {
    throw new AppError('validation_failed', {
      status: 422,
      detail: `a written reason of at least ${minimum} characters is required`,
    })
  }
  return trimmed.slice(0, MAX_SUPPORT_ACCESS_REASON)
}

export interface RequestSupportAccessInput {
  readonly session: AdminSession
  readonly subjectUserId: string
  readonly scopes: readonly string[]
  readonly reason: string
  readonly ticketId?: string | null
  readonly windowMinutes?: number
}

/**
 * Open a request. It grants nothing: the row lands as `pending_approval` and
 * only a second admin can make it usable.
 *
 * `requested_at` is written explicitly from the injected clock rather than left
 * to `now()`, so `expires_at = requested_at + window` satisfies the
 * twenty-four-hour ceiling exactly instead of by a few milliseconds of luck.
 */
export async function requestSupportAccess(
  input: RequestSupportAccessInput,
  clock: Clock = systemClock,
): Promise<SupportAccessGrant> {
  requirePermissionOn(input.session, 'support.access.request')
  const scopes = assertScopes(input.scopes)
  const reason = assertReason(input.reason, MIN_SUPPORT_ACCESS_REASON)
  const windowMinutes = clampWindowMinutes(
    input.windowMinutes ?? DEFAULT_SUPPORT_ACCESS_WINDOW_MINUTES,
  )

  await assertRateLimit(RATE_LIMITS.supportAccessRequest, adminBucket(input.session.adminUserId))

  const requestedAt = clock.now()
  const expiresAt = new Date(requestedAt.getTime() + windowMinutes * 60_000)

  const inserted = await adminInsert<{ id: string }>(
    'support_access_grants',
    {
      admin_user_id: input.session.adminUserId,
      subject_user_id: input.subjectUserId,
      scopes,
      reason,
      ticket_id: input.ticketId ?? null,
      status: 'pending_approval',
      requested_at: requestedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    'id',
  )

  await writeAudit({
    actor: { adminUserId: input.session.adminUserId },
    action: 'support_access.requested',
    subjectUserId: input.subjectUserId,
    entityType: 'support_access_grant',
    entityId: inserted.id,
    reason,
    supportAccessGrantId: inserted.id,
    detail: { scope_count: scopes.length, window_minutes: windowMinutes },
  })

  const grant = await loadGrant(inserted.id)
  if (grant === null) {
    throw new AppError('server_unavailable', {
      detail: 'support access grant vanished immediately after insert',
      retryable: true,
    })
  }
  return grant
}

export interface ApproveSupportAccessInput {
  readonly session: AdminSession
  readonly grantId: string
  /** The approver's own justification, kept beside the requester's. */
  readonly reason: string
}

/**
 * Approve a request and start its clock.
 *
 * The window is re-based on the approval so a request that waited an hour for a
 * reviewer does not arrive with most of its time already spent — clamped, as
 * the database insists, to twenty-four hours after the original request.
 *
 * Self-approval is refused here and, independently, by the `four_eyes` check
 * constraint. Both exist because the constraint is what makes it true and this
 * is what makes it a readable error rather than a 500.
 */
export async function approveSupportAccess(
  input: ApproveSupportAccessInput,
  clock: Clock = systemClock,
): Promise<SupportAccessGrant> {
  requirePermissionOn(input.session, 'support.access.approve')
  // Asked again at the source: approving somebody else's access to a stranger's
  // mailbox is the decision in this console with the least undo.
  await assertPermissionAtSource(input.session, 'support.access.approve')
  const reason = assertReason(input.reason, 3)

  const grant = await mustLoadGrant(input.grantId)
  if (grant.status !== 'pending_approval') {
    throw new AppError('validation_failed', {
      status: 422,
      detail: `grant ${input.grantId} is ${grant.status}, not pending approval`,
    })
  }
  if (grant.adminUserId === input.session.adminUserId) {
    throw new AppError('forbidden', {
      status: 403,
      detail: 'a support access request cannot be approved by its requester',
    })
  }

  // `support_access_grants_one_active` allows an admin one live grant per user,
  // so that "who could see this account, and when" has a single answer rather
  // than a set. A second approval would be refused by the index; saying so here
  // gives the approver the remedy instead of a constraint name.
  const live = await listSupportAccessGrants({
    adminUserId: grant.adminUserId,
    subjectUserId: grant.subjectUserId,
    status: 'active',
    limit: 1,
  })
  if (live.total > 0) {
    throw new AppError('validation_failed', {
      status: 409,
      detail:
        'the requesting admin already holds a live grant for this user; it must lapse or be revoked first',
    })
  }

  const now = clock.now()
  const requestedAt = new Date(grant.requestedAt)
  const ceiling = requestedAt.getTime() + MAX_SUPPORT_ACCESS_WINDOW_MINUTES * 60_000
  const rebased = now.getTime() + grant.windowMinutes * 60_000
  const expiresAt = new Date(Math.min(rebased, ceiling))

  if (expiresAt.getTime() <= now.getTime()) {
    throw new AppError('validation_failed', {
      status: 422,
      detail: 'the twenty-four hour ceiling has already passed for this request',
    })
  }

  const approved = await adminUpdate(
    'support_access_grants',
    {
      status: 'active',
      approved_by: input.session.adminUserId,
      approved_at: now.toISOString(),
      granted_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    [
      { column: 'id', op: 'eq', value: input.grantId },
      { column: 'status', op: 'eq', value: 'pending_approval' },
    ],
    'id',
  )
  assertChanged(approved, input.grantId, 'approval')

  await writeAudit({
    actor: { adminUserId: input.session.adminUserId },
    action: 'support_access.approved',
    subjectUserId: grant.subjectUserId,
    entityType: 'support_access_grant',
    entityId: input.grantId,
    reason,
    supportAccessGrantId: input.grantId,
    detail: { requested_by: grant.adminUserId, scope_count: grant.scopes.length },
  })

  return mustLoadGrant(input.grantId)
}

export interface DenySupportAccessInput {
  readonly session: AdminSession
  readonly grantId: string
  readonly reason: string
}

/** Refuse a request. The row stays, with the refusal and its reason on it. */
export async function denySupportAccess(
  input: DenySupportAccessInput,
  clock: Clock = systemClock,
): Promise<SupportAccessGrant> {
  requirePermissionOn(input.session, 'support.access.approve')
  await assertPermissionAtSource(input.session, 'support.access.approve')
  const reason = assertReason(input.reason, 3)
  const grant = await mustLoadGrant(input.grantId)
  if (grant.status !== 'pending_approval') {
    throw new AppError('validation_failed', {
      status: 422,
      detail: `grant ${input.grantId} is ${grant.status}, not pending approval`,
    })
  }

  const now = clock.now().toISOString()
  const denied = await adminUpdate(
    'support_access_grants',
    {
      status: 'denied',
      denied_by: input.session.adminUserId,
      denied_at: now,
      denied_reason: reason,
    },
    [
      { column: 'id', op: 'eq', value: input.grantId },
      { column: 'status', op: 'eq', value: 'pending_approval' },
    ],
    'id',
  )
  assertChanged(denied, input.grantId, 'denial')

  await writeAudit({
    actor: { adminUserId: input.session.adminUserId },
    action: 'support_access.denied',
    subjectUserId: grant.subjectUserId,
    entityType: 'support_access_grant',
    entityId: input.grantId,
    reason,
    supportAccessGrantId: input.grantId,
    detail: { requested_by: grant.adminUserId },
  })

  return mustLoadGrant(input.grantId)
}

export interface RevokeSupportAccessInput {
  readonly session: AdminSession
  readonly grantId: string
  readonly reason: string
}

/**
 * End a live grant early.
 *
 * Available to an approver and to the holder: an operator who realises they no
 * longer need the access should be able to hand it back without asking, and a
 * reviewer who does not like what they see should be able to take it away.
 */
export async function revokeSupportAccess(
  input: RevokeSupportAccessInput,
  clock: Clock = systemClock,
): Promise<SupportAccessGrant> {
  const grant = await mustLoadGrant(input.grantId)
  const isHolder = grant.adminUserId === input.session.adminUserId
  if (!isHolder) {
    requirePermissionOn(input.session, 'support.access.approve')
    await assertPermissionAtSource(input.session, 'support.access.approve')
  }

  const reason = assertReason(input.reason, 3)
  if (grant.status !== 'active' && grant.status !== 'pending_approval') {
    throw new AppError('validation_failed', {
      status: 422,
      detail: `grant ${input.grantId} is ${grant.status} and cannot be revoked`,
    })
  }

  const now = clock.now().toISOString()
  const revoked = await adminUpdate(
    'support_access_grants',
    {
      status: 'revoked',
      revoked_by: input.session.adminUserId,
      revoked_at: now,
      revoked_reason: reason,
    },
    [
      { column: 'id', op: 'eq', value: input.grantId },
      { column: 'revoked_at', op: 'is', value: null },
    ],
    'id',
  )
  assertChanged(revoked, input.grantId, 'revocation')

  await writeAudit({
    actor: { adminUserId: input.session.adminUserId },
    action: 'support_access.revoked',
    subjectUserId: grant.subjectUserId,
    entityType: 'support_access_grant',
    entityId: input.grantId,
    reason,
    supportAccessGrantId: input.grantId,
    detail: { revoked_by_holder: isHolder, reveal_count: grant.revealCount },
  })

  return mustLoadGrant(input.grantId)
}

/**
 * Record that the user themselves agreed to this access.
 *
 * Optional today, which is why `user_consent_ref` is nullable. Recording it can
 * only strengthen a grant: nothing in the reveal path is unlocked by consent,
 * and nothing is blocked by its absence — so this is a fact added to the
 * record, not a control that changes what an operator may do.
 */
export async function recordUserConsent(
  input: { session: AdminSession; grantId: string; consentRef: string },
  clock: Clock = systemClock,
): Promise<SupportAccessGrant> {
  const grant = await mustLoadGrant(input.grantId)
  if (grant.adminUserId !== input.session.adminUserId) {
    requirePermissionOn(input.session, 'support.access.approve')
  }
  const ref = input.consentRef.trim()
  if (ref === '') {
    throw new AppError('validation_failed', {
      status: 422,
      detail: 'a consent reference cannot be blank',
    })
  }
  const stamped = await adminUpdate(
    'support_access_grants',
    { user_consent_ref: ref.slice(0, 200), user_consent_at: clock.now().toISOString() },
    [{ column: 'id', op: 'eq', value: input.grantId }],
    'id',
  )
  assertChanged(stamped, input.grantId, 'consent recording')
  return mustLoadGrant(input.grantId)
}

async function mustLoadGrant(grantId: string): Promise<SupportAccessGrant> {
  const grant = await loadGrant(grantId)
  if (grant === null) {
    throw new AppError('not_found', { status: 404, detail: `no support access grant ${grantId}` })
  }
  return grant
}

// ===========================================================================
// 5. Revealing
//
// One wrapper per `sa_reveal_*` function. Every one of them runs the same four
// steps before it opens a connection, so there is no spelling of "read this
// user's content" that skips one.
// ===========================================================================

export interface RevealContext {
  readonly session: AdminSession
  readonly grantId: string
  /** Correlates the audit row, the reveal row and the render. */
  readonly requestId?: string
}

/**
 * Assert, rate-limit, call, audit.
 *
 * `assertRevealAllowed()` is the pure guard from `redact.ts` and is the reason
 * an attempt without a grant never reaches Postgres. `sa_assert_grant()` checks
 * the same six things again inside the reveal function, and the trigger on
 * `support_access_reveals` checks them a third time on the log row. This is the
 * outermost of the three, and the only one that can produce a readable Turkish
 * error instead of an exception.
 */
async function reveal<Row>(
  context: RevealContext,
  scope: SupportAccessScope,
  entityType: string,
  entityId: string | null,
  call: (grant: SupportAccessGrant, requestId: string) => Promise<unknown[]>,
  clock: Clock,
): Promise<readonly Row[]> {
  const grant = await mustLoadGrant(context.grantId)

  assertRevealAllowed({
    grant: toGrantSnapshot(grant),
    adminUserId: context.session.adminUserId,
    subjectUserId: grant.subjectUserId,
    scope,
    permissions: context.session.permissions,
    now: clock.now(),
  })

  await assertRateLimit(RATE_LIMITS.supportAccessReveal, grantBucket(grant.grantId))

  const requestId = context.requestId ?? crypto.randomUUID()
  const rows = await call(grant, requestId)

  // Written after the call, so a refusal inside Postgres does not leave an
  // audit row claiming a reveal that never returned anything. The reveal row
  // itself is written by the database in the same statement as the read, so the
  // two cannot come apart in the other direction either.
  await writeAudit({
    actor: { adminUserId: context.session.adminUserId },
    action: 'support_access.revealed',
    subjectUserId: grant.subjectUserId,
    entityType,
    entityId,
    reason: grant.reason,
    supportAccessGrantId: grant.grantId,
    detail: { scope, item_count: rows.length, request_id: requestId },
  })

  // The row shapes are fixed by the `returns table (…)` clauses in 0019. The
  // assertion is the boundary between "whatever PostgREST decoded" and the
  // typed rows a page renders.
  return rows as readonly Row[]
}

export interface RevealedIdentity {
  user_id: string
  email: string
  display_name: string | null
  given_name: string | null
  locale: string
  time_zone: string
  created_at: string
}

export async function revealIdentity(
  context: RevealContext,
  clock: Clock = systemClock,
): Promise<readonly RevealedIdentity[]> {
  return reveal<RevealedIdentity>(
    context,
    'identity',
    'profile',
    null,
    (grant, requestId) =>
      adminRpc('sa_reveal_identity', {
        p_grant_id: grant.grantId,
        p_admin_user_id: context.session.adminUserId,
        p_request_id: requestId,
      }),
    clock,
  )
}

export interface RevealedEmailSubject {
  thread_id: string
  subject: string | null
  summary: string | null
  category: string | null
  importance: string | null
  message_count: number
  last_message_at: string | null
}

export async function revealEmailSubjects(
  context: RevealContext & { limit?: number },
  clock: Clock = systemClock,
): Promise<readonly RevealedEmailSubject[]> {
  const limit = Math.min(Math.max(context.limit ?? 50, 1), 200)
  return reveal<RevealedEmailSubject>(
    context,
    'email_subject',
    'email_thread',
    null,
    (grant, requestId) =>
      adminRpc('sa_reveal_email_subjects', {
        p_grant_id: grant.grantId,
        p_admin_user_id: context.session.adminUserId,
        p_limit: limit,
        p_request_id: requestId,
      }),
    clock,
  )
}

export interface RevealedEmailMessage {
  message_id: string
  thread_id: string
  subject: string | null
  from_email: string | null
  from_name: string | null
  to_emails: string[] | null
  sent_at: string | null
  snippet: string | null
  body_text: string | null
}

export async function revealEmailMessage(
  context: RevealContext & { messageId: string },
  clock: Clock = systemClock,
): Promise<readonly RevealedEmailMessage[]> {
  return reveal<RevealedEmailMessage>(
    context,
    'email_body',
    'email_message',
    context.messageId,
    (grant, requestId) =>
      adminRpc('sa_reveal_email_message', {
        p_grant_id: grant.grantId,
        p_admin_user_id: context.session.adminUserId,
        p_message_id: context.messageId,
        p_request_id: requestId,
      }),
    clock,
  )
}

export interface RevealedCalendarEvent {
  event_id: string
  title: string | null
  description: string | null
  location: string | null
  organizer_email: string | null
  starts_at: string
  ends_at: string | null
}

export async function revealCalendarEvents(
  context: RevealContext & { from: Date; to: Date },
  clock: Clock = systemClock,
): Promise<readonly RevealedCalendarEvent[]> {
  return reveal<RevealedCalendarEvent>(
    context,
    'calendar_detail',
    'calendar_event',
    null,
    (grant, requestId) =>
      adminRpc('sa_reveal_calendar_events', {
        p_grant_id: grant.grantId,
        p_admin_user_id: context.session.adminUserId,
        p_from: context.from.toISOString(),
        p_to: context.to.toISOString(),
        p_request_id: requestId,
      }),
    clock,
  )
}

export interface RevealedAssistantMessage {
  message_id: string
  role: string
  content: string
  model: string | null
  created_at: string
}

export async function revealAssistantThread(
  context: RevealContext & { threadId: string },
  clock: Clock = systemClock,
): Promise<readonly RevealedAssistantMessage[]> {
  return reveal<RevealedAssistantMessage>(
    context,
    'assistant_conversation',
    'assistant_thread',
    context.threadId,
    (grant, requestId) =>
      adminRpc('sa_reveal_assistant_thread', {
        p_grant_id: grant.grantId,
        p_admin_user_id: context.session.adminUserId,
        p_thread_id: context.threadId,
        p_request_id: requestId,
      }),
    clock,
  )
}

export interface RevealedCapture {
  capture_id: string
  kind: string
  status: string
  raw_text: string | null
  extracted: unknown
  source_url: string | null
  storage_path: string | null
  created_at: string
}

export async function revealCapture(
  context: RevealContext & { captureId: string },
  clock: Clock = systemClock,
): Promise<readonly RevealedCapture[]> {
  return reveal<RevealedCapture>(
    context,
    'capture_content',
    'capture',
    context.captureId,
    (grant, requestId) =>
      adminRpc('sa_reveal_capture', {
        p_grant_id: grant.grantId,
        p_admin_user_id: context.session.adminUserId,
        p_capture_id: context.captureId,
        p_request_id: requestId,
      }),
    clock,
  )
}

export interface RevealedApproval {
  approval_id: string
  type: string
  status: string
  what: string | null
  why: string | null
  payload: unknown
  original_payload: unknown
  created_at: string
}

export async function revealApproval(
  context: RevealContext & { approvalId: string },
  clock: Clock = systemClock,
): Promise<readonly RevealedApproval[]> {
  return reveal<RevealedApproval>(
    context,
    'approval_payload',
    'approval_action',
    context.approvalId,
    (grant, requestId) =>
      adminRpc('sa_reveal_approval', {
        p_grant_id: grant.grantId,
        p_admin_user_id: context.session.adminUserId,
        p_approval_id: context.approvalId,
        p_request_id: requestId,
      }),
    clock,
  )
}

export interface RevealedNotification {
  delivery_id: string
  category: string
  title: string | null
  body: string | null
  scheduled_for: string | null
  sent_at: string | null
  failed_at: string | null
}

export async function revealNotification(
  context: RevealContext & { deliveryId: string },
  clock: Clock = systemClock,
): Promise<readonly RevealedNotification[]> {
  return reveal<RevealedNotification>(
    context,
    'notification_content',
    'notification_delivery',
    context.deliveryId,
    (grant, requestId) =>
      adminRpc('sa_reveal_notification', {
        p_grant_id: grant.grantId,
        p_admin_user_id: context.session.adminUserId,
        p_delivery_id: context.deliveryId,
        p_request_id: requestId,
      }),
    clock,
  )
}

// Re-exported so a page importing the workflow also gets the vocabulary it
// renders, without reaching into the redaction module for a scope label.
export {
  SUPPORT_ACCESS_SCOPES,
  SCOPE_DESCRIPTIONS_TR,
  SCOPE_LABELS_TR,
  SCOPE_SENSITIVITY_ORDER,
  SUPPORT_ACCESS_STATUSES,
  formatMinutesRemainingTr,
  isSupportAccessScope,
  type SupportAccessScope,
  type SupportAccessStatus,
} from './redact.ts'
