/**
 * The wire contract for the audit area: routes, query parameters, the filter
 * vocabulary, the keyset cursor codec and the two staff actions.
 *
 * A `'use server'` module may export nothing but async functions, and a client
 * component must not import from one, so every string the pages, the forms and
 * the Server Actions have to agree on lives here — a plain module either side
 * may import. Getting one wrong is then a type error rather than a form that
 * posts a field nobody reads.
 *
 * Nothing in this file names a content column, and nothing it defines can carry
 * one: the filter vocabulary is a closed set of tokens, the cursor is a
 * timestamp plus a uuid, and the audit action tokens are all shaped so
 * `bo_identifier()` passes them through unchanged.
 */

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** The trail itself: filtered, keyset-paginated rows. */
export const AUDIT_PATH = '/audit'

/** The distribution: an exact count(*) per action over the same range. */
export const AUDIT_ACTIONS_PATH = '/audit/actions'

/** Redirect allowlist for every Server Action in this area. */
export const AUDIT_RETURN_PATHS = [AUDIT_PATH, AUDIT_ACTIONS_PATH] as const

export type AuditReturnPath = (typeof AUDIT_RETURN_PATHS)[number]

export function isAuditReturnPath(value: string): value is AuditReturnPath {
  return (AUDIT_RETURN_PATHS as readonly string[]).includes(value)
}

export function userDetailHref(userId: string): string {
  return `/users/${userId}`
}

// ---------------------------------------------------------------------------
// Query parameters
//
// Turkish, like every other URL in this console, so a link an operator pastes
// into a ticket reads as a sentence rather than as an internal identifier.
// ---------------------------------------------------------------------------

export const LOG_PARAMS = {
  actor: 'aktor',
  action: 'eylem',
  outcome: 'sonuc',
  user: 'kullanici',
  from: 'bas',
  to: 'bit',
  cursor: 'imlec',
  direction: 'yon',
  /** The entry whose review panel is open. */
  review: 'inceleme',
} as const

/** Parameters a filter change clears: a cursor into the old result set is meaningless. */
export const RESET_PARAMS = [LOG_PARAMS.cursor, LOG_PARAMS.direction, LOG_PARAMS.review] as const

/** What a Server Action reports back through the URL. */
export const RESULT_PARAMS = {
  outcome: 'islemSonucu',
  entry: 'islemKaydi',
} as const

// ---------------------------------------------------------------------------
// Actor
//
// `bo_audit.actor` is `metadata ->> 'actor'` passed through `bo_identifier()`.
// The backoffice writes 'staff' on every staff action and 'system' on a refused
// sign-in; the product's edge functions write no actor key at all, so their
// rows arrive with a null actor. These four buckets are therefore the honest
// partition of what the column actually holds, and the fifth — a value none of
// this codebase writes — is reported as a derived remainder rather than
// pretended away.
// ---------------------------------------------------------------------------

export const ACTOR_BUCKETS = ['ekip', 'sistem', 'kullanici', 'isaretsiz'] as const
export type ActorBucket = (typeof ACTOR_BUCKETS)[number]

export function isActorBucket(value: string): value is ActorBucket {
  return (ACTOR_BUCKETS as readonly string[]).includes(value)
}

/** The `metadata ->> 'actor'` value each bucket selects; null means "no key". */
export const ACTOR_BUCKET_VALUE: Readonly<Record<ActorBucket, string | null>> = {
  ekip: 'staff',
  sistem: 'system',
  kullanici: 'user',
  isaretsiz: null,
}

/** The bucket a row belongs to, for rendering its badge. */
export function actorBucketOf(actor: string | null): ActorBucket | 'diger' {
  switch (actor) {
    case 'staff':
      return 'ekip'
    case 'system':
      return 'sistem'
    case 'user':
      return 'kullanici'
    case null:
      return 'isaretsiz'
    default:
      return 'diger'
  }
}

// ---------------------------------------------------------------------------
// Outcome
//
// `outcome` is open at the database level — it is whatever token the writer
// put in `metadata ->> 'outcome'`. These three buckets are mutually exclusive
// and cover every row: equal to 'success', a non-null value that is not
// 'success', or no key at all. `neq` in PostgREST is `<> 'success'`, which is
// NULL for a missing key and therefore excludes it, so the three partition the
// table exactly and their counts sum to the total.
// ---------------------------------------------------------------------------

export const OUTCOME_BUCKETS = ['basarili', 'hata', 'belirtilmemis'] as const
export type OutcomeBucket = (typeof OUTCOME_BUCKETS)[number]

export function isOutcomeBucket(value: string): value is OutcomeBucket {
  return (OUTCOME_BUCKETS as readonly string[]).includes(value)
}

export const SUCCESS_OUTCOME = 'success'

// ---------------------------------------------------------------------------
// Range
//
// Calendar days in Europe/Istanbul, not rolling hours: an operator reading a
// trail thinks in days, and a day boundary is the only cut two people looking
// at the same screen will agree on. Both ends are inclusive dates; the query
// turns them into a half-open instant range.
// ---------------------------------------------------------------------------

export const RANGE_PRESETS = ['bugun', '7g', '30g', '90g', '400g'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

export function isRangePreset(value: string): value is RangePreset {
  return (RANGE_PRESETS as readonly string[]).includes(value)
}

/** How many calendar days each preset spans, counting today as day one. */
export const RANGE_PRESET_DAYS: Readonly<Record<RangePreset, number>> = {
  bugun: 1,
  '7g': 7,
  '30g': 30,
  '90g': 90,
  '400g': 400,
}

export const DEFAULT_RANGE_PRESET: RangePreset = '30g'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(parsed)
}

// ---------------------------------------------------------------------------
// Keyset cursor
//
// `audit_logs` is the one table in this schema that only ever grows, so it is
// the one place an OFFSET pager would eventually stop working: page 400 of an
// offset scan makes Postgres walk and discard 20 000 rows on every click, and
// a row written between two clicks shifts every later page by one. The cursor
// below is the row itself — its `created_at` and its `audit_id` — so a page is
// "the rows after this exact row", which costs the same at page 400 as at page
// one and cannot skip or repeat a row while the table is being written to.
//
// The uuid is not decoration. Two audit rows written inside one transaction
// share a `created_at` to the microsecond, so a cursor of a timestamp alone
// would either drop the rest of that transaction or replay it forever.
// ---------------------------------------------------------------------------

export interface AuditCursor {
  /** `created_at` of the row the page starts after. */
  at: string
  /** `audit_id` of that row, breaking ties inside one timestamp. */
  id: string
}

const CURSOR_SEPARATOR = '~'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function encodeCursor(cursor: AuditCursor): string {
  return `${cursor.at}${CURSOR_SEPARATOR}${cursor.id}`
}

/** Null for anything that is not a timestamp and a uuid, so a crafted URL simply pages from the top. */
export function decodeCursor(raw: string | null): AuditCursor | null {
  if (raw === null || raw === '') return null
  const index = raw.lastIndexOf(CURSOR_SEPARATOR)
  if (index <= 0) return null
  const at = raw.slice(0, index)
  const id = raw.slice(index + 1)
  if (!UUID_RE.test(id)) return null
  if (!Number.isFinite(Date.parse(at))) return null
  return { at, id }
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/** Older (down the page) or newer (back up it). */
export const PAGE_DIRECTIONS = ['ileri', 'geri'] as const
export type PageDirection = (typeof PAGE_DIRECTIONS)[number]

export function isPageDirection(value: string): value is PageDirection {
  return (PAGE_DIRECTIONS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

/** Rows per keyset page. */
export const LOG_PAGE_SIZE = 50

/** Review notes shown against one entry. */
export const ENTRY_REVIEW_LIMIT = 10

/**
 * Rows read to discover which action tokens actually occur in the range.
 *
 * PostgREST cannot express `select distinct`, and the action vocabulary is open
 * at the database level — an edge function deployed after this file was written
 * can invent a token. So the breakdown counts the canonical list plus whatever
 * this bounded newest-first read turns up, and prints the remainder (total
 * minus the sum of the counted actions) so a token neither list knows about is
 * still visible as a number rather than silently missing.
 *
 * Only the `action` column crosses the wire, and it has already passed through
 * `bo_identifier()` in the view.
 */
export const ACTION_DISCOVERY_LIMIT = 400

/** Upper bound on how many actions the breakdown will count exactly. */
export const ACTION_COUNT_LIMIT = 64

/** Concurrent count queries. Bounded so a breakdown never bursts the pool. */
export const QUERY_POOL_SIZE = 6

// ---------------------------------------------------------------------------
// Retention
//
// 0012's `cleanup_expired_retention()` keeps every audit row forever but nulls
// `entity_id` and empties `metadata` once the row is older than 400 days. The
// number is not repeated here: `@da/domain`'s RETENTION_SWEEP is what the job
// and the privacy screen both read, and the audit page reads the same entry, so
// the figure on screen cannot drift from the one Postgres enforces.
//
// The sweep is scheduled in 0014 at `15 3 * * *` UTC.
// ---------------------------------------------------------------------------

export const SWEEP_HOUR_UTC = 3
export const SWEEP_MINUTE_UTC = 15

/** The audit action the sweep itself writes, and how the page proves it ran. */
export const SWEEP_ACTION = 'retention.swept'

// ---------------------------------------------------------------------------
// The two staff actions this area exposes
// ---------------------------------------------------------------------------

/**
 * Filing a review note against one audit entry.
 *
 * The note is itself an `audit_logs` row, which is the whole point: "who looked
 * at this row and what did they conclude" becomes part of the same trail, on
 * the same page, under the same retention rule. Before it existed the trail
 * could record that an account was disconnected but not that anyone had ever
 * read that record.
 */
export const REVIEW_ACTION = 'audit.entry_reviewed'
export const REVIEW_ENTITY_TYPE = 'audit_entry'

export const REVIEW_FIELDS = {
  entryId: 'kayitId',
  returnTo: 'donus',
  reason: 'gerekce',
} as const

/** Fields the refresh form posts. */
export const REFRESH_FIELDS = {
  returnTo: 'donus',
} as const

/** Two review notes by the same operator on the same entry inside this many minutes are one. */
export const REVIEW_DEDUPE_MINUTES = 60

export const REVIEW_OUTCOMES = [
  'isaretlendi',
  'yinelenen',
  'bulunamadi',
  'gecersiz',
  'yetkisiz',
  'basarisiz',
] as const

export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number]

export function isReviewOutcome(value: string): value is ReviewOutcome {
  return (REVIEW_OUTCOMES as readonly string[]).includes(value)
}

export function isReviewFiled(outcome: ReviewOutcome): boolean {
  return outcome === 'isaretlendi'
}

/**
 * Recording that a staff member opened this view.
 *
 * A tool that audits everyone else and not itself is the tool an assessor asks
 * about first. The receipt on the page files one row naming the operator and
 * the exact filter set they were looking at — not on every render, which would
 * bury the trail it is part of, but once per operator per filter set per
 * `ACCESS_DEDUPE_MINUTES`.
 *
 * There is deliberately no reason field: reading the trail is the job, and
 * demanding a written justification for it would only teach operators to type
 * a word to make the box go away.
 */
export const ACCESS_ACTION = 'audit.log_inspected'
export const ACCESS_ENTITY_TYPE = 'audit_scope'
export const ACCESS_REASON = 'Denetim kaydı görüntülendi'
export const ACCESS_DEDUPE_MINUTES = 30

export const ACCESS_OUTCOMES = ['islendi', 'zaten_var', 'basarisiz'] as const
export type AccessOutcome = (typeof ACCESS_OUTCOMES)[number]

/**
 * A token naming the filter set that was on screen, shaped so `bo_identifier()`
 * passes it through the view unchanged: ASCII, no whitespace, no `@`, at most
 * 128 characters. It carries filter values only — an actor bucket, an action
 * token, a date, the first eight characters of a subject user id — so the
 * receipt says what was looked at without becoming a second copy of it.
 */
const SCOPE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/

export function isScopeKey(value: string): boolean {
  return SCOPE_KEY_RE.test(value)
}

export interface ScopeKeyParts {
  actor: ActorBucket | null
  action: string | null
  outcome: OutcomeBucket | null
  /** First eight characters of the subject user id, never the whole one. */
  userPrefix: string | null
  from: string
  to: string
}

export function buildScopeKey(parts: ScopeKeyParts): string {
  const segments = [`f:${parts.from.replaceAll('-', '')}`, `t:${parts.to.replaceAll('-', '')}`]
  if (parts.actor !== null) segments.push(`a:${parts.actor}`)
  if (parts.action !== null) segments.push(`e:${parts.action}`)
  if (parts.outcome !== null) segments.push(`o:${parts.outcome}`)
  if (parts.userPrefix !== null) segments.push(`u:${parts.userPrefix}`)
  const key = segments.join('/').slice(0, 128)
  // Every segment above is already token-shaped, so this only ever guards
  // against a future part being added carelessly.
  return isScopeKey(key) ? key : `f:${parts.from.replaceAll('-', '')}`
}

// ---------------------------------------------------------------------------
// Reason bounds
//
// Repeated from `@/lib/audit` rather than imported, because that module is
// server-only and the form enforcing them lives in the browser. The server
// re-checks with the real `isValidReason`, so this pair is a courtesy to the
// operator and never the actual gate.
// ---------------------------------------------------------------------------

export const MIN_REASON_LENGTH = 3
export const MAX_REASON_LENGTH = 280

// ---------------------------------------------------------------------------
// The action vocabulary
//
// Every token this system is known to write, with the module that writes it.
// The list exists so the filter can offer a menu instead of a text box and so
// the breakdown has something to count; it is never treated as complete. The
// log renders an unknown action verbatim, the filter accepts one from the URL,
// and the breakdown reports the remainder, so a token added tomorrow shows up
// as data rather than as a gap.
// ---------------------------------------------------------------------------

/** Written by the product's edge functions (`supabase/functions/_shared/audit.ts`). */
export const PIPELINE_ACTIONS = [
  'account.connected',
  'account.disconnected',
  'account.scope_granted',
  'account.token_decrypted',
  'account.token_refreshed',
  'account.token_revoked',
  'sync.started',
  'sync.completed',
  'sync.failed',
  'approval.created',
  'approval.approved',
  'approval.rejected',
  'approval.executed',
  'approval.failed',
  'approval.expired',
  'briefing.generated',
  'briefing.skipped',
  'assistant.query',
  'capture.analyzed',
  'notification.sent',
  'subscription.updated',
  'referral.redeemed',
  'referral.rejected',
  'privacy.export_requested',
  'privacy.history_deleted',
  'privacy.account_deleted',
  SWEEP_ACTION,
] as const

/** Written by this console. Each one is a staff member pressing a button. */
export const STAFF_ACTIONS = [
  'staff.signed_in',
  'staff.signed_out',
  'staff.sign_in_denied',
  'sync.resync_requested',
  'approval.rejection_reviewed',
  'approval.failure_triaged',
  'briefing.regenerate_requested',
  'referral.credit_revoke_ordered',
  'privacy.export_rerun_ordered',
  'ai.quota_reviewed',
  REVIEW_ACTION,
  ACCESS_ACTION,
] as const

export const CANONICAL_ACTIONS: readonly string[] = [...PIPELINE_ACTIONS, ...STAFF_ACTIONS]

const STAFF_ACTION_SET: ReadonlySet<string> = new Set<string>(STAFF_ACTIONS)

/** True for an action only this console writes. */
export function isStaffAction(action: string | null): boolean {
  return action !== null && STAFF_ACTION_SET.has(action)
}

/** The part before the first dot: the subsystem the action belongs to. */
export function actionGroup(action: string): string {
  const dot = action.indexOf('.')
  return dot <= 0 ? 'diger' : action.slice(0, dot)
}

/** The order groups appear in on the breakdown: the pipeline first, staff last. */
export const ACTION_GROUP_ORDER: readonly string[] = [
  'account',
  'sync',
  'approval',
  'briefing',
  'assistant',
  'capture',
  'notification',
  'subscription',
  'referral',
  'privacy',
  'retention',
  'ai',
  'staff',
  'audit',
  'diger',
]
