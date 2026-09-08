/**
 * The wire contract for the prompt-version area: routes, query parameters, form
 * field names, the enum vocabulary and the pure helpers both sides share.
 *
 * A `'use server'` module may export nothing but async functions, and a Client
 * Component cannot import one without dragging its module graph — and with it
 * `@/lib/db` and the service-role key — across the client boundary. So every
 * name the pages, the forms and the Server Actions have to agree on lives here,
 * in a plain module with no imports at all. Getting one wrong is then a type
 * error rather than a form that posts a field nobody reads.
 *
 * The status vocabulary mirrors the Postgres enum `prompt_status`;
 * `@/lib/queries/prompts.ts` carries a compile-time proof that the two still
 * name the same members, so a member added to the database without being added
 * here fails `tsc`.
 *
 * Nothing defined here can carry user content. A prompt body is company IP —
 * the instruction the platform gives a model, written by the company — and the
 * only other free text that crosses this boundary is an operator's own written
 * reason, which is the thing the audit trail exists to keep.
 */

// ===========================================================================
// Routes
// ===========================================================================

/** Every feature and every version of its prompt. Requires `prompt.read`. */
export const PROMPTS_PATH = '/ai/prompts'

/** The draft composer. Requires `prompt.write`. */
export const PROMPTS_NEW_PATH = '/ai/prompts/new'

/** One version: its body, its notes, its diff and what it cost. */
export function promptPath(promptId: string): string {
  return `${PROMPTS_PATH}/${promptId}`
}

/**
 * The draft editor. Requires `prompt.write`, and refuses anything that is not a
 * draft — a version that has served is frozen, because the usage attributed to
 * it measured that exact text.
 */
export function promptEditPath(promptId: string): string {
  return `${promptPath(promptId)}/edit`
}

/**
 * The composer, pre-loaded.
 *
 * `feature` fixes which feature the new draft belongs to; `from` names the
 * version whose body it starts as a copy of — which is how a new version is
 * normally written, since a prompt is edited rather than invented twice.
 */
export function newPromptPath(feature?: string | null, fromPromptId?: string | null): string {
  const query = new URLSearchParams()
  if (feature !== undefined && feature !== null && feature !== '') {
    query.set(NEW_PARAMS.feature, feature.slice(0, FEATURE_MAX))
  }
  if (fromPromptId !== undefined && fromPromptId !== null && fromPromptId !== '') {
    query.set(NEW_PARAMS.from, fromPromptId)
  }
  const encoded = query.toString()
  return encoded === '' ? PROMPTS_NEW_PATH : `${PROMPTS_NEW_PATH}?${encoded}`
}

/** The AI spend page, where this area's cost figures are broken down by model. */
export const AI_SPEND_PATH = '/ai'

// ===========================================================================
// Vocabulary
// ===========================================================================

/** `prompt_status`. The whole lifecycle: written, serving, retired. */
export const PROMPT_STATUSES = ['draft', 'active', 'archived'] as const
export type PromptStatusValue = (typeof PROMPT_STATUSES)[number]

export function isPromptStatus(value: string): value is PromptStatusValue {
  return (PROMPT_STATUSES as readonly string[]).includes(value)
}

// ===========================================================================
// Shapes the database enforces
//
// Each mirrors a CHECK constraint in migration 0019. They are here so an
// operator is told which character is wrong before they submit; the constraint
// is still what refuses the write, and a post that skipped this form meets the
// same schema on the way in.
// ===========================================================================

/** `prompt_versions_feature_shape`: `a_b.c_d`, lower snake, dot separated. */
export const FEATURE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/

/** The console's own ceiling. A feature name is an identifier, not a sentence. */
export const FEATURE_MAX = 120

/**
 * `prompt_versions_body_not_blank` accepts one character.
 *
 * The console asks for twenty, which is the shortest thing that can plausibly
 * be an instruction to a model. A one-character "prompt" is a mistake, and the
 * cheapest place to catch it is before it becomes a version number nobody can
 * reuse.
 */
export const BODY_MIN = 20

/**
 * The console's ceiling on a prompt body.
 *
 * The column is `text` and has no limit of its own. This one exists so a paste
 * accident cannot put a megabyte through a Server Action, and it is generous
 * enough that no real system prompt meets it.
 */
export const BODY_MAX = 40_000

/** Free-text notes for the next operator: why this version exists. */
export const NOTES_MAX = 2_000

/**
 * A model identifier as the providers spell them — `claude-opus-4-1-20250805`,
 * `gpt-4o-mini`. Letters, digits and the three separators they use, and nothing
 * that could be a sentence: this value is written into the audit trail, where
 * `safeIdentifier()` collapses anything token-shaped it does not recognise.
 */
export const MODEL_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/i
export const MODEL_MAX = 80

// ===========================================================================
// Reason bounds
//
// Restated here because a Client Component cannot import `@/lib/admin-action`,
// which is `server-only`. `@/lib/actions/prompts.ts` asserts these two are the
// runner's floor and the trail's ceiling, so a drift stops the build rather
// than producing a form that accepts reasons the server refuses.
// ===========================================================================

export const PROMPT_REASON_MIN = 10
export const PROMPT_REASON_MAX = 280

// ===========================================================================
// Query parameters
// ===========================================================================

export const LIST_PARAMS = {
  feature: 'feature',
  status: 'status',
  q: 'q',
  page: 'page',
} as const

export const NEW_PARAMS = {
  feature: 'feature',
  from: 'from',
} as const

/** What a Server Action reports back through the URL. */
export const RESULT_PARAMS = {
  outcome: 'result',
  /** The feature the outcome is about, for the banner's sentence. */
  feature: 'pf',
  /** Its version number, as digits. */
  version: 'pv',
} as const

export const PROMPTS_PAGE_SIZE = 25

/** Versions of one feature listed beside a record. Bounded, and stated. */
export const FEATURE_VERSION_LIMIT = 50

/** Audit rows shown on a version's page. */
export const PROMPT_TRAIL_LIMIT = 20

/**
 * Columns the list may be ordered by.
 *
 * A closed set, because the value ends up in an `order by`. Every member is a
 * real column of `bo_prompt_versions`.
 */
export const PROMPT_SORT_KEYS = [
  'created_at',
  'feature',
  'version',
  'activated_at',
  'event_count_30d',
  'cost_micros_30d',
  'body_length',
] as const
export type PromptSortKey = (typeof PROMPT_SORT_KEYS)[number]

export function isPromptSortKey(value: string): value is PromptSortKey {
  return (PROMPT_SORT_KEYS as readonly string[]).includes(value)
}

export interface PromptSort {
  readonly key: PromptSortKey
  readonly direction: 'asc' | 'desc'
}

/** Newest first: the version somebody just wrote is the news. */
export const DEFAULT_PROMPT_SORT: PromptSort = { key: 'created_at', direction: 'desc' }

// ===========================================================================
// Form fields
//
// `reason` is spelled exactly as `runAdminAction` reads it: the runner pulls the
// justification off the parsed input by that name and refuses the action when
// `admin_sensitive_actions` says the action demands one — which it does for
// `prompt.activated` and, by the namespace rule, for `admin.prompt_archived`.
// ===========================================================================

export const PROMPT_FIELDS = {
  promptId: 'promptId',
  feature: 'feature',
  model: 'model',
  notes: 'notes',
  body: 'body',
  reason: 'reason',
} as const

export const ACTIVATE_FIELDS = {
  promptId: 'promptId',
  reason: 'reason',
} as const

export const ARCHIVE_FIELDS = {
  promptId: 'promptId',
  reason: 'reason',
} as const

// ===========================================================================
// What a form gets back
// ===========================================================================

/**
 * The answer the composer renders.
 *
 * Field issues are keyed by the form field they belong to, so a message lands
 * under the input that caused it rather than in a banner saying "something was
 * wrong" to somebody who has just written four hundred words of prompt.
 */
export interface PromptFormState {
  readonly status: 'idle' | 'error'
  readonly message: string | null
  readonly issues: Readonly<Record<string, string>>
}

export const initialPromptFormState: PromptFormState = {
  status: 'idle',
  message: null,
  issues: {},
}

// ===========================================================================
// Outcomes
// ===========================================================================

export const PROMPT_OUTCOMES = [
  'created',
  'saved',
  'activated',
  'archived',
  'locked',
  'duplicate',
  'conflict',
  'invalid',
  'forbidden',
  'notfound',
  'ratelimited',
  'failed',
  'auditMissing',
] as const

export type PromptOutcome = (typeof PROMPT_OUTCOMES)[number]

export function isPromptOutcome(value: string): value is PromptOutcome {
  return (PROMPT_OUTCOMES as readonly string[]).includes(value)
}

/** `path?result=activated&pf=briefing.compose&pv=4` — where an action lands. */
export function withOutcome(
  path: string,
  outcome: PromptOutcome,
  reference: { feature?: string | null; version?: number | null } = {},
): string {
  const query = new URLSearchParams()
  query.set(RESULT_PARAMS.outcome, outcome)
  const feature = reference.feature ?? null
  if (feature !== null && feature !== '') {
    query.set(RESULT_PARAMS.feature, feature.slice(0, FEATURE_MAX))
  }
  const version = reference.version ?? null
  if (version !== null && Number.isSafeInteger(version) && version > 0) {
    query.set(RESULT_PARAMS.version, String(version))
  }
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
 * A feature name is an identifier the company chose, so the charset is the
 * name's own. `_` is a single-character wildcard in `LIKE`, which makes the
 * prefix match slightly broader than typed — harmless over a namespace nobody
 * outside the company writes, and the alternative is refusing to search for
 * half the real names.
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
 * `?result=activated` into a page link would re-announce an activation every
 * time somebody turned a page.
 */
export function withoutResultParams(query: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (
      key === RESULT_PARAMS.outcome ||
      key === RESULT_PARAMS.feature ||
      key === RESULT_PARAMS.version
    ) {
      continue
    }
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

export interface PromptListParams {
  readonly feature: string | null
  readonly status: PromptStatusValue | null
  /** A feature-name prefix, or null when the parameter was absent. */
  readonly search: string | null
  /** True when something was typed that cannot be a name: the screen says so. */
  readonly searchRejected: boolean
  readonly page: number
}

export function parsePromptListParams(
  params: Record<string, string | string[] | undefined>,
): PromptListParams {
  const featureRaw = firstParam(params, LIST_PARAMS.feature).toLowerCase()
  const statusRaw = firstParam(params, LIST_PARAMS.status)
  const searchRaw = firstParam(params, LIST_PARAMS.q).toLowerCase()
  const pageRaw = Number(firstParam(params, LIST_PARAMS.page))

  return {
    feature: isFeatureName(featureRaw) ? featureRaw : null,
    status: isPromptStatus(statusRaw) ? statusRaw : null,
    search: isSearchable(searchRaw) ? searchRaw : null,
    searchRejected: searchRaw !== '' && !isSearchable(searchRaw),
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1,
  }
}

/** The same values back as strings, for `Filters` and for link building. */
export function promptListParamValues(params: PromptListParams): Record<string, string> {
  return {
    [LIST_PARAMS.feature]: params.feature ?? '',
    [LIST_PARAMS.status]: params.status ?? '',
    [LIST_PARAMS.q]: params.search ?? '',
    [LIST_PARAMS.page]: params.page > 1 ? String(params.page) : '',
  }
}

export function isFiltered(params: PromptListParams): boolean {
  return params.feature !== null || params.status !== null || params.search !== null
}

/** A feature name in the shape the column's own CHECK constraint demands. */
export function isFeatureName(value: string): boolean {
  return value.length > 0 && value.length <= FEATURE_MAX && FEATURE_PATTERN.test(value)
}

// ===========================================================================
// The comparison a version is read against
// ===========================================================================

/**
 * Which version a diff is taken against.
 *
 * `active` is the one that matters: nobody should activate a prompt they have
 * not compared with what is serving today. `previous` is what the currently
 * active version itself is read against — comparing it with itself would show
 * nothing — and `none` is the honest answer for the first version of a feature.
 */
export type DiffBaselineKind = 'active' | 'previous' | 'none'

/** The two things choosing a baseline needs to know about a version. */
export interface VersionRef {
  readonly id: string
}

export interface DiffBaseline<T extends VersionRef> {
  readonly kind: DiffBaselineKind
  /** The version the diff is taken against, or null when there is none. */
  readonly baseline: T | null
}

/**
 * Which version this one is read against.
 *
 * Expressed over the two candidates rather than over two queries, so the rule
 * the detail page's heading states is a function with a name:
 *
 *   - a draft or an archived version is read against the **active** version —
 *     "what would change if I pressed the button";
 *   - the active version is read against the **previous** one, because
 *     comparing it with itself would show nothing and what matters then is what
 *     changed when it went live;
 *   - the first version of a feature has no baseline, and `none` is what says
 *     so — an empty diff would read as "no changes", which is a different and
 *     much more dangerous claim.
 */
export function chooseDiffBaseline<T extends VersionRef>(
  record: VersionRef,
  active: T | null,
  previous: T | null,
): DiffBaseline<T> {
  if (active !== null && active.id !== record.id) return { kind: 'active', baseline: active }
  return { kind: previous === null ? 'none' : 'previous', baseline: previous }
}

/** A short label for a version, used in headings and in the diff's column heads. */
export function versionLabel(version: number): string {
  return `v${version}`
}

/** `briefing.compose · v4`, the way a version is named everywhere on screen. */
export function versionReference(feature: string, version: number): string {
  return `${feature} · ${versionLabel(version)}`
}
