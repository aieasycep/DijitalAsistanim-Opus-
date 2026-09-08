/**
 * The wire contract for the feature-flag area: routes, query parameters, form
 * field names, the enum vocabularies and the pure helpers both sides share.
 *
 * A `'use server'` module may export nothing but async functions, and a Client
 * Component cannot import one without dragging its module graph — and with it
 * `@/lib/db` and the service-role key — across the client boundary. So every
 * name the pages, the forms and the Server Actions have to agree on lives here,
 * in a plain module with no imports at all. Getting one wrong is then a type
 * error rather than a form that posts a field nobody reads.
 *
 * The three vocabularies below mirror the Postgres enums `app_platform` and
 * `app_plan` and the `effective_state` expression of `bo_feature_flags`. They
 * are re-declared rather than imported because `@/lib/db` is `server-only`;
 * `@/lib/queries/flags.ts` carries a compile-time proof that the declarations
 * still name the same members, so a member added to the database without being
 * added here fails `tsc`.
 *
 * Nothing defined here can carry user content. The parameters are uuids, enum
 * tokens, a flag key (a lower-snake dotted identifier the company chose) and
 * small integers; the only free text that crosses this boundary is an
 * operator's own written reason, which is the thing the audit trail exists to
 * keep.
 */

// ===========================================================================
// Routes
// ===========================================================================

/** Every flag with its real current state. Requires `flags.read`. */
export const FLAGS_PATH = '/flags'

/** The create form. Requires `flags.write`. */
export const FLAGS_NEW_PATH = '/flags/new'

/** One flag: targeting, per-user overrides and the change trail. */
export function flagPath(flagId: string): string {
  return `${FLAGS_PATH}/${flagId}`
}

/** The user record an override points at. */
export function userPath(userId: string): string {
  return `/users/${userId}`
}

// ===========================================================================
// Vocabulary
// ===========================================================================

/** `app_platform`. An empty targeting array means every platform, not none. */
export const FLAG_PLATFORMS = ['ios', 'android', 'web'] as const
export type FlagPlatform = (typeof FLAG_PLATFORMS)[number]

/** `app_plan`. An empty targeting array means every plan. */
export const FLAG_PLANS = ['free', 'pro'] as const
export type FlagPlan = (typeof FLAG_PLANS)[number]

/**
 * `bo_feature_flags.effective_state`, computed in the view the same way
 * `feature_flag_is_enabled()` computes it — so the list cannot claim a flag is
 * on while the evaluator returns false.
 */
export const FLAG_STATES = ['killed', 'off', 'partial', 'on'] as const
export type FlagState = (typeof FLAG_STATES)[number]

export function isFlagPlatform(value: string): value is FlagPlatform {
  return (FLAG_PLATFORMS as readonly string[]).includes(value)
}

export function isFlagPlan(value: string): value is FlagPlan {
  return (FLAG_PLANS as readonly string[]).includes(value)
}

export function isFlagState(value: string): value is FlagState {
  return (FLAG_STATES as readonly string[]).includes(value)
}

// ===========================================================================
// Shapes the database enforces
//
// Each mirrors a CHECK constraint in migration 0019. They are here so an
// operator is told which character is wrong before they submit; the constraint
// is still what refuses the write, and a post that skipped this form meets the
// same schema on the way in.
// ===========================================================================

/** `feature_flags_key_shape`: `a_b.c_d`, lower snake, dot separated. */
export const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/

/** `feature_flags_min_version_shape` / `..._max_version_shape`: `1.2.3`. */
export const APP_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/

/** `feature_flags_rollout_range`. */
export const ROLLOUT_MIN = 0
export const ROLLOUT_MAX = 100

/** The console's own bounds. The key is an identifier, not a sentence. */
export const FLAG_KEY_MAX = 120

/**
 * `feature_flags_description_not_blank` accepts one character. The console
 * asks for a sentence: the description is what the next operator reads when
 * deciding whether a flag may be pulled, and "test" answers nothing.
 */
export const FLAG_DESCRIPTION_MIN = 10
export const FLAG_DESCRIPTION_MAX = 240

/**
 * How long a per-user pin may live, in days. `0` is "süresiz" — no expiry.
 *
 * A duration rather than a date: the operator's browser and the server do not
 * share a timezone, and a `datetime-local` that silently lands three hours out
 * is worse than no expiry at all. The instant is computed server-side from the
 * injected clock.
 */
export const OVERRIDE_DURATION_DAYS = [0, 1, 3, 7, 30] as const
export type OverrideDurationDays = (typeof OVERRIDE_DURATION_DAYS)[number]
export const DEFAULT_OVERRIDE_DURATION_DAYS = 7

export function isOverrideDuration(value: number): value is OverrideDurationDays {
  return (OVERRIDE_DURATION_DAYS as readonly number[]).includes(value)
}

// ===========================================================================
// Query parameters
// ===========================================================================

export const LIST_PARAMS = {
  state: 'state',
  platform: 'platform',
  plan: 'plan',
  q: 'q',
  page: 'page',
} as const

/** The override table's own pager, so it does not fight the list's `page`. */
export const OVERRIDE_PAGE_PARAM = 'overrides'

/** What a Server Action reports back through the URL. */
export const RESULT_PARAMS = {
  outcome: 'result',
  /** The flag key the outcome is about, for the banner's sentence. */
  key: 'flag',
} as const

export const FLAGS_PAGE_SIZE = 25
export const OVERRIDES_PAGE_SIZE = 20
export const FLAG_TRAIL_LIMIT = 20

/**
 * Columns the list may be ordered by.
 *
 * A closed set, because the value ends up in an `order by`. Every member is a
 * real column of `bo_feature_flags`.
 */
export const FLAG_SORT_KEYS = ['key', 'updated_at', 'rollout_percentage', 'override_count'] as const
export type FlagSortKey = (typeof FLAG_SORT_KEYS)[number]

export function isFlagSortKey(value: string): value is FlagSortKey {
  return (FLAG_SORT_KEYS as readonly string[]).includes(value)
}

/** One ordering, as the page parses it and the query applies it. */
export interface FlagSort {
  readonly key: FlagSortKey
  readonly direction: 'asc' | 'desc'
}

/** Most recently changed first: the flag somebody just touched is the news. */
export const DEFAULT_FLAG_SORT: FlagSort = { key: 'updated_at', direction: 'desc' }

// ===========================================================================
// Form fields
//
// `reason` is spelled exactly as `runAdminAction` reads it: the runner pulls
// the justification off the parsed input by that name and refuses the action
// when `admin_sensitive_actions` says the action demands one — which it does
// for all three `feature_flag.*` actions.
// ===========================================================================

export const FLAG_FIELDS = {
  flagId: 'flagId',
  key: 'key',
  description: 'description',
  enabled: 'enabled',
  rollout: 'rolloutPercentage',
  platform: 'platform',
  plan: 'plan',
  minVersion: 'minAppVersion',
  maxVersion: 'maxAppVersion',
  reason: 'reason',
} as const

export const TOGGLE_FIELDS = {
  flagId: 'flagId',
  enabled: 'enabled',
  reason: 'reason',
} as const

export const KILL_FIELDS = {
  flagId: 'flagId',
  killSwitch: 'killSwitch',
  reason: 'reason',
} as const

export const OVERRIDE_FIELDS = {
  flagId: 'flagId',
  /** Only the remove form posts this: a new pin is addressed by (flag, user). */
  overrideId: 'overrideId',
  userId: 'userId',
  enabled: 'enabled',
  durationDays: 'durationDays',
  reason: 'reason',
} as const

/** `1` / `0`, so a checkbox and a select post the same vocabulary. */
export const BOOLEAN_TRUE = '1'
export const BOOLEAN_FALSE = '0'

// ===========================================================================
// What a form gets back
// ===========================================================================

/**
 * The answer a multi-field form renders.
 *
 * Field issues are keyed by the form field they belong to, so a message lands
 * under the input that caused it rather than in a banner saying "something was
 * wrong" to somebody who has just filled in nine fields.
 */
export interface FlagFormState {
  readonly status: 'idle' | 'success' | 'error'
  readonly message: string | null
  readonly issues: Readonly<Record<string, string>>
}

export const initialFlagFormState: FlagFormState = {
  status: 'idle',
  message: null,
  issues: {},
}

// ===========================================================================
// Outcomes
// ===========================================================================

export const FLAG_OUTCOMES = [
  'created',
  'updated',
  'enabled',
  'disabled',
  'killed',
  'unkilled',
  'overrideSet',
  'overrideRemoved',
  'noop',
  'duplicate',
  'conflict',
  'invalid',
  'forbidden',
  'notfound',
  'ratelimited',
  'failed',
  'auditMissing',
] as const

export type FlagOutcome = (typeof FLAG_OUTCOMES)[number]

export function isFlagOutcome(value: string): value is FlagOutcome {
  return (FLAG_OUTCOMES as readonly string[]).includes(value)
}

/** `path?result=killed&flag=assistant.composer` — where an action lands. */
export function withOutcome(path: string, outcome: FlagOutcome, key: string | null = null): string {
  const query = new URLSearchParams()
  query.set(RESULT_PARAMS.outcome, outcome)
  if (key !== null && key !== '') query.set(RESULT_PARAMS.key, key.slice(0, FLAG_KEY_MAX))
  return `${path}?${query.toString()}`
}

// ===========================================================================
// Parsing what arrives on the URL
// ===========================================================================

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isUuidParam(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * What the search box may send to PostgREST.
 *
 * A flag key is an identifier the company chose, so the charset is the key's
 * own. `_` is a single-character wildcard in `LIKE`, which makes the prefix
 * match slightly broader than typed — harmless over a namespace nobody outside
 * the company writes, and the alternative is refusing to search for half the
 * real keys.
 */
const SEARCH_RE = /^[a-z0-9._]{1,80}$/

export function isSearchable(value: string): boolean {
  return SEARCH_RE.test(value)
}

export function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const raw = params[key]
  if (Array.isArray(raw)) return (raw[0] ?? '').trim()
  return (raw ?? '').trim()
}

/**
 * Every parameter currently on the page, flattened.
 *
 * The table's own sort, page and column links are built from this, so paging
 * never drops a filter the table itself knows nothing about.
 */
export function toQueryRecord(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const record: Record<string, string> = {}
  for (const key of Object.keys(params)) {
    const value = firstParam(params, key)
    if (value !== '') record[key] = value
  }
  return record
}

/**
 * The same query without the last action's answer.
 *
 * A result banner belongs to the navigation that produced it. Carrying
 * `?result=killed` into a page link would re-announce a kill switch every time
 * somebody turned a page, so the table's own links and the banner's dismiss
 * link are both built from this.
 */
export function withoutResultParams(query: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (key === RESULT_PARAMS.outcome || key === RESULT_PARAMS.key) continue
    next[key] = value
  }
  return next
}

/** `path?a=1` from a flat query record, with the keys in a stable order. */
export function hrefWithQuery(path: string, query: Record<string, string>): string {
  const search = new URLSearchParams()
  for (const key of Object.keys(query).sort()) search.set(key, query[key] ?? '')
  const encoded = search.toString()
  return encoded === '' ? path : `${path}?${encoded}`
}

export interface FlagListParams {
  readonly state: FlagState | null
  readonly platform: FlagPlatform | null
  readonly plan: FlagPlan | null
  /** A key prefix, or null when the parameter was absent. */
  readonly search: string | null
  /** True when something was typed that cannot be a key: the screen says so. */
  readonly searchRejected: boolean
  readonly page: number
}

export function parseFlagListParams(
  params: Record<string, string | string[] | undefined>,
): FlagListParams {
  const stateRaw = firstParam(params, LIST_PARAMS.state)
  const platformRaw = firstParam(params, LIST_PARAMS.platform)
  const planRaw = firstParam(params, LIST_PARAMS.plan)
  const searchRaw = firstParam(params, LIST_PARAMS.q).toLowerCase()
  const pageRaw = Number(firstParam(params, LIST_PARAMS.page))

  return {
    state: isFlagState(stateRaw) ? stateRaw : null,
    platform: isFlagPlatform(platformRaw) ? platformRaw : null,
    plan: isFlagPlan(planRaw) ? planRaw : null,
    search: isSearchable(searchRaw) ? searchRaw : null,
    searchRejected: searchRaw !== '' && !isSearchable(searchRaw),
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1,
  }
}

/** The same values back as strings, for `Filters` and for link building. */
export function flagListParamValues(params: FlagListParams): Record<string, string> {
  return {
    [LIST_PARAMS.state]: params.state ?? '',
    [LIST_PARAMS.platform]: params.platform ?? '',
    [LIST_PARAMS.plan]: params.plan ?? '',
    [LIST_PARAMS.q]: params.search ?? '',
    [LIST_PARAMS.page]: params.page > 1 ? String(params.page) : '',
  }
}

export function isFiltered(params: FlagListParams): boolean {
  return (
    params.state !== null ||
    params.platform !== null ||
    params.plan !== null ||
    params.search !== null
  )
}

// ===========================================================================
// The record, as every screen reads it
// ===========================================================================

/**
 * The columns of a flag that decide who sees it.
 *
 * Declared structurally rather than imported from `@/lib/db`, so the pure
 * description helpers below can be used on both sides of the client boundary.
 * `BoFeatureFlagRow` is assignable to it.
 */
export interface FlagTargeting {
  readonly enabled: boolean
  readonly kill_switch: boolean
  readonly rollout_percentage: number
  readonly platforms: readonly string[]
  readonly plans: readonly string[]
  readonly min_app_version: string | null
  readonly max_app_version: string | null
}

/**
 * The state a row is actually in, derived the way the evaluator derives it.
 *
 * `bo_feature_flags` computes the same expression in SQL and the screens read
 * that column; this exists for the two places that hold a targeting shape
 * before it has been written — the edit form's live preview and the create
 * form — where there is no view row to read.
 */
export function deriveState(targeting: FlagTargeting): FlagState {
  if (targeting.kill_switch) return 'killed'
  if (!targeting.enabled) return 'off'
  if (targeting.rollout_percentage >= ROLLOUT_MAX) return 'on'
  return 'partial'
}

/**
 * Whether the flag reaches everybody it could, or only a slice.
 *
 * A flag at 100% is still not "everyone" when it names two platforms and one
 * plan, which is exactly the claim a green dot would make. Every screen that
 * shows a state also shows this, so the two cannot be read apart.
 */
export function isNarrowed(targeting: FlagTargeting): boolean {
  return (
    targeting.platforms.length > 0 ||
    targeting.plans.length > 0 ||
    targeting.min_app_version !== null ||
    targeting.max_app_version !== null ||
    targeting.rollout_percentage < ROLLOUT_MAX
  )
}

/** Members of a targeting array in the enum's declared order. */
export function orderedPlatforms(values: readonly string[]): readonly FlagPlatform[] {
  const present = new Set(values.filter(isFlagPlatform))
  return FLAG_PLATFORMS.filter((platform) => present.has(platform))
}

export function orderedPlans(values: readonly string[]): readonly FlagPlan[] {
  const present = new Set(values.filter(isFlagPlan))
  return FLAG_PLANS.filter((plan) => present.has(plan))
}

/**
 * Whether a targeting form actually changed anything.
 *
 * Used to refuse a no-op before it becomes an audit row: a trail full of
 * "changed nothing, reason: retry" entries is a trail nobody reads.
 */
export function targetingEquals(a: FlagTargeting, b: FlagTargeting): boolean {
  return (
    a.enabled === b.enabled &&
    a.kill_switch === b.kill_switch &&
    a.rollout_percentage === b.rollout_percentage &&
    a.min_app_version === b.min_app_version &&
    a.max_app_version === b.max_app_version &&
    sameMembers(a.platforms, b.platforms) &&
    sameMembers(a.plans, b.plans)
  )
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((value, index) => value === right[index])
}

/**
 * Compare two `major.minor.patch` triples the way the evaluator does — on the
 * numbers, so `1.10.0` sorts above `1.9.0`. Returns null when either side is
 * not a version.
 */
export function compareAppVersions(left: string, right: string): number | null {
  if (!APP_VERSION_PATTERN.test(left) || !APP_VERSION_PATTERN.test(right)) return null
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const first = a[index] ?? 0
    const second = b[index] ?? 0
    if (first !== second) return first < second ? -1 : 1
  }
  return 0
}
