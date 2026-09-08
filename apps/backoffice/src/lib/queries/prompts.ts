import 'server-only'

import { addLocalDays, isAppError, systemClock, toIsoDate, type Clock } from '@da/domain'
import {
  FEATURE_VERSION_LIMIT,
  PROMPTS_PAGE_SIZE,
  PROMPT_TRAIL_LIMIT,
  type PromptListParams,
  type PromptSort,
  type PromptSortKey,
  type PromptStatusValue,
} from '@/components/prompts/contract'
import {
  countView,
  queryTable,
  queryTableOne,
  queryView,
  queryViewOne,
  queryViewPage,
  type BoAdminUserRow,
  type BoAiSpendDailyRow,
  type BoAuditRow,
  type BoPromptVersionRow,
  type PromptStatus,
  type PromptVersionTableRow,
  type ViewFilter,
  type ViewOrder,
  type ViewPage,
} from '@/lib/db'
import { OPS_TIME_ZONE } from '@/lib/format'
import { messages } from '@/lib/messages'

/**
 * Every read behind the prompt-version area.
 *
 * ---------------------------------------------------------------------------
 * TWO SOURCES, AND WHY THERE HAVE TO BE TWO
 * ---------------------------------------------------------------------------
 *
 * `bo_prompt_versions` is the list. It carries the status, the model, the
 * generated length and md5 fingerprint, who created and activated the version,
 * and — from a lateral join over `ai_usage_events` — the 30-day call count and
 * cost attributed to it. It deliberately does not carry `body`: 0019's comment
 * says the view "does not reference prompt_versions.body at all, not even
 * inside length()", because 0017's guarantee is about column dependencies
 * rather than output names.
 *
 * `prompt_versions` is the record. It is an operator-owned table — the body is
 * company IP, the instruction the platform gives a model, not anything a user
 * wrote — so `@/lib/db` allows it by name in `AdminTableName` and the editor
 * and the diff read the body straight from it. `ContentTable` proves at compile
 * time that this is not a way into anybody's mail.
 *
 * So: lists and every number come from the view; a body comes from the table,
 * one row at a time, only on a page that is about that one version.
 *
 * ---------------------------------------------------------------------------
 * WHAT CANNOT BE MEASURED HERE, AND WHY IT IS SAID ON SCREEN
 * ---------------------------------------------------------------------------
 *
 * Per-version token totals and a per-version thumbs up/down rate are both
 * unavailable, for two different reasons, and the console states both rather
 * than approximating either:
 *
 *   - **Tokens.** `ai_usage_events.tokens_in` / `tokens_out` exist, but no
 *     content-blind view groups them by `prompt_version_id`:
 *     `bo_prompt_versions` derives only `count(*)` and `sum(cost_micros)`, and
 *     `bo_ai_spend` / `bo_ai_spend_daily` group by user and by
 *     (day, model, operation). This app may not add a view. What it can offer
 *     honestly is the model-wide total from `bo_ai_spend_daily`, labelled as
 *     model-wide — which is what `loadModelUsage` returns.
 *
 *   - **Feedback.** `ai_feedback` has no prompt version column at all: a signal
 *     is keyed to the entity a user reacted to, not to the version that
 *     produced it, and it carries a free-text `note`, so it is a content table
 *     with no `bo_*` view and cannot get one from here. The rate is therefore
 *     not derivable at any fidelity, and the page says so.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE ARITHMETIC HAPPENS
 * ---------------------------------------------------------------------------
 *
 * In Postgres. Every tile is a `count=exact` HEAD request with no row bodies on
 * the wire; every list is a bounded page with the exact total beside it. The
 * two folds this module does in JavaScript — the feature roster and the
 * model-wide token totals — are over rows that are *already* grouped by the
 * view, because PostgREST exposes no `SUM` and no `DISTINCT`. Both are page-
 * bounded and both report `truncated` when the ceiling was reached, so a
 * partial answer is stated rather than shown as a smaller truth.
 */

// ===========================================================================
// The console's vocabulary and the database's, proved to be the same
//
// `@/components/prompts/contract` re-declares `prompt_status` because it has to
// be importable from a Client Component. These two aliases fail to compile the
// moment either side gains a member the other does not have.
// ===========================================================================

type Covers<Narrow extends Wide, Wide> = Narrow

export type ConsoleStatusesExist = Covers<PromptStatusValue, PromptStatus>
export type DatabaseStatusesAreLabelled = Covers<PromptStatus, PromptStatusValue>

// ===========================================================================
// Failure isolation
// ===========================================================================

/** A query result that carries its own failure, so one panel can fail alone. */
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
// Columns
// ===========================================================================

/**
 * Everything the record page needs from the table, body included.
 *
 * Named explicitly rather than selected with `*` so the one column that makes
 * this table different — `body` — is requested deliberately by the two callers
 * that render or diff it, and never dragged into a list by accident.
 */
const RECORD_COLUMNS = [
  'id',
  'feature',
  'version',
  'status',
  'body',
  'body_length',
  'body_fingerprint',
  'notes',
  'model',
  'created_by',
  'activated_by',
  'activated_at',
  'archived_at',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof PromptVersionTableRow)[]

export type PromptRecord = Pick<PromptVersionTableRow, (typeof RECORD_COLUMNS)[number]>

// ===========================================================================
// The list
// ===========================================================================

/**
 * The sort each key applies.
 *
 * Every column named here exists on `bo_prompt_versions`. `version` descending
 * is appended as a tiebreak so two versions of one feature never swap places
 * between page one and page two, and `prompt_version_id` after it so two
 * features created in the same transaction cannot either.
 */
const SORT_COLUMNS: Readonly<Record<PromptSortKey, keyof BoPromptVersionRow & string>> =
  Object.freeze({
    created_at: 'created_at',
    feature: 'feature',
    version: 'version',
    activated_at: 'activated_at',
    event_count_30d: 'event_count_30d',
    cost_micros_30d: 'cost_micros_30d',
    body_length: 'body_length',
  })

function listOrder(sort: PromptSort): readonly ViewOrder<BoPromptVersionRow>[] {
  const ascending = sort.direction === 'asc'
  const primary: ViewOrder<BoPromptVersionRow> = {
    column: SORT_COLUMNS[sort.key],
    ascending,
    nullsFirst: false,
  }
  if (sort.key === 'version') {
    return [
      { column: 'feature', ascending: true },
      primary,
      { column: 'prompt_version_id', ascending: false },
    ]
  }
  return [
    primary,
    { column: 'version', ascending: false },
    { column: 'prompt_version_id', ascending: false },
  ]
}

function listFilters(params: PromptListParams): readonly ViewFilter<BoPromptVersionRow>[] {
  const filters: ViewFilter<BoPromptVersionRow>[] = []
  if (params.feature !== null) {
    filters.push({ column: 'feature', op: 'eq', value: params.feature })
  }
  if (params.status !== null) {
    filters.push({ column: 'status', op: 'eq', value: params.status })
  }
  // Anchored: a pattern opening with `%` cannot use `prompt_versions_feature_idx`.
  if (params.search !== null) {
    filters.push({ column: 'feature', op: 'ilike', value: `${params.search}%` })
  }
  return filters
}

/** One page of versions, with the exact total behind it. */
export async function listPromptVersions(
  params: PromptListParams,
  sort: PromptSort,
): Promise<ViewPage<BoPromptVersionRow>> {
  return queryViewPage('bo_prompt_versions', {
    filters: listFilters(params),
    order: listOrder(sort),
    limit: PROMPTS_PAGE_SIZE,
    offset: (params.page - 1) * PROMPTS_PAGE_SIZE,
  })
}

// ===========================================================================
// The tiles
// ===========================================================================

export interface PromptSummary {
  readonly total: number
  readonly draft: number
  readonly active: number
  readonly archived: number
  /**
   * Active versions that took no model call in the last 30 days.
   *
   * Either the feature is dormant or the service making the call is not writing
   * `prompt_version_id` — both worth knowing, and neither visible from a list
   * sorted by date.
   */
  readonly idleActive: number
}

/** Five `count(*)`s over `bo_prompt_versions`, run concurrently. */
export async function loadPromptSummary(): Promise<PromptSummary> {
  const status = (value: PromptStatusValue): readonly ViewFilter<BoPromptVersionRow>[] => [
    { column: 'status', op: 'eq', value },
  ]

  const [total, draft, active, archived, idleActive] = await Promise.all([
    countView('bo_prompt_versions'),
    countView('bo_prompt_versions', status('draft')),
    countView('bo_prompt_versions', status('active')),
    countView('bo_prompt_versions', status('archived')),
    countView('bo_prompt_versions', [
      ...status('active'),
      { column: 'event_count_30d', op: 'eq', value: 0 },
    ]),
  ])

  return { total, draft, active, archived, idleActive }
}

// ===========================================================================
// The feature roster
// ===========================================================================

/** Rows read while folding the roster, and the page ceiling. */
export const ROSTER_PAGE_SIZE = 200
export const ROSTER_MAX_PAGES = 3

export interface FeatureSummary {
  readonly feature: string
  /** The version serving traffic right now, or null when none is. */
  readonly active: BoPromptVersionRow | null
  readonly draftCount: number
  /** The newest draft, so the roster can link straight to what is waiting. */
  readonly latestDraft: BoPromptVersionRow | null
}

export interface FeatureRoster {
  readonly features: readonly FeatureSummary[]
  /** The page ceiling was reached: the roster is incomplete and says so. */
  readonly truncated: boolean
}

/**
 * One row per feature that has an active version or a draft waiting.
 *
 * PostgREST has no `DISTINCT`, so the feature list has to be folded from rows.
 * Folding *every* version would mean reading the archive, which grows without
 * bound; folding `status in (draft, active)` does not — the partial unique
 * index `prompt_versions_one_active_per_feature` guarantees at most one active
 * row per feature, and drafts are by nature few. The read is still page-bounded
 * and still reports the ceiling, because "by nature few" is an expectation and
 * not a constraint.
 *
 * A feature whose every version is archived is absent by construction, and the
 * panel's own description says so: such a feature is not being served and is
 * followed from the version table below rather than from a roster of what is
 * live.
 */
export async function loadFeatureRoster(): Promise<FeatureRoster> {
  const rows: BoPromptVersionRow[] = []
  let truncated = false

  for (let page = 0; page < ROSTER_MAX_PAGES; page += 1) {
    const batch = await queryView('bo_prompt_versions', {
      filters: [{ column: 'status', op: 'in', value: ['draft', 'active'] }],
      order: [
        { column: 'feature', ascending: true },
        { column: 'version', ascending: false },
      ],
      limit: ROSTER_PAGE_SIZE,
      offset: page * ROSTER_PAGE_SIZE,
    })
    rows.push(...batch)
    if (batch.length < ROSTER_PAGE_SIZE) break
    if (page === ROSTER_MAX_PAGES - 1) truncated = true
  }

  const byFeature = new Map<
    string,
    {
      active: BoPromptVersionRow | null
      draftCount: number
      latestDraft: BoPromptVersionRow | null
    }
  >()

  for (const row of rows) {
    const entry = byFeature.get(row.feature) ?? { active: null, draftCount: 0, latestDraft: null }
    if (row.status === 'active') {
      entry.active = row
    } else if (row.status === 'draft') {
      entry.draftCount += 1
      // Rows arrive version-descending inside a feature, so the first draft seen
      // is the newest one.
      if (entry.latestDraft === null) entry.latestDraft = row
    }
    byFeature.set(row.feature, entry)
  }

  const features = [...byFeature.entries()]
    .map(([feature, entry]) => ({
      feature,
      active: entry.active,
      draftCount: entry.draftCount,
      latestDraft: entry.latestDraft,
    }))
    .sort((a, b) => a.feature.localeCompare(b.feature, 'tr'))

  return { features, truncated }
}

/** Features with a draft waiting and nothing serving traffic. */
export function featuresWithoutActive(roster: FeatureRoster): number {
  return roster.features.filter((entry) => entry.active === null).length
}

// ===========================================================================
// One version
// ===========================================================================

/** The record itself, body included. The only caller is a version's own page. */
export async function loadPromptRecord(promptId: string): Promise<PromptRecord | null> {
  return queryTableOne('prompt_versions', {
    columns: RECORD_COLUMNS,
    filters: [{ column: 'id', op: 'eq', value: promptId }],
  })
}

/** The same version as the list sees it: status, fingerprint and its usage. */
export async function loadPromptMetrics(promptId: string): Promise<BoPromptVersionRow | null> {
  return queryViewOne('bo_prompt_versions', {
    filters: [{ column: 'prompt_version_id', op: 'eq', value: promptId }],
  })
}

/**
 * The version serving a feature right now, body included.
 *
 * The partial unique index means this is at most one row, so `limit 1` is not
 * an arbitrary truncation of a set — it is the set.
 */
export async function loadActiveRecord(feature: string): Promise<PromptRecord | null> {
  return queryTableOne('prompt_versions', {
    columns: RECORD_COLUMNS,
    filters: [
      { column: 'feature', op: 'eq', value: feature },
      { column: 'status', op: 'eq', value: 'active' },
    ],
  })
}

/**
 * The highest-numbered version of a feature below `version`, body included.
 *
 * This is the baseline a version that is *already* active is read against:
 * diffing the live prompt with itself would show nothing, and what an operator
 * needs at that point is what changed when it went live.
 */
export async function loadPreviousRecord(
  feature: string,
  version: number,
): Promise<PromptRecord | null> {
  return queryTableOne('prompt_versions', {
    columns: RECORD_COLUMNS,
    filters: [
      { column: 'feature', op: 'eq', value: feature },
      { column: 'version', op: 'lt', value: version },
    ],
    order: { column: 'version', ascending: false },
  })
}

/** Every version of one feature, newest first, bounded and stated. */
export async function listFeatureVersions(feature: string): Promise<readonly BoPromptVersionRow[]> {
  return queryView('bo_prompt_versions', {
    filters: [{ column: 'feature', op: 'eq', value: feature }],
    order: { column: 'version', ascending: false },
    limit: FEATURE_VERSION_LIMIT,
  })
}

/**
 * The number the next version of a feature will take.
 *
 * An `order by version desc limit 1` — an index seek on
 * `prompt_versions_feature_idx`, not a scan. It is an optimistic read and the
 * console treats it as one: `prompt_versions_unique_version` is what actually
 * decides, and two operators drafting at once means one of them meets a
 * duplicate-key refusal and is told to retry. Reserving numbers in the
 * application would be a second, weaker copy of a constraint that already
 * exists.
 */
export async function nextVersionFor(feature: string): Promise<number> {
  const rows = await queryTable('prompt_versions', {
    columns: ['version'],
    filters: [{ column: 'feature', op: 'eq', value: feature }],
    order: { column: 'version', ascending: false },
    limit: 1,
  })
  const highest = rows[0]?.version ?? 0
  return highest + 1
}

// ===========================================================================
// Model-wide usage
//
// The honest answer to "how many tokens did this prompt cost", given that no
// content-blind view groups tokens by prompt version. It is the model's total
// across the whole platform, and every string that renders it says so.
// ===========================================================================

/** Rows per request when folding `bo_ai_spend_daily`, and the page ceiling. */
export const MODEL_USAGE_PAGE_SIZE = 500
export const MODEL_USAGE_MAX_PAGES = 4

export interface ModelUsage {
  readonly model: string
  readonly days: number
  readonly eventCount: number
  readonly tokensIn: number
  readonly tokensOut: number
  readonly costMicros: number
  /** The ceiling was reached: the totals are a floor, and the screen says so. */
  readonly truncated: boolean
}

/**
 * Platform-wide totals for one model over the last `days` Istanbul days.
 *
 * `bo_ai_spend_daily` is already `group by (day, model, operation)` in the
 * view, so this sums a few hundred pre-aggregated buckets rather than scanning
 * `ai_usage_events`. PostgREST offers no `SUM`, which is why the fold happens
 * here; the page ceiling is why it cannot become a download.
 *
 * The lower bound is an Istanbul calendar day, not a UTC one. The view buckets
 * on `(occurred_at at time zone 'Europe/Istanbul')::date`, so a cutoff derived
 * from UTC would include or drop a boundary day depending on the hour the page
 * was opened — a number that changes at 03:00 for no reason anybody could
 * explain.
 */
export async function loadModelUsage(
  model: string,
  days = 30,
  clock: Clock = systemClock,
): Promise<ModelUsage> {
  const since = toIsoDate(addLocalDays(clock.now(), -days, OPS_TIME_ZONE), OPS_TIME_ZONE)

  let eventCount = 0
  let tokensIn = 0
  let tokensOut = 0
  let costMicros = 0
  let truncated = false

  for (let page = 0; page < MODEL_USAGE_MAX_PAGES; page += 1) {
    const batch: readonly BoAiSpendDailyRow[] = await queryView('bo_ai_spend_daily', {
      columns: ['usage_date', 'model', 'event_count', 'tokens_in', 'tokens_out', 'cost_micros'],
      filters: [
        { column: 'model', op: 'eq', value: model },
        { column: 'usage_date', op: 'gte', value: since },
      ],
      order: [
        { column: 'usage_date', ascending: false },
        { column: 'operation', ascending: true },
      ],
      limit: MODEL_USAGE_PAGE_SIZE,
      offset: page * MODEL_USAGE_PAGE_SIZE,
    })

    for (const row of batch) {
      eventCount += row.event_count
      tokensIn += row.tokens_in
      tokensOut += row.tokens_out
      costMicros += row.cost_micros
    }

    if (batch.length < MODEL_USAGE_PAGE_SIZE) break
    if (page === MODEL_USAGE_MAX_PAGES - 1) truncated = true
  }

  return { model, days, eventCount, tokensIn, tokensOut, costMicros, truncated }
}

// ===========================================================================
// Naming the people on the page
// ===========================================================================

export interface PromptAdmin {
  readonly adminUserId: string
  readonly name: string | null
  readonly emailRedacted: string | null
  readonly roleLabel: string
  readonly isActive: boolean
}

const NO_ADMINS: ReadonlyMap<string, PromptAdmin> = Object.freeze(new Map<string, PromptAdmin>())

/**
 * One lookup for every operator named anywhere on a page.
 *
 * `bo_admin_users` redacts the address itself; nothing here reverses that. A
 * failure is the caller's to absorb — the columns then read "Bilinmiyor", which
 * is true, rather than blanking a panel that had real content in it.
 */
export async function loadPromptAdmins(
  adminUserIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, PromptAdmin>> {
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

/** The entity type all four of this area's audit rows are written against. */
export const PROMPT_ENTITY_TYPE = 'prompt_version'

/**
 * Everything the audit log holds about one version, newest first.
 *
 * All four operations write against `entity_type = 'prompt_version'` and the
 * version's own id, which makes "everything ever done to this prompt" one
 * indexed query. Refused attempts are here too: `runAdminAction` writes a
 * `failure` row when a permission check or a constraint refuses an activation,
 * and an operator repeatedly reaching for something they may not do is exactly
 * what a trail is for.
 */
export async function loadPromptTrail(promptId: string): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [
      { column: 'entity_type', op: 'eq', value: PROMPT_ENTITY_TYPE },
      { column: 'entity_id', op: 'eq', value: promptId },
    ],
    order: { column: 'created_at', ascending: false },
    limit: PROMPT_TRAIL_LIMIT,
  })
}

export async function countPromptTrail(promptId: string): Promise<number> {
  return countView('bo_audit', [
    { column: 'entity_type', op: 'eq', value: PROMPT_ENTITY_TYPE },
    { column: 'entity_id', op: 'eq', value: promptId },
  ])
}
