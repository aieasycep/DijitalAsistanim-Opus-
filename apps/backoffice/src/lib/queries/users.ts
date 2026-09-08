import 'server-only'

import {
  APPROVAL_STATUSES,
  PRO_ENTITLEMENT_ID,
  addLocalDays,
  hasFeature,
  isAppError,
  resolveEntitlements,
  scopesFor,
  systemClock,
  toIsoDate,
  type ApprovalStatus,
  type BriefingKind,
  type Clock,
  type Entitlements,
  type Feature,
  type NotificationCategory,
  type Provider,
  type ScopeGroup,
  type SubscriptionStatus,
} from '@da/domain'
import {
  USERS_PAGE_SIZE,
  isQueryableSearch,
  type UserListParams,
  type UserSort,
} from '@/components/users/params'
import {
  countView,
  queryView,
  queryViewOne,
  queryViewPage,
  type BoAccountRow,
  type BoApprovalRow,
  type BoAuditRow,
  type BoBriefingHealthRow,
  type BoNotificationHealthRow,
  type BoPrivacyRequestRow,
  type BoReferralRow,
  type BoSyncHealthRow,
  type BoUserDetailRow,
  type BoUserRow,
  type ViewFilter,
  type ViewOrder,
  type ViewPage,
} from '@/lib/db'
import { OPS_TIME_ZONE } from '@/lib/format'
import { messages } from '@/lib/messages'

/**
 * Every query behind the users area, in one module.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE IS ALLOWED TO ASK FOR
 * ---------------------------------------------------------------------------
 *
 * Nothing here selects a column. It calls `queryView` / `countView` from
 * `@/lib/db`, which accept only the `bo_*` view names, and migration 0017
 * guarantees those views have no content column to select. So the strongest
 * statement about this file is not "it avoids reading mail" — it is that there
 * is no expression in it that could.
 *
 * Two consequences shape the code below:
 *
 *   1. Counting happens in Postgres. `countView` issues `count=exact` with
 *      `head: true`, so a status breakdown is seven counts over an index and
 *      not one page of rows tallied in a loop. The only arithmetic in this file
 *      is over numbers Postgres already aggregated.
 *
 *   2. Lookup is by identifier or by mask, never by address. The search box has
 *      already reduced whatever was typed to a uuid, a `y•••@example.com` mask
 *      or a domain — see `@/components/users/params`, which both sides of the
 *      boundary share — and `listUsers` refuses to run anything else, so a full
 *      address reaches neither PostgREST nor the URL the operator ends up on.
 */

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result that carries its own failure instead of throwing upward, so a
 * panel that cannot load renders an error where it stands and the rest of the
 * page still answers the support question.
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

const SORT_ORDERS: Readonly<Record<UserSort, readonly ViewOrder<BoUserRow>[]>> = {
  yeni: [{ column: 'created_at', ascending: false }],
  etkinlik: [{ column: 'last_activity_at', ascending: false }],
  // Stalest first: an account that has never synced sorts above one that
  // synced a month ago, because "never" is the worse answer to a support call.
  bayat: [{ column: 'last_synced_at', ascending: true, nullsFirst: true }],
}

function listFilters(params: UserListParams): readonly ViewFilter<BoUserRow>[] {
  const filters: ViewFilter<BoUserRow>[] = []

  switch (params.search.kind) {
    case 'user_id':
      filters.push({ column: 'user_id', op: 'eq', value: params.search.userId })
      break
    case 'redacted':
      // Two candidates: the mask as typed and its lower-cased form. The stored
      // address decides the case of the first character, and an operator
      // retyping a mask from a screenshot will not always match it.
      filters.push({
        column: 'email_redacted',
        op: 'in',
        value: [params.search.redacted, params.search.redacted.toLowerCase()],
      })
      break
    case 'domain':
      filters.push({ column: 'email_domain', op: 'eq', value: params.search.domain })
      break
    default:
      break
  }

  if (params.plan) filters.push({ column: 'subscription_status', op: 'eq', value: params.plan })

  switch (params.health) {
    case 'saglikli':
      filters.push({ column: 'account_connected_count', op: 'gte', value: 1 })
      filters.push({ column: 'account_error_count', op: 'eq', value: 0 })
      filters.push({ column: 'sync_error_count', op: 'eq', value: 0 })
      break
    case 'baglanti_yok':
      filters.push({ column: 'account_count', op: 'eq', value: 0 })
      break
    case 'hatali_baglanti':
      filters.push({ column: 'account_error_count', op: 'gte', value: 1 })
      break
    case 'senk_hatasi':
      filters.push({ column: 'sync_error_count', op: 'gte', value: 1 })
      break
    default:
      break
  }

  if (params.onboarding === 'tamam') {
    filters.push({ column: 'is_onboarded', op: 'is', value: true })
  } else if (params.onboarding === 'eksik') {
    filters.push({ column: 'is_onboarded', op: 'is', value: false })
  }

  if (params.deleted === 'haric') filters.push({ column: 'is_deleted', op: 'is', value: false })
  if (params.deleted === 'sadece') filters.push({ column: 'is_deleted', op: 'is', value: true })

  return filters
}

/**
 * One page of the roster, with the exact total behind it.
 *
 * A search the tool refuses to run (a full address, a partial id) returns an
 * empty page rather than a query: the caller renders the reason, and no
 * unusable value is sent to PostgREST.
 */
export async function listUsers(params: UserListParams): Promise<ViewPage<BoUserRow>> {
  if (!isQueryableSearch(params.search)) return { rows: [], total: 0 }

  return queryViewPage('bo_users', {
    filters: listFilters(params),
    order: SORT_ORDERS[params.sort],
    limit: USERS_PAGE_SIZE,
    offset: (params.page - 1) * USERS_PAGE_SIZE,
  })
}

// ===========================================================================
// One user
// ===========================================================================

export async function loadUserDetail(userId: string): Promise<BoUserDetailRow | null> {
  return queryViewOne('bo_user_detail', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
  })
}

export async function loadUserAccounts(userId: string): Promise<readonly BoAccountRow[]> {
  return queryView('bo_accounts', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
    order: [
      { column: 'is_primary', ascending: false },
      { column: 'created_at', ascending: true },
    ],
    limit: 20,
  })
}

/**
 * Sync state per resource, worst first: most consecutive failures at the top,
 * then the ones that have gone longest without a run. Ordering by status would
 * sort by the enum's declaration order, which puts `idle` above `error`.
 */
export async function loadUserSyncHealth(userId: string): Promise<readonly BoSyncHealthRow[]> {
  return queryView('bo_sync_health', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
    order: [
      { column: 'consecutive_failures', ascending: false },
      { column: 'last_run_at', ascending: true, nullsFirst: true },
    ],
    limit: 40,
  })
}

/** The user's most recent approvals, newest first — states and timings only. */
export async function loadUserApprovals(userId: string): Promise<readonly BoApprovalRow[]> {
  return queryView('bo_approvals', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
    order: { column: 'created_at', ascending: false },
    limit: 10,
  })
}

export interface ApprovalStatusCount {
  status: ApprovalStatus
  count: number
}

/**
 * Approvals by status, counted by Postgres.
 *
 * Seven `count=exact` head requests rather than one page of rows tallied in
 * JavaScript: the answer stays correct past the first page, and no approval row
 * — the table that holds a fully drafted outgoing email — is ever fetched to
 * produce a number.
 */
export async function loadApprovalBreakdown(
  userId: string,
): Promise<readonly ApprovalStatusCount[]> {
  const counts = await Promise.all(
    APPROVAL_STATUSES.map((status) =>
      countView('bo_approvals', [
        { column: 'user_id', op: 'eq', value: userId },
        { column: 'status', op: 'eq', value: status },
      ]),
    ),
  )
  return APPROVAL_STATUSES.map((status, index) => ({ status, count: counts[index] ?? 0 }))
}

export async function loadUserReferral(userId: string): Promise<BoReferralRow | null> {
  return queryViewOne('bo_referrals', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
  })
}

export async function loadUserPrivacyRequests(
  userId: string,
): Promise<readonly BoPrivacyRequestRow[]> {
  return queryView('bo_privacy_requests', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
    order: { column: 'requested_at', ascending: false },
    limit: 5,
  })
}

export async function loadUserAudit(userId: string, limit = 12): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [{ column: 'subject_user_id', op: 'eq', value: userId }],
    order: { column: 'created_at', ascending: false },
    limit,
  })
}

// ===========================================================================
// Pipeline context
//
// Per-user briefing and notification outcomes do not exist as columns: a
// `notification_deliveries` row carries the title and body that were pushed,
// and 0017 aggregates it by day and category rather than projecting it per
// user. What an operator gets instead is the same window of the platform's
// pipeline, which is what actually answers "did anyone's briefing arrive?".
// ===========================================================================

export const PIPELINE_WINDOW_DAYS = 7

/** The briefing categories a "my briefing did not arrive" call is ever about. */
export const BRIEFING_NOTIFICATION_CATEGORIES = [
  'morning_briefing',
  'midday_pulse',
  'evening_close',
  'weekly_review',
] as const satisfies readonly NotificationCategory[]

/** First day of the pipeline window, as a local `YYYY-MM-DD`. */
export function pipelineWindowStart(clock: Clock = systemClock): string {
  return toIsoDate(
    addLocalDays(clock.now(), -(PIPELINE_WINDOW_DAYS - 1), OPS_TIME_ZONE),
    OPS_TIME_ZONE,
  )
}

export async function loadBriefingHealth(
  clock: Clock = systemClock,
): Promise<readonly BoBriefingHealthRow[]> {
  return queryView('bo_briefing_health', {
    filters: [{ column: 'for_date', op: 'gte', value: pipelineWindowStart(clock) }],
    order: [
      { column: 'for_date', ascending: false },
      { column: 'kind', ascending: true },
    ],
    limit: 40,
  })
}

export async function loadNotificationHealth(
  clock: Clock = systemClock,
): Promise<readonly BoNotificationHealthRow[]> {
  return queryView('bo_notification_health', {
    filters: [
      { column: 'delivery_date', op: 'gte', value: pipelineWindowStart(clock) },
      { column: 'category', op: 'in', value: BRIEFING_NOTIFICATION_CATEGORIES },
    ],
    order: [
      { column: 'delivery_date', ascending: false },
      { column: 'category', ascending: true },
    ],
    limit: 40,
  })
}

// ===========================================================================
// The staff action's trail
// ===========================================================================

/** The audit action a briefing regeneration request writes. */
export const BRIEFING_REGENERATE_ACTION = 'briefing.regenerate_requested'

/** `entity_id` for a request: the local date and the kind, in one token. */
export function briefingEntityId(forDate: string, kind: BriefingKind): string {
  return `${forDate}:${kind}`
}

export async function loadRegenerationRequests(
  userId: string,
  limit = 8,
): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [
      { column: 'subject_user_id', op: 'eq', value: userId },
      { column: 'action', op: 'eq', value: BRIEFING_REGENERATE_ACTION },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  })
}

// ===========================================================================
// Derivations
// ===========================================================================

/**
 * The plan and why the user has it.
 *
 * `resolveEntitlements` in @da/domain is the one definition of Pro in this
 * product, so the backoffice asks it rather than re-deriving the rule from a
 * status string. It wants the RevenueCat entitlement id, which `bo_user_detail`
 * does not project — `subscriptions.entitlement` is not a content column, it is
 * simply not in the view — so the presence of a store is used in its place:
 * `subscriptions` is written only by the RevenueCat webhook, and a row with a
 * store is a row that came from a real purchase.
 *
 * A referral bonus is invisible here on purpose. `bo_referrals` is keyed by the
 * owner of a code, not by who the bonus days landed on, so it cannot answer
 * "does this user hold an unexpired bonus" — and guessing would be worse than
 * the caveat the screen prints beside this value.
 */
export function deriveEntitlements(row: BoUserDetailRow, clock: Clock = systemClock): Entitlements {
  return resolveEntitlements({
    subscriptionStatus: row.subscription_status as SubscriptionStatus,
    activeEntitlement: row.subscription_store === null ? null : PRO_ENTITLEMENT_ID,
    referralBonusExpiresAt: null,
    now: clock.now(),
  })
}

/** The Pro feature each briefing kind needs. Morning is in every plan. */
export const BRIEFING_KIND_FEATURE: Readonly<Record<BriefingKind, Feature | null>> = {
  morning: null,
  midday: 'midday_pulse',
  evening: 'evening_close',
  weekly: 'weekly_review',
}

export function briefingKindAllowed(entitlements: Entitlements, kind: BriefingKind): boolean {
  const feature = BRIEFING_KIND_FEATURE[kind]
  return feature === null ? true : hasFeature(entitlements, feature)
}

/** Whether an account is missing the read scope its kind needs to sync. */
export interface MissingScope {
  kind: 'mail' | 'calendar'
  scopes: readonly string[]
}

/** Only these two providers have a scope table; the rest grant nothing to check. */
const SCOPE_PROVIDERS: readonly Provider[] = ['google', 'microsoft']

/** The read scope group each syncable account kind depends on. */
const READ_SCOPE_GROUP = {
  mail: 'mailRead',
  calendar: 'calendarRead',
} as const satisfies Record<MissingScope['kind'], ScopeGroup>

/**
 * Read scopes an account should hold but does not.
 *
 * `granted_scopes` is a list of provider capability URLs — a description of
 * what the app may do, never of what the mailbox contains — and it is the most
 * common reason a briefing turns up empty: a Gmail grant without
 * `gmail.readonly` syncs nothing, and from the user's side that is
 * indistinguishable from the assistant being broken. Derived from @da/domain's
 * scope table so the backoffice and the connect flow cannot disagree about what
 * a working grant looks like.
 */
export function missingReadScopes(account: BoAccountRow): readonly MissingScope[] {
  const provider = account.provider as Provider
  if (!SCOPE_PROVIDERS.includes(provider)) return []

  const granted = new Set(account.granted_scopes.map((scope) => scope.toLowerCase()))
  const missing: MissingScope[] = []

  for (const kind of ['mail', 'calendar'] as const) {
    if (!account.kinds.includes(kind)) continue
    const absent = scopesFor(provider, [READ_SCOPE_GROUP[kind]]).filter(
      (scope) => !granted.has(scope.toLowerCase()),
    )
    if (absent.length > 0) missing.push({ kind, scopes: absent })
  }

  return missing
}
