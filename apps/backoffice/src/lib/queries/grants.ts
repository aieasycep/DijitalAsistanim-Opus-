import 'server-only'

import {
  PRO_ENTITLEMENT_ID,
  isAppError,
  resolveEntitlements,
  systemClock,
  type Clock,
  type Entitlements,
  type SubscriptionStatus,
} from '@da/domain'
import {
  countView,
  queryTable,
  queryView,
  queryViewOne,
  queryViewPage,
  type AdminGrantKind,
  type BoAdminUserRow,
  type BoAuditRow,
  type BoEntitlementGrantRow,
  type BoEntitlementSourceRow,
  type ViewFilter,
  type ViewOrder,
  type ViewPage,
} from '@/lib/db'
import { messages } from '@/lib/messages'
import {
  DEFAULT_GRANT_SORT,
  GRANTS_PAGE_SIZE,
  GRANT_TRAIL_LIMIT,
  type EntitlementSource,
  type GrantEffect,
  type GrantKind,
  type GrantListParams,
  type GrantSort,
  type GrantSortKey,
} from '@/components/grants/contract'

/**
 * Every read behind the temporary-Pro area.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE MAY SEE
 * ---------------------------------------------------------------------------
 *
 * `bo_entitlement_grants` and `bo_entitlement_sources`, and for the people on a
 * row, `bo_admin_users` and `bo_audit`. All four are content-blind by
 * construction: the grant view projects a kind, a length, an operator's own
 * written reason, two timestamps and `bo_redact_email()` of the account's
 * address — never a message, never a subject line, never a token. The
 * foundation's `queryView` accepts only `BoViewName`, so there is no spelling
 * of a query here that reaches a base table.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Counting happens in Postgres. `countView` issues a HEAD request with
 * `count=exact` — a real `count(*)` with no row bodies crossing the wire — and
 * `queryViewPage` returns the exact total beside a bounded page.
 *
 * Two figures cannot be counted that way, because they are sums and PostgREST
 * exposes no aggregate through this foundation: the outstanding grant-days and
 * the per-admin period breakdown. Both are computed from a bounded page and
 * both report whether that page was the whole population, so the screen can say
 * "this is the total" or "this is at least the total" rather than quietly
 * implying the first. See `loadLiveExposure` and `loadPeriodBudget`.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT DECIDE
 * ---------------------------------------------------------------------------
 *
 * Whether an account is Pro. `resolveEntitlements()` in @da/domain is the one
 * definition of Pro in this product, and `resolveGrantPicture` below asks it
 * rather than re-deriving the rule from a status string. It is asked with the
 * store subscription and the referral bonus — the two inputs it has — and never
 * with the grant, because the function has no parameter for one. That is the
 * fact the screen is built to report.
 */

// ===========================================================================
// The vocabulary is the database's
//
// `contract.ts` re-declares `admin_grant_kind` because it is imported by Client
// Components and `@/lib/db` is `server-only`. The aliases below prove the two
// declarations still name the same members: each fails to compile the moment
// one side gains a member the other lacks. They carry no runtime weight.
// ===========================================================================

type Covers<Narrow extends Wide, Wide> = Narrow

export type ConsoleKindsExist = Covers<GrantKind, AdminGrantKind>
export type DatabaseKindsAreLabelled = Covers<AdminGrantKind, GrantKind>

/** The audit rows that belong to a grant all name this entity type. */
export const GRANT_ENTITY_TYPE = 'entitlement_grant'

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result that carries its own failure instead of throwing upward, so a
 * panel that cannot load renders an error where it stands — and never renders
 * as "no grants", which on this screen would read as "nobody is giving Pro
 * away" to the one person whose job is to know whether they are.
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

const SORT_COLUMNS: Readonly<Record<GrantSortKey, keyof BoEntitlementGrantRow & string>> =
  Object.freeze({
    granted_at: 'granted_at',
    expires_at: 'expires_at',
    days: 'days',
    days_remaining: 'days_remaining',
  })

function listOrder(sort: GrantSort): readonly ViewOrder<BoEntitlementGrantRow>[] {
  const ascending = sort.direction === 'asc'
  return [
    { column: SORT_COLUMNS[sort.key], ascending, nullsFirst: false },
    // A tiebreak, so two grants written in the same transaction do not swap
    // places between page one and page two.
    { column: 'grant_id', ascending: false },
  ]
}

/**
 * The filters, expressed against columns the view already computes.
 *
 * `is_live` is the view's own `revoked_at is null and expires_at > now() and
 * granted_at <= now()`, evaluated in Postgres against Postgres's clock. Asking
 * for "not live and not revoked" is therefore exactly "lapsed on its own",
 * without this module having to send an instant of its own into the comparison
 * and risk disagreeing with the badge the same row renders.
 */
function listFilters(params: GrantListParams): readonly ViewFilter<BoEntitlementGrantRow>[] {
  const filters: ViewFilter<BoEntitlementGrantRow>[] = []

  if (params.status === 'live') {
    filters.push({ column: 'is_live', op: 'is', value: true })
  } else if (params.status === 'expired') {
    filters.push({ column: 'is_live', op: 'is', value: false })
    filters.push({ column: 'revoked_at', op: 'is', value: null })
  } else if (params.status === 'revoked') {
    filters.push({ column: 'revoked_at', op: 'is_not', value: null })
  }

  if (params.kind !== null) {
    filters.push({ column: 'kind', op: 'eq', value: params.kind })
  }
  if (params.admin !== null) {
    filters.push({ column: 'granted_by_admin_user_id', op: 'eq', value: params.admin })
  }

  return filters
}

/** One page of grants, with the exact total behind it. */
export async function listGrants(
  params: GrantListParams,
  sort: GrantSort = DEFAULT_GRANT_SORT,
): Promise<ViewPage<BoEntitlementGrantRow>> {
  return queryViewPage('bo_entitlement_grants', {
    filters: listFilters(params),
    order: listOrder(sort),
    limit: GRANTS_PAGE_SIZE,
    offset: (params.page - 1) * GRANTS_PAGE_SIZE,
  })
}

export async function loadGrant(grantId: string): Promise<BoEntitlementGrantRow | null> {
  return queryViewOne('bo_entitlement_grants', {
    filters: [{ column: 'grant_id', op: 'eq', value: grantId }],
  })
}

const NO_REVOCATIONS: ReadonlyMap<string, string | null> = new Map()

/**
 * Why each of these grants was revoked, keyed by grant id.
 *
 * `bo_entitlement_grants` reports *that* a grant was revoked and by whom, but
 * not the sentence the operator typed — and "geri alındı" without a reason is
 * exactly the half-record this area exists to prevent. `revoked_reason` lives
 * on `admin_entitlement_grants`, which is an operator-owned table: a kind, a
 * length, two written justifications and some ids. There is nothing of a user's
 * in it to blind, which is why 0019 put it outside the `bo_*` boundary in the
 * first place, and the columns are named explicitly rather than selected with
 * `*` so the projection stays a decision.
 *
 * One request for a whole page, never one per row.
 */
export async function loadRevocationReasons(
  grantIds: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  const unique = [...new Set(grantIds)]
  if (unique.length === 0) return NO_REVOCATIONS

  const rows = await queryTable('admin_entitlement_grants', {
    columns: ['id', 'revoked_reason'],
    filters: [
      { column: 'id', op: 'in', value: unique },
      { column: 'revoked_at', op: 'is_not', value: null },
    ],
    limit: unique.length,
  })
  return new Map(rows.map((row) => [row.id, row.revoked_reason]))
}

// ===========================================================================
// What is outstanding right now
// ===========================================================================

/**
 * How many live grants may be summed in one page.
 *
 * A sum has to be computed from rows, and rows have to be bounded. Operator
 * grants are rare by design — every one costs somebody a written sentence — so
 * five hundred covers the real population many times over; past it the tile
 * says it is reporting a floor rather than a total, which is the only honest
 * thing a bounded sum can say.
 */
export const LIVE_SAMPLE_LIMIT = 500

export interface LiveExposure {
  /** Exact `count(*)` of grants in force. */
  readonly liveCount: number
  /** Sum of `days_remaining` over the rows that were read. */
  readonly outstandingDays: number
  /** True when the rows read were every live grant, so the sum is the total. */
  readonly exact: boolean
  /** How many rows the sum is over. */
  readonly sampleSize: number
}

/**
 * The two "right now" numbers: how many grants are in force and how many Pro
 * days they still owe.
 *
 * `days_remaining` is computed by the view from `expires_at` and Postgres's
 * clock, so a grant that lapsed a minute ago contributes zero here without this
 * module needing an opinion about the time. The count is exact; the sum is
 * exact whenever the population fits in one page, and says so.
 */
export async function loadLiveExposure(): Promise<LiveExposure> {
  const liveFilter: readonly ViewFilter<BoEntitlementGrantRow>[] = [
    { column: 'is_live', op: 'is', value: true },
  ]

  const [liveCount, rows] = await Promise.all([
    countView('bo_entitlement_grants', liveFilter),
    queryView('bo_entitlement_grants', {
      columns: ['days_remaining'],
      filters: liveFilter,
      // Longest first, so a truncated sum is the largest floor available rather
      // than an arbitrary one.
      order: { column: 'days_remaining', ascending: false, nullsFirst: false },
      limit: LIVE_SAMPLE_LIMIT,
    }),
  ])

  let outstandingDays = 0
  for (const row of rows) outstandingDays += row.days_remaining

  return {
    liveCount,
    outstandingDays,
    exact: rows.length >= liveCount,
    sampleSize: rows.length,
  }
}

// ===========================================================================
// The period budget
// ===========================================================================

/**
 * How many grants of one window may be tallied per admin.
 *
 * Same reasoning as `LIVE_SAMPLE_LIMIT`, and the panel reports which case it is
 * in. Narrowing the window is the documented remedy, and the note on screen
 * says so.
 */
export const PERIOD_SAMPLE_LIMIT = 500

export interface AdminGrantTally {
  readonly adminUserId: string
  readonly grantCount: number
  readonly totalDays: number
}

export interface PeriodBudget {
  /** Exact `count(*)` of grants issued inside the window. */
  readonly issuedCount: number
  /** Sum of `days` over the rows that were read. */
  readonly issuedDays: number
  /** True when the rows read were every grant in the window. */
  readonly exact: boolean
  readonly sampleSize: number
  /** Newest-first tally, ordered by total days descending. */
  readonly perAdmin: readonly AdminGrantTally[]
}

/**
 * Who spent what over a window.
 *
 * `granted_at` is filtered half-open — `[from, to)` — matching `resolveRange()`,
 * so two adjacent windows partition the timeline instead of double-counting the
 * boundary row. The count is a real `count(*)`; the per-admin split is tallied
 * from a bounded page because PostgREST has no `GROUP BY`, and the panel says
 * which of the two cases produced the numbers it is showing.
 */
export async function loadPeriodBudget(window: {
  fromIso: string
  toIso: string
}): Promise<PeriodBudget> {
  const filters: readonly ViewFilter<BoEntitlementGrantRow>[] = [
    { column: 'granted_at', op: 'gte', value: window.fromIso },
    { column: 'granted_at', op: 'lt', value: window.toIso },
  ]

  const [issuedCount, rows] = await Promise.all([
    countView('bo_entitlement_grants', filters),
    queryView('bo_entitlement_grants', {
      columns: ['granted_by_admin_user_id', 'days'],
      filters,
      order: { column: 'granted_at', ascending: false, nullsFirst: false },
      limit: PERIOD_SAMPLE_LIMIT,
    }),
  ])

  const tallies = new Map<string, { grantCount: number; totalDays: number }>()
  let issuedDays = 0

  for (const row of rows) {
    issuedDays += row.days
    const current = tallies.get(row.granted_by_admin_user_id) ?? { grantCount: 0, totalDays: 0 }
    tallies.set(row.granted_by_admin_user_id, {
      grantCount: current.grantCount + 1,
      totalDays: current.totalDays + row.days,
    })
  }

  const perAdmin: AdminGrantTally[] = [...tallies.entries()]
    .map(([adminUserId, tally]) => ({ adminUserId, ...tally }))
    .sort((left, right) => right.totalDays - left.totalDays)

  return {
    issuedCount,
    issuedDays,
    exact: rows.length >= issuedCount,
    sampleSize: rows.length,
    perAdmin,
  }
}

// ===========================================================================
// Naming the people on a row
// ===========================================================================

export interface GrantAdmin {
  readonly adminUserId: string
  readonly name: string | null
  readonly emailRedacted: string | null
  readonly roleLabel: string
  readonly isActive: boolean
}

const NO_ADMINS: ReadonlyMap<string, GrantAdmin> = new Map()

/**
 * The staff rows for a set of admin ids, keyed by id.
 *
 * One request for a whole page rather than one per row, and it reads
 * `bo_admin_users` — where another admin's address is already redacted — rather
 * than `admin_users`, whose `email` column is in the clear.
 */
export async function loadGrantAdmins(
  adminUserIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, GrantAdmin>> {
  const unique = [...new Set(adminUserIds.filter((id): id is string => id !== null))]
  if (unique.length === 0) return NO_ADMINS

  const rows = await queryView('bo_admin_users', {
    columns: ['admin_user_id', 'admin_name', 'email_redacted', 'role_label', 'is_active'],
    filters: [{ column: 'admin_user_id', op: 'in', value: unique }],
    limit: unique.length,
  })

  return new Map(
    rows.map((row: BoAdminUserRow) => [
      row.admin_user_id,
      {
        adminUserId: row.admin_user_id,
        name: row.admin_name,
        emailRedacted: row.email_redacted,
        roleLabel: row.role_label,
        isActive: row.is_active,
      },
    ]),
  )
}

// ===========================================================================
// Which source is actually giving this account Pro
// ===========================================================================

/**
 * Rows per account in `bo_entitlement_sources`.
 *
 * The store contributes at most one row (the view filters to the three
 * Pro-granting statuses), an operator grant one row per grant, and a referral
 * one per credit. Twelve is far past what a real account holds and bounds the
 * read for a page of twenty-five.
 */
const SOURCE_ROWS_PER_USER = 12

export interface GrantPicture {
  /** What `resolveEntitlements()` answers for this account right now. */
  readonly entitlements: Entitlements
  /** The same answer's `source`, narrowed to the contract's union. */
  readonly source: EntitlementSource
  /** Every row `bo_entitlement_sources` holds for the account. */
  readonly sources: readonly BoEntitlementSourceRow[]
}

const NO_PICTURES: ReadonlyMap<string, GrantPicture> = new Map()

/**
 * The status a store row reports, narrowed to the product's own enum.
 *
 * `bo_entitlement_sources` selects `subscriptions.status::text` and filters to
 * `trialing`, `active` and `grace_period`, so the value is always a member —
 * but the column is `text` by the time it arrives, and a status this build does
 * not know must not be silently treated as Pro. Anything unrecognised falls
 * back to `expired`, which resolves to the free plan.
 */
function toSubscriptionStatus(raw: string): SubscriptionStatus {
  switch (raw) {
    case 'free':
    case 'trialing':
    case 'active':
    case 'grace_period':
    case 'expired':
    case 'billing_issue':
      return raw
    default:
      return 'expired'
  }
}

/**
 * Ask the product's own resolver what is entitling one account.
 *
 * The three inputs it takes:
 *
 *   - `subscriptionStatus` — from the account's store row, or `expired` when
 *     there is none. The view only emits a store row for the three statuses
 *     that grant Pro, so "no row" genuinely means "no live purchase".
 *   - `activeEntitlement` — `bo_entitlement_sources` does not project
 *     `subscriptions.entitlement` (the store SKU is a billing detail, not an
 *     operational one), so the presence of a store stands in for it, exactly as
 *     `deriveEntitlements` does on the user record. `subscriptions` is written
 *     only by the RevenueCat webhook, and a row with a store is a row that came
 *     from a real purchase.
 *   - `referralBonusExpiresAt` — the furthest expiry among the account's
 *     unrevoked referral credits.
 *
 * The operator grant is not an input, because `resolveEntitlements` has no
 * parameter for one. That is not an omission here; it is the fact the screen
 * exists to report.
 */
function resolvePicture(
  rows: readonly BoEntitlementSourceRow[],
  clock: Clock,
): Omit<GrantPicture, 'sources'> {
  const store = rows.find((row) => row.source === 'store') ?? null

  let referralBonusExpiresAt: string | null = null
  for (const row of rows) {
    if (row.source !== 'referral') continue
    if (row.revoked_at !== null) continue
    if (row.ends_at === null) continue
    if (referralBonusExpiresAt === null || row.ends_at > referralBonusExpiresAt) {
      referralBonusExpiresAt = row.ends_at
    }
  }

  const entitlements = resolveEntitlements({
    subscriptionStatus: store === null ? 'expired' : toSubscriptionStatus(store.detail_status),
    activeEntitlement: store !== null && store.store !== null ? PRO_ENTITLEMENT_ID : null,
    referralBonusExpiresAt,
    now: clock.now(),
  })

  return { entitlements, source: entitlements.source }
}

/**
 * The entitlement picture for a page of accounts, in one round trip.
 *
 * One `in` filter over `bo_entitlement_sources` rather than a query per row: a
 * page of twenty-five accounts is one request, and the rows are bounded by
 * `SOURCE_ROWS_PER_USER` so a pathological account cannot displace the rest.
 */
export async function loadGrantPictures(
  userIds: readonly string[],
  clock: Clock = systemClock,
): Promise<ReadonlyMap<string, GrantPicture>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return NO_PICTURES

  const rows = await queryView('bo_entitlement_sources', {
    filters: [{ column: 'user_id', op: 'in', value: unique }],
    order: { column: 'ends_at', ascending: false, nullsFirst: false },
    limit: unique.length * SOURCE_ROWS_PER_USER,
  })

  const byUser = new Map<string, BoEntitlementSourceRow[]>()
  for (const row of rows) {
    const bucket = byUser.get(row.user_id)
    if (bucket === undefined) byUser.set(row.user_id, [row])
    else bucket.push(row)
  }

  const pictures = new Map<string, GrantPicture>()
  for (const userId of unique) {
    const userRows = byUser.get(userId) ?? []
    pictures.set(userId, { ...resolvePicture(userRows, clock), sources: userRows })
  }
  return pictures
}

/** The picture for one account. Same resolver, same inputs, one user. */
export async function loadGrantPicture(
  userId: string,
  clock: Clock = systemClock,
): Promise<GrantPicture | null> {
  const pictures = await loadGrantPictures([userId], clock)
  return pictures.get(userId) ?? null
}

/**
 * What a grant is actually doing for the account it names.
 *
 * A grant that is not in force claims nothing, and is reported as such. A live
 * grant is compared against what the product's resolver says right now: a store
 * subscription outranks it because the resolver answers `subscription` before
 * it looks at anything else, and a referral bonus outranks it because the
 * resolver reads bonuses and does not read grants at all.
 */
export function grantEffect(row: BoEntitlementGrantRow, picture: GrantPicture | null): GrantEffect {
  if (!row.is_live) return 'not_live'
  if (picture === null) return 'only_record'
  switch (picture.source) {
    case 'subscription':
    case 'trial':
      return 'overlaps_store'
    case 'referral_bonus':
      return 'behind_referral'
    default:
      return 'only_record'
  }
}

// ===========================================================================
// The change trail
// ===========================================================================

/**
 * Everything the audit log holds about one grant, newest first.
 *
 * Both operations in this module write their audit row against
 * `entity_type = 'entitlement_grant'` and the grant's own id, so "everything
 * ever done to this grant" is one indexed query. Refused attempts are here too:
 * `runAdminAction` writes a `failure` row when a permission check or a
 * constraint refuses the operation.
 */
export async function loadGrantTrail(
  grantId: string,
  limit: number = GRANT_TRAIL_LIMIT,
): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [
      { column: 'entity_type', op: 'eq', value: GRANT_ENTITY_TYPE },
      { column: 'entity_id', op: 'eq', value: grantId },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  })
}

// ===========================================================================
// Checks a write runs first
// ===========================================================================

/**
 * Whether a user id names a real account.
 *
 * Checked before the grant is written so a mistyped id is a field error rather
 * than a foreign-key exception the operator cannot read. `bo_users` carries no
 * content column; this asks whether the row exists and nothing else.
 */
export async function userExists(userId: string): Promise<boolean> {
  const row = await queryViewOne('bo_users', {
    columns: ['user_id'],
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
  })
  return row !== null
}

/**
 * The admins who have ever issued a grant, newest first, for the filter.
 *
 * Derived from the grants rather than from the roster: a select listing every
 * administrator would offer twenty choices that match nothing, and the question
 * the control answers is "who has been handing these out". Bounded like every
 * other read here — an admin whose last grant is older than the newest five
 * hundred drops off the list, and the list is a convenience, not the filter
 * itself: an id typed into the URL still filters, because `listFilters` reads
 * the parameter and not this array.
 */
export async function loadGrantingAdminIds(
  limit: number = PERIOD_SAMPLE_LIMIT,
): Promise<readonly string[]> {
  const rows = await queryView('bo_entitlement_grants', {
    columns: ['granted_by_admin_user_id'],
    order: { column: 'granted_at', ascending: false, nullsFirst: false },
    limit,
  })
  return [...new Set(rows.map((row) => row.granted_by_admin_user_id))]
}
