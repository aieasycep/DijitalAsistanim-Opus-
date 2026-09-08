import {
  APPROVAL_ACTION_TYPES,
  SOURCE_TYPES,
  type ApprovalActionType,
  type SourceType,
} from '@da/domain'

/**
 * The wire contract between the approvals routes, their forms and their Server
 * Actions.
 *
 * A `'use server'` module may export nothing but async functions, and a client
 * form cannot import from one without dragging the action's module graph — and
 * therefore `@/lib/db` and the service-role key — across the client boundary.
 * So every name the two sides have to agree on lives here, in a plain module
 * both may import: form field names, query parameters, the redirect allowlist
 * and the audit action tokens.
 *
 * Nothing in this file is content. The subject of a staff action in this area is
 * an action *type* (`email_send`) or a failure *code* (`smtp_rejected`) — a
 * class of approvals, never one approval and never one user.
 */

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** The oversight dashboard. */
export const APPROVALS_PATH = '/approvals'
/** The failure queue, where a failure code links to. */
export const APPROVALS_FAILURES_PATH = '/approvals/failures'

/** The redirect allowlist for every Server Action in this area. */
export const APPROVAL_RETURN_PATHS = [APPROVALS_PATH, APPROVALS_FAILURES_PATH] as const
export type ApprovalReturnPath = (typeof APPROVAL_RETURN_PATHS)[number]

/**
 * The user detail page, from the route contract the nav already publishes. An
 * approval row identifies its user by uuid and nothing else, so this is the only
 * way an operator can get from a stuck approval to the account behind it.
 */
export function userDetailHref(userId: string): string {
  return `/users/${userId}`
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/**
 * Filters and paging. The URL is the whole state of both pages: a filtered view
 * is a link an operator can paste to a colleague and get the same rows, and
 * every control is a server-side re-query rather than a client-side filter over
 * rows that were already fetched.
 */
export const APPROVAL_PARAMS = {
  window: 'pencere',
  type: 'tur',
  source: 'kaynak',
  code: 'kod',
  page: 'sayfa',
} as const

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

/**
 * How far back an aggregate reaches, keyed by the token that appears in the URL.
 *
 * Every window is a whole number of days so the previous-period comparison is
 * exactly the same length as the current one — a rejection rate compared against
 * a shorter period is not a comparison.
 */
export const APPROVAL_WINDOW_DAYS = {
  '7g': 7,
  '30g': 30,
  '90g': 90,
} as const

export type ApprovalWindowKey = keyof typeof APPROVAL_WINDOW_DAYS

export const DEFAULT_APPROVAL_WINDOW: ApprovalWindowKey = '30g'

export const APPROVAL_WINDOW_KEYS = ['7g', '30g', '90g'] as const

export function isApprovalWindowKey(value: string): value is ApprovalWindowKey {
  return Object.prototype.hasOwnProperty.call(APPROVAL_WINDOW_DAYS, value)
}

// ---------------------------------------------------------------------------
// Enum guards
//
// `searchParams` is attacker-controlled, so a value that will end up in an `eq`
// filter is checked against the enum from @da/domain rather than trusted. An
// unknown type or source is dropped, not passed through.
// ---------------------------------------------------------------------------

export function isApprovalActionType(value: string): value is ApprovalActionType {
  return (APPROVAL_ACTION_TYPES as readonly string[]).includes(value)
}

export function isSourceType(value: string): value is SourceType {
  return (SOURCE_TYPES as readonly string[]).includes(value)
}

/**
 * The shape a failure code may have.
 *
 * `bo_error_code()` in migration 0017 already refuses to emit anything that is
 * not a token — it returns the literal `unstructured` instead — so this mirrors
 * that guarantee on the way back in, for a code arriving from a URL or a form.
 * A value that fails it is dropped rather than sanitised.
 */
const FAILURE_CODE_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i

export function isFailureCode(value: string): boolean {
  return FAILURE_CODE_PATTERN.test(value)
}

// ---------------------------------------------------------------------------
// Staff actions
// ---------------------------------------------------------------------------

/**
 * What an operator can record here.
 *
 * The approvals area has no button that touches an approval, and that is a
 * design decision rather than a gap. Executing one means sending the mail the
 * user drafted; the retry path for that is `approval-retry`, which requires the
 * *user's* own token by design, and the maintenance sweep is `CRON_SECRET`-gated
 * — neither credential is one the backoffice holds. So what staff can do with
 * what they see here is record a finding against it, and that record is a real,
 * durable artefact: an `audit_logs` row that `/denetim` renders, naming who
 * looked, at which action type or failure code, over which window, at what
 * measured rate, and why.
 */
export const REVIEW_SCOPES = ['type', 'code'] as const
export type ReviewScope = (typeof REVIEW_SCOPES)[number]

export function isReviewScope(value: string): value is ReviewScope {
  return (REVIEW_SCOPES as readonly string[]).includes(value)
}

/** The audit action token each scope writes. Both match `bo_identifier`'s shape. */
export const REVIEW_AUDIT_ACTIONS: Readonly<Record<ReviewScope, string>> = {
  type: 'approval.rejection_reviewed',
  code: 'approval.failure_triaged',
}

/** The `entity_type` each scope records, so `/denetim` can group them. */
export const REVIEW_ENTITY_TYPES: Readonly<Record<ReviewScope, string>> = {
  type: 'approval_action_type',
  code: 'approval_failure_code',
}

/** Fields the review form posts. */
export const REVIEW_FIELDS = {
  scope: 'kapsam',
  subject: 'konu',
  window: 'pencere',
  /** The number being reviewed: a rate in basis points, or an occurrence count. */
  measure: 'olcum',
  /** What that number was measured against. */
  sample: 'ornek',
  reason: 'gerekce',
  returnTo: 'donus',
} as const

/** Fields the refresh form posts. */
export const REFRESH_FIELDS = {
  returnTo: 'donus',
} as const

/** What a staff action reports back through the URL. Codes and tokens only. */
export const APPROVAL_RESULT_PARAMS = {
  outcome: 'sonuc',
  subject: 'sonucKonu',
} as const

export const REVIEW_OUTCOMES = ['recorded', 'invalid', 'forbidden', 'failed'] as const
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number]

export function isReviewOutcome(value: string): value is ReviewOutcome {
  return (REVIEW_OUTCOMES as readonly string[]).includes(value)
}

/**
 * Reason bounds, mirroring `isValidReason` in `@/lib/audit`.
 *
 * Repeated here rather than imported because `@/lib/audit` is `server-only` and
 * the form that enforces them in the browser is a client component. The server
 * re-checks with the real function, so this pair is a courtesy to the operator,
 * never the gate.
 */
export const MIN_REASON_LENGTH = 3
export const MAX_REASON_LENGTH = 280

/** A rate is carried through the URL and into the audit row as basis points. */
export const RATE_BASIS_POINTS = 10_000

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

/** Rows in the dashboard's short queue preview. */
export const QUEUE_PREVIEW_SIZE = 8
/** Rows per page in the full failure queue. */
export const FAILURE_PAGE_SIZE = 25
/** Failure codes shown on the dashboard, and on the failures page. */
export const DASHBOARD_CODE_LIMIT = 5
export const FAILURE_CODE_LIMIT = 12
