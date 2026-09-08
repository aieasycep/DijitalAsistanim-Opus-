import 'server-only'

import {
  PRO_ENTITLEMENT_ID,
  SUBSCRIPTION_STATUSES,
  resolveEntitlements,
  systemClock,
  type Clock,
  type SubscriptionStatus,
} from '@da/domain'
import {
  ANNOUNCEMENT_STATE_FILTERS,
  ANNOUNCEMENT_TRAIL_LIMIT,
  DEVICE_PLATFORMS,
  isDevicePlatform,
  type AnnouncementAudienceValue,
  type AnnouncementLocaleValue,
  type AnnouncementPlatformValue,
  type AnnouncementSortKey,
  type AnnouncementStateFilter,
  type DevicePlatform,
  type DismissibleFilter,
} from '@/components/announcements/contract'
import type {
  AdminRole,
  AnnouncementAudience,
  AnnouncementTableRow,
  AppPlatform,
  BoAuditRow,
  BoUserDetailRow,
  BoUserRow,
} from '@/lib/db'
import { buildOffsetPage, type OffsetPage, type OffsetPageRequest } from '@/lib/pagination'
import type { AnnouncementState } from '@/lib/messages/announcements'
import {
  compactFilters,
  countTable,
  countView,
  eqFilter,
  nullFilter,
  prefixFilter,
  queryTable,
  queryTableOne,
  queryView,
  type ViewFilter,
  type ViewOrder,
} from './shared'

/**
 * Every read behind the announcements area, in one module.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE READS
 * ---------------------------------------------------------------------------
 *
 * `announcements`, an operator-owned table from migration 0019, and two
 * content-blind views. The table holds text the company wrote and is about to
 * publish — there is nothing in it to blind, which is why 0019 gave it no
 * `bo_*` view — and `@/lib/db` still refuses to let this file name a base table
 * that holds anything a user wrote.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STATE IS DERIVED IN TWO PLACES AND STILL CANNOT DISAGREE
 * ---------------------------------------------------------------------------
 *
 * An announcement's state is a function of two nullable timestamps and the
 * clock: draft, scheduled, live, open-ended, ended. The badge on a row computes
 * it from the row (`announcementState`), and the list filter computes it as a
 * set of SQL predicates (`stateFilters`) because a filter that ran in
 * JavaScript would page over the wrong rows. Both are in this file, next to each
 * other, and `__the same instant__` is passed to both by the caller — so a row
 * that the filter selected as "live" can never be badged "ended" two lines
 * later.
 *
 * The one predicate that cannot be expressed as a single SQL comparison is
 * "published, started, and not ended", because "not ended" is
 * `ends_at is null OR ends_at > now` and `ViewFilter` has no disjunction (the
 * `or=` slot on a query is reserved for keyset pagination, which builds it from
 * a pure function). Rather than approximate it, the console splits it into the
 * two states it actually is: `live` (a notice with an end date, still inside
 * it) and `open_ended` (a notice with no end date at all). That second one is a
 * category an operations console wants anyway — an announcement with no end and
 * no dismiss button is the dark pattern `announcements.dismissible`'s own
 * comment warns about, and now it is one click to list them.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE REACH NUMBER COMES FROM
 * ---------------------------------------------------------------------------
 *
 * `estimateReach` is the number the publish confirmation states, so it is a
 * `count(*)` in Postgres over `bo_users` — or `bo_user_detail` when the
 * targeting names a platform, because device registrations only exist there.
 * It reports what it could not narrow by rather than quietly ignoring it: the
 * minimum app version has no per-user column in any view, and `web` is not a
 * platform `push_tokens` can record. An estimate that silently dropped either
 * would be a bigger number than the truth on the one screen where the number is
 * the whole point.
 */

// ===========================================================================
// The console's vocabulary and the database's, proved to be the same
//
// `@/components/announcements/contract` re-declares the three enums because it
// has to be importable from a Client Component. These aliases fail to compile
// the moment either side gains a member the other does not have.
// ===========================================================================

type Covers<Narrow extends Wide, Wide> = Narrow

export type ConsoleAudiencesExist = Covers<AnnouncementAudienceValue, AnnouncementAudience>
export type DatabaseAudiencesAreLabelled = Covers<AnnouncementAudience, AnnouncementAudienceValue>
export type ConsolePlatformsExist = Covers<AnnouncementPlatformValue, AppPlatform>
export type DatabasePlatformsAreLabelled = Covers<AppPlatform, AnnouncementPlatformValue>

/**
 * The badge's vocabulary and the filter's, proved to be the same five names.
 *
 * `AnnouncementState` is declared beside the Turkish labels and
 * `AnnouncementStateFilter` beside the query parameters, and the whole design
 * rests on their being the same set: a state a row can be badged with that the
 * filter above the table does not offer is a row an operator cannot find.
 */
export type EveryStateIsFilterable = Covers<AnnouncementState, AnnouncementStateFilter>
export type EveryFilterIsAState = Covers<AnnouncementStateFilter, AnnouncementState>

// ===========================================================================
// The columns a list reads
//
// `body` is deliberately absent: a page of twenty-five announcements does not
// need twenty-five announcement bodies crossing the wire, and the narrowed row
// type below means the table cannot render one by accident.
// ===========================================================================

const LIST_COLUMNS = [
  'id',
  'title',
  'audience',
  'platforms',
  'min_app_version',
  'locale',
  'starts_at',
  'ends_at',
  'dismissible',
  'published_at',
  'published_by',
  'created_by',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof AnnouncementTableRow)[]

/** One row of the list: everything except the announcement's own body. */
export type AnnouncementListRow = Pick<AnnouncementTableRow, (typeof LIST_COLUMNS)[number]>

// ===========================================================================
// State
// ===========================================================================

/**
 * The state one announcement is in at a given instant.
 *
 * `published_at is null` wins over everything, exactly as the table's own
 * comment says it must: a draft is never served, whatever its window says.
 */
export function announcementState(
  row: Pick<AnnouncementTableRow, 'published_at' | 'starts_at' | 'ends_at'>,
  now: Date,
): AnnouncementState {
  if (row.published_at === null) return 'draft'

  const startsAt = Date.parse(row.starts_at)
  if (Number.isFinite(startsAt) && startsAt > now.getTime()) return 'scheduled'

  if (row.ends_at === null) return 'open_ended'
  const endsAt = Date.parse(row.ends_at)
  if (Number.isFinite(endsAt) && endsAt <= now.getTime()) return 'ended'
  return 'live'
}

/**
 * The same five states, as predicates Postgres can answer.
 *
 * Each one is a conjunction, so the list is a single indexed query rather than
 * a page of rows filtered after the fact.
 */
export function stateFilters(
  state: AnnouncementStateFilter,
  nowIso: string,
): readonly ViewFilter<AnnouncementTableRow>[] {
  switch (state) {
    case 'draft':
      return [nullFilter<AnnouncementTableRow>('published_at', true)]
    case 'scheduled':
      return [
        nullFilter<AnnouncementTableRow>('published_at', false),
        { column: 'starts_at', op: 'gt', value: nowIso },
      ]
    case 'live':
      return [
        nullFilter<AnnouncementTableRow>('published_at', false),
        { column: 'starts_at', op: 'lte', value: nowIso },
        { column: 'ends_at', op: 'gt', value: nowIso },
      ]
    case 'open_ended':
      return [
        nullFilter<AnnouncementTableRow>('published_at', false),
        { column: 'starts_at', op: 'lte', value: nowIso },
        nullFilter<AnnouncementTableRow>('ends_at', true),
      ]
    case 'ended':
      return [
        nullFilter<AnnouncementTableRow>('published_at', false),
        { column: 'ends_at', op: 'lte', value: nowIso },
      ]
    default:
      return []
  }
}

/**
 * One `count(*)` per state, computed by Postgres and run concurrently.
 *
 * Five head requests, no row bodies on the wire. The alternative — fetching the
 * table and tallying it in JavaScript — is the thing server-side pagination
 * exists to prevent, and it would go wrong the moment the table outgrew a page.
 */
export async function countAnnouncementStates(
  clock: Clock = systemClock,
): Promise<Readonly<Record<AnnouncementStateFilter, number>>> {
  const nowIso = clock.now().toISOString()
  // Driven by the filter list itself rather than by a second copy of the five
  // names: a tile and the filter it links to are the same predicate set by
  // construction, and a state added later gets a tile without an edit here.
  const counts = await Promise.all(
    ANNOUNCEMENT_STATE_FILTERS.map((state) =>
      countTable('announcements', stateFilters(state, nowIso)),
    ),
  )
  const result = {} as Record<AnnouncementStateFilter, number>
  ANNOUNCEMENT_STATE_FILTERS.forEach((state, index) => {
    result[state] = counts[index] ?? 0
  })
  return result
}

// ===========================================================================
// The list
// ===========================================================================

export interface AnnouncementListFilters {
  state: AnnouncementStateFilter | null
  audience: AnnouncementAudienceValue | null
  locale: AnnouncementLocaleValue | null
  dismissible: DismissibleFilter | null
  /** A title prefix. Anchored, so the comparison can still use an index. */
  titlePrefix: string | null
}

export interface AnnouncementListRequest {
  filters: AnnouncementListFilters
  sort: { key: AnnouncementSortKey; ascending: boolean } | null
  page: OffsetPageRequest
  /** The instant the state filter is evaluated against. */
  nowIso: string
}

/** Newest start date first: what is coming, then what is on, then what was. */
const DEFAULT_ORDER: readonly ViewOrder<AnnouncementTableRow>[] = [
  { column: 'starts_at', ascending: false },
  { column: 'id', ascending: false },
]

function listOrder(
  sort: AnnouncementListRequest['sort'],
): readonly ViewOrder<AnnouncementTableRow>[] {
  if (sort === null) return DEFAULT_ORDER
  return [
    { column: sort.key, ascending: sort.ascending, nullsFirst: false },
    // A stable tiebreak, so page two never repeats or skips a row that shares
    // a timestamp with the last row of page one.
    { column: 'id', ascending: sort.ascending },
  ]
}

function listFilters(
  filters: AnnouncementListFilters,
  nowIso: string,
): readonly ViewFilter<AnnouncementTableRow>[] {
  return [
    ...(filters.state === null ? [] : stateFilters(filters.state, nowIso)),
    ...compactFilters<AnnouncementTableRow>(
      eqFilter('audience', filters.audience),
      eqFilter('locale', filters.locale),
      filters.dismissible === null
        ? null
        : { column: 'dismissible', op: 'is', value: filters.dismissible === 'yes' },
      prefixFilter('title', filters.titlePrefix),
    ),
  ]
}

/**
 * One page of announcements, with the exact total behind it.
 *
 * The rows and the total are one bounded `select` and one `count(*)` over the
 * same filters, so the pager's page count is the database's answer rather than
 * the length of the array on screen.
 */
export async function listAnnouncements(
  request: AnnouncementListRequest,
): Promise<OffsetPage<AnnouncementListRow>> {
  const filters = listFilters(request.filters, request.nowIso)
  const [rows, total] = await Promise.all([
    queryTable('announcements', {
      columns: LIST_COLUMNS,
      filters,
      order: listOrder(request.sort),
      limit: request.page.size,
      offset: request.page.offset,
    }),
    countTable('announcements', filters),
  ])
  return buildOffsetPage<AnnouncementListRow>(rows, total, request.page)
}

// ===========================================================================
// One announcement
// ===========================================================================

/** The whole row, body included: this is the record being edited. */
export async function loadAnnouncement(id: string): Promise<AnnouncementTableRow | null> {
  return queryTableOne('announcements', {
    filters: [{ column: 'id', op: 'eq', value: id }],
  })
}

// ===========================================================================
// Naming the people on a record
// ===========================================================================

export interface AnnouncementAdmin {
  adminUserId: string
  name: string | null
  emailRedacted: string | null
  role: AdminRole
  roleLabel: string
}

const NO_ADMINS: ReadonlyMap<string, AnnouncementAdmin> = new Map()

/**
 * The staff rows for a set of admin ids, keyed by id.
 *
 * One request for the whole page rather than one per row, and it reads
 * `bo_admin_users` — where another admin's address is already redacted — rather
 * than `admin_users`, whose `email` column is in the clear.
 */
export async function loadAnnouncementAdmins(
  adminUserIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, AnnouncementAdmin>> {
  const unique = [...new Set(adminUserIds.filter((id): id is string => id !== null))]
  if (unique.length === 0) return NO_ADMINS

  const rows = await queryView('bo_admin_users', {
    columns: ['admin_user_id', 'admin_name', 'email_redacted', 'role', 'role_label'],
    filters: [{ column: 'admin_user_id', op: 'in', value: unique }],
    limit: unique.length,
  })

  return new Map(
    rows.map((row) => [
      row.admin_user_id,
      {
        adminUserId: row.admin_user_id,
        name: row.admin_name,
        emailRedacted: row.email_redacted,
        role: row.role,
        roleLabel: row.role_label,
      },
    ]),
  )
}

// ===========================================================================
// The trail
// ===========================================================================

/**
 * Everything ever done to this announcement, newest first.
 *
 * Filtered on `entity_id`, which every action in this module sets to the
 * announcement's own id, so the trail resolves in one indexed read rather than
 * by scanning the whole audit log for a matching action name.
 */
export async function loadAnnouncementTrail(
  announcementId: string,
  limit: number = ANNOUNCEMENT_TRAIL_LIMIT,
): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [{ column: 'entity_id', op: 'eq', value: announcementId }],
    order: { column: 'created_at', ascending: false },
    limit,
  })
}

// ===========================================================================
// Reach
// ===========================================================================

/**
 * The subscription statuses that resolve to Pro, asked of `@da/domain` rather
 * than restated.
 *
 * `resolveEntitlements` is the one definition of Pro in this product. Deriving
 * the set from it means a change to what "Pro" means moves this count with it,
 * instead of leaving a targeting estimate that quietly disagrees with the app.
 */
function planStatusSets(now: Date): {
  pro: readonly SubscriptionStatus[]
  free: readonly SubscriptionStatus[]
} {
  const pro: SubscriptionStatus[] = []
  const free: SubscriptionStatus[] = []
  for (const status of SUBSCRIPTION_STATUSES) {
    const entitlements = resolveEntitlements({
      subscriptionStatus: status,
      activeEntitlement: PRO_ENTITLEMENT_ID,
      referralBonusExpiresAt: null,
      now,
    })
    if (entitlements.plan === 'pro') pro.push(status)
    else free.push(status)
  }
  return { pro, free }
}

/** What the reach estimate is being asked about. */
export interface AnnouncementTargeting {
  audience: AnnouncementAudienceValue
  platforms: readonly AnnouncementPlatformValue[]
  locale: string
  minAppVersion: string | null
}

/** A dimension of the targeting the console cannot count. */
export type UnmeasuredDimension = 'min_app_version' | 'web_platform' | 'plan_source'

export interface AnnouncementReach {
  /** Accounts matching audience and locale, before any platform narrowing. */
  targeted: number
  /**
   * Of those, how many have a registered device on a targeted platform. Null
   * when the targeting names no platform, in which case the question does not
   * arise.
   */
  withDevice: number | null
  /** Every non-deleted account, so the estimate can be read as a share. */
  liveUsers: number
  /** What the estimate could not narrow by, in the operator's own words. */
  unmeasured: readonly UnmeasuredDimension[]
}

/**
 * The platforms the targeting actually narrows by.
 *
 * The `ios` and `android` audiences *are* a platform filter — the
 * `announcements_one_platform_filter` constraint refuses a row that carries
 * both kinds — so they resolve here to the same thing an explicit `platforms`
 * array would.
 */
export function targetedPlatforms(
  targeting: AnnouncementTargeting,
): readonly AnnouncementPlatformValue[] {
  if (targeting.audience === 'ios') return ['ios']
  if (targeting.audience === 'android') return ['android']
  return targeting.platforms
}

function planFilterValues(
  targeting: AnnouncementTargeting,
  now: Date,
): readonly SubscriptionStatus[] | null {
  if (targeting.audience === 'pro') return planStatusSets(now).pro
  if (targeting.audience === 'free') return planStatusSets(now).free
  return null
}

/**
 * Audience and locale, as filters over `bo_users`.
 *
 * Written out per view rather than shared through a generic: `ViewFilter` types
 * its column against the row, which is what stops a filter naming a column the
 * view does not have, and that guarantee is worth four repeated lines.
 */
function userFilters(
  targeting: AnnouncementTargeting,
  plans: readonly SubscriptionStatus[] | null,
): readonly ViewFilter<BoUserRow>[] {
  const filters: ViewFilter<BoUserRow>[] = [
    { column: 'is_deleted', op: 'is', value: false },
    { column: 'locale', op: 'eq', value: targeting.locale },
  ]
  if (plans !== null) filters.push({ column: 'subscription_status', op: 'in', value: plans })
  return filters
}

function detailFilters(
  targeting: AnnouncementTargeting,
  plans: readonly SubscriptionStatus[] | null,
  devicePlatforms: readonly DevicePlatform[],
): readonly ViewFilter<BoUserDetailRow>[] {
  const filters: ViewFilter<BoUserDetailRow>[] = [
    { column: 'is_deleted', op: 'is', value: false },
    { column: 'locale', op: 'eq', value: targeting.locale },
    { column: 'device_platforms', op: 'contains', value: [...devicePlatforms] },
  ]
  if (plans !== null) filters.push({ column: 'subscription_status', op: 'in', value: plans })
  return filters
}

/**
 * How many accounts hold a device on *any* of the targeted platforms.
 *
 * `contains` asks whether a user's platform array covers all the values given,
 * which is the wrong question for "ios or android" — so the union is computed
 * by inclusion and exclusion over at most two platforms: |A| + |B| − |A ∩ B|.
 * Three counts at worst, all of them `count(*)` in Postgres, and the answer is
 * exact rather than a sum that counts a two-device user twice.
 */
async function countByDevicePlatforms(
  targeting: AnnouncementTargeting,
  plans: readonly SubscriptionStatus[] | null,
  devicePlatforms: readonly DevicePlatform[],
): Promise<number> {
  if (devicePlatforms.length === 0) return 0
  if (devicePlatforms.length === 1) {
    return countView('bo_user_detail', detailFilters(targeting, plans, devicePlatforms))
  }

  const [first, second, both] = await Promise.all([
    countView('bo_user_detail', detailFilters(targeting, plans, [DEVICE_PLATFORMS[0]])),
    countView('bo_user_detail', detailFilters(targeting, plans, [DEVICE_PLATFORMS[1]])),
    countView('bo_user_detail', detailFilters(targeting, plans, DEVICE_PLATFORMS)),
  ])
  return first + second - both
}

/**
 * The number the publish confirmation states.
 *
 * Every figure in the result is a `count(*)` the database computed. Nothing
 * here fetches a row in order to count it, and nothing here guesses: what the
 * console cannot narrow by comes back in `unmeasured` so the confirmation can
 * say it out loud next to the figure.
 */
export async function estimateReach(
  targeting: AnnouncementTargeting,
  clock: Clock = systemClock,
): Promise<AnnouncementReach> {
  const now = clock.now()
  const plans = planFilterValues(targeting, now)
  const platforms = targetedPlatforms(targeting)
  const devicePlatforms = platforms.filter(isDevicePlatform)

  const [targeted, liveUsers, withDevice] = await Promise.all([
    countView('bo_users', userFilters(targeting, plans)),
    countView('bo_users', [{ column: 'is_deleted', op: 'is', value: false }]),
    platforms.length === 0
      ? Promise.resolve(null)
      : countByDevicePlatforms(targeting, plans, devicePlatforms),
  ])

  const unmeasured: UnmeasuredDimension[] = []
  if (targeting.minAppVersion !== null) unmeasured.push('min_app_version')
  if (platforms.includes('web')) unmeasured.push('web_platform')
  if (plans !== null) unmeasured.push('plan_source')

  return { targeted, liveUsers, withDevice, unmeasured }
}
