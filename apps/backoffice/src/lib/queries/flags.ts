import 'server-only'

import { isAppError } from '@da/domain'
import {
  countView,
  queryTableOne,
  queryView,
  queryViewOne,
  queryViewPage,
  type AppPlan,
  type AppPlatform,
  type BoAdminUserRow,
  type BoAuditRow,
  type BoFeatureFlagOverrideRow,
  type BoFeatureFlagRow,
  type FeatureFlagOverrideTableRow,
  type ViewFilter,
  type ViewOrder,
  type ViewPage,
} from '@/lib/db'
import { messages } from '@/lib/messages'
import {
  DEFAULT_FLAG_SORT,
  FLAGS_PAGE_SIZE,
  FLAG_TRAIL_LIMIT,
  OVERRIDES_PAGE_SIZE,
  type FlagListParams,
  type FlagPlan,
  type FlagPlatform,
  type FlagSort,
  type FlagSortKey,
  type FlagState,
} from '@/components/flags/contract'

/**
 * Every read behind the feature-flag area.
 *
 * ---------------------------------------------------------------------------
 * THIS MODULE EDITS A RECORD; IT DOES NOT EVALUATE ONE
 * ---------------------------------------------------------------------------
 *
 * `feature_flag_is_enabled()` in migration 0019 is the single evaluator, and
 * the mobile app is its caller. Nothing here re-implements the precedence — the
 * one place a state is derived is `bo_feature_flags.effective_state`, which the
 * view computes with the same expression the evaluator uses, so the console
 * cannot claim a flag is on while the phone in a caller's hand disagrees. The
 * screens read that column; they do not compute one.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Every count on screen is a `count=exact` HEAD request — a real `count(*)`
 * over an index with no row bodies crossing the wire — and every list is a
 * bounded page with the exact total beside it. There is no place in this file
 * where a table is fetched in order to measure it. `override_count`,
 * `override_on_count` and `override_off_count` are aggregated by the view's
 * lateral join and already exclude lapsed pins, so a flag row's "3 kişiye özel"
 * is three live pins rather than three rows that happen to exist.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CAN ASK FOR
 * ---------------------------------------------------------------------------
 *
 * `queryView` / `countView` accept only `BoViewName`, and `queryTableOne`
 * accepts only the operator-owned tables 0019 added. `feature_flags` and
 * `feature_flag_overrides` hold no user content at all — a key the company
 * chose, an operator's written reason, a boolean and a uuid — and the one user
 * identifier on screen arrives through `bo_redact_email()` as
 * `y•••@example.com`.
 */

// ===========================================================================
// The vocabulary is the database's
//
// `contract.ts` re-declares the two flag enums and the state expression because
// it is imported by Client Components and `@/lib/db` is `server-only`. The
// aliases below are the proof that the declarations still name the same
// members: each fails to compile the moment one side gains a member the other
// lacks, which `tsc --noEmit` checks on every CI run. They carry no runtime
// weight.
// ===========================================================================

type Covers<Narrow extends Wide, Wide> = Narrow

export type ConsolePlatformsExist = Covers<FlagPlatform, AppPlatform>
export type DatabasePlatformsAreLabelled = Covers<AppPlatform, FlagPlatform>
export type ConsolePlansExist = Covers<FlagPlan, AppPlan>
export type DatabasePlansAreLabelled = Covers<AppPlan, FlagPlan>
export type ConsoleStatesExist = Covers<FlagState, BoFeatureFlagRow['effective_state']>
export type DatabaseStatesAreLabelled = Covers<BoFeatureFlagRow['effective_state'], FlagState>

/** The audit rows that belong to a flag all name this entity type. */
export const FLAG_ENTITY_TYPE = 'feature_flag'

// ===========================================================================
// Failure isolation
// ===========================================================================

/**
 * A query result that carries its own failure instead of throwing upward, so a
 * panel that cannot load renders an error where it stands — and, on this page
 * in particular, never renders as "no flags", which would read as "nothing is
 * being rolled out" on the screen whose whole job is to say what is.
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

/**
 * The sort each key applies.
 *
 * Every column named here exists on `bo_feature_flags`, and `flag_id` is
 * appended as a tiebreak so two flags updated in the same transaction do not
 * swap places between page one and page two.
 */
const SORT_COLUMNS: Readonly<Record<FlagSortKey, keyof BoFeatureFlagRow & string>> = Object.freeze({
  key: 'key',
  updated_at: 'updated_at',
  rollout_percentage: 'rollout_percentage',
  override_count: 'override_count',
})

function listOrder(sort: FlagSort): readonly ViewOrder<BoFeatureFlagRow>[] {
  const ascending = sort.direction === 'asc'
  return [
    { column: SORT_COLUMNS[sort.key], ascending, nullsFirst: false },
    { column: 'flag_id', ascending: false },
  ]
}

function listFilters(params: FlagListParams): readonly ViewFilter<BoFeatureFlagRow>[] {
  const filters: ViewFilter<BoFeatureFlagRow>[] = []

  if (params.state !== null) {
    filters.push({ column: 'effective_state', op: 'eq', value: params.state })
  }

  // `contains` is `@>` on the targeting array, so this finds the flags that
  // name the platform explicitly. A flag with an empty array targets every
  // platform and is deliberately not matched: "which flags are restricted to
  // iOS" and "which flags reach iOS" are different questions, and the filter
  // label says which one this is.
  if (params.platform !== null) {
    filters.push({ column: 'platforms', op: 'contains', value: [params.platform] })
  }
  if (params.plan !== null) {
    filters.push({ column: 'plans', op: 'contains', value: [params.plan] })
  }

  // Anchored: a pattern opening with `%` cannot use the unique index on `key`.
  if (params.search !== null) {
    filters.push({ column: 'key', op: 'ilike', value: `${params.search}%` })
  }

  return filters
}

/** One page of flags, with the exact total behind it. */
export async function listFlags(
  params: FlagListParams,
  sort: FlagSort = DEFAULT_FLAG_SORT,
): Promise<ViewPage<BoFeatureFlagRow>> {
  return queryViewPage('bo_feature_flags', {
    filters: listFilters(params),
    order: listOrder(sort),
    limit: FLAGS_PAGE_SIZE,
    offset: (params.page - 1) * FLAGS_PAGE_SIZE,
  })
}

// ===========================================================================
// The tiles
// ===========================================================================

export interface FlagSummary {
  readonly total: number
  readonly on: number
  readonly partial: number
  readonly killed: number
}

/**
 * The four numbers above the list, each a `count(*)` in Postgres.
 *
 * They are counted over `effective_state`, the view's own column, rather than
 * recomputed from `enabled` and `rollout_percentage` here — the tile and the
 * row the operator clicks through to must be answering the same question.
 */
export async function loadFlagSummary(): Promise<FlagSummary> {
  const [total, on, partial, killed] = await Promise.all([
    countView('bo_feature_flags'),
    countView('bo_feature_flags', [{ column: 'effective_state', op: 'eq', value: 'on' }]),
    countView('bo_feature_flags', [{ column: 'effective_state', op: 'eq', value: 'partial' }]),
    countView('bo_feature_flags', [{ column: 'effective_state', op: 'eq', value: 'killed' }]),
  ])
  return { total, on, partial, killed }
}

// ===========================================================================
// One flag
// ===========================================================================

export async function loadFlag(flagId: string): Promise<BoFeatureFlagRow | null> {
  return queryViewOne('bo_feature_flags', {
    filters: [{ column: 'flag_id', op: 'eq', value: flagId }],
  })
}

/**
 * The flag holding a key, if there is one.
 *
 * Used only to explain a refusal: `feature_flags_key_unique` is what actually
 * stops a second flag from taking a key, and this runs after Postgres has
 * already said no, so the operator reads "bu anahtar zaten var" instead of a
 * constraint name.
 */
export async function loadFlagByKey(key: string): Promise<BoFeatureFlagRow | null> {
  return queryViewOne('bo_feature_flags', {
    filters: [{ column: 'key', op: 'eq', value: key }],
  })
}

// ===========================================================================
// Per-user overrides
// ===========================================================================

export interface OverridePageQuery {
  readonly flagId: string
  readonly page: number
}

/**
 * One page of the per-user pins for a flag, live ones first.
 *
 * A lapsed pin stays in the list on purpose: it no longer affects evaluation,
 * and it is exactly the forgotten debugging pin that turns a "50% rollout" into
 * something else. `admin_cleanup_expired()` deletes it seven days after it
 * lapses, which is long enough for somebody to notice it here.
 */
export async function listOverrides(
  query: OverridePageQuery,
): Promise<ViewPage<BoFeatureFlagOverrideRow>> {
  return queryViewPage('bo_feature_flag_overrides', {
    filters: [{ column: 'flag_id', op: 'eq', value: query.flagId }],
    order: [
      { column: 'is_expired', ascending: true },
      { column: 'created_at', ascending: false },
      { column: 'override_id', ascending: false },
    ],
    limit: OVERRIDES_PAGE_SIZE,
    offset: (query.page - 1) * OVERRIDES_PAGE_SIZE,
  })
}

/** Lapsed pins on this flag. The number the "unutulmuş tanım" tile shows. */
export async function countExpiredOverrides(flagId: string): Promise<number> {
  return countView('bo_feature_flag_overrides', [
    { column: 'flag_id', op: 'eq', value: flagId },
    { column: 'is_expired', op: 'is', value: true },
  ])
}

/**
 * The stored pin for one (flag, user) pair, from the base table.
 *
 * `feature_flag_overrides_unique` makes the pair unique, so this is what tells
 * a write whether it is an insert or an update — asked of the database at the
 * moment of acting rather than inferred from what the form was rendered with.
 */
export async function loadOverride(
  flagId: string,
  userId: string,
): Promise<FeatureFlagOverrideTableRow | null> {
  return queryTableOne('feature_flag_overrides', {
    filters: [
      { column: 'flag_id', op: 'eq', value: flagId },
      { column: 'user_id', op: 'eq', value: userId },
    ],
  })
}

/** The pin a remove action names, so the audit row can carry what it removed. */
export async function loadOverrideById(
  overrideId: string,
): Promise<FeatureFlagOverrideTableRow | null> {
  return queryTableOne('feature_flag_overrides', {
    filters: [{ column: 'id', op: 'eq', value: overrideId }],
  })
}

/**
 * Whether a user id names a real account.
 *
 * Checked before the pin is written so a mistyped id is a field error rather
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

// ===========================================================================
// Naming the people on a row
// ===========================================================================

export interface FlagAdmin {
  readonly adminUserId: string
  readonly name: string | null
  readonly emailRedacted: string | null
  readonly roleLabel: string
  readonly isActive: boolean
}

const NO_ADMINS: ReadonlyMap<string, FlagAdmin> = new Map()

/**
 * The staff rows for a set of admin ids, keyed by id.
 *
 * One request for a whole page rather than one per row, and it reads
 * `bo_admin_users` — where another admin's address is already redacted —
 * rather than `admin_users`, whose `email` column is in the clear.
 */
export async function loadFlagAdmins(
  adminUserIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, FlagAdmin>> {
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
// The change trail
// ===========================================================================

/**
 * Everything the audit log holds about one flag, newest first.
 *
 * All six operations in this module write their audit row against
 * `entity_type = 'feature_flag'` and the flag's own id — including the two
 * override actions, which additionally name the affected user in
 * `subject_user_id`. That is what makes "everything ever done to this flag" one
 * indexed query rather than a union of three.
 *
 * Refused attempts are here too: `runAdminAction` writes a `failure` row when a
 * permission check or a constraint refuses the operation, so an operator
 * reaching for a kill switch they may not pull leaves a mark on the flag they
 * aimed it at.
 */
export async function loadFlagTrail(
  flagId: string,
  limit: number = FLAG_TRAIL_LIMIT,
): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [
      { column: 'entity_type', op: 'eq', value: FLAG_ENTITY_TYPE },
      { column: 'entity_id', op: 'eq', value: flagId },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  })
}

export async function countFlagTrail(flagId: string): Promise<number> {
  return countView('bo_audit', [
    { column: 'entity_type', op: 'eq', value: FLAG_ENTITY_TYPE },
    { column: 'entity_id', op: 'eq', value: flagId },
  ])
}
