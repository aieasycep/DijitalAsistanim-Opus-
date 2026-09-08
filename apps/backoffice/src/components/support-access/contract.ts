import {
  SUPPORT_ACCESS_STATUSES,
  isGrantLive,
  isSupportAccessScope,
  isSupportAccessStatus,
  type GrantSnapshot,
  type SupportAccessScope,
  type SupportAccessStatus,
} from '@/lib/redact'
// The leaf module, not the `@/components/ui` barrel: this file is imported by
// Client Components, and the barrel also re-exports pieces that reach
// `@/lib/db` and its service-role key.
import type { BadgeTone } from '@/components/ui/Badge'
import type { SupportAccessOutcomeKey } from '@/lib/messages/support-access'

/**
 * The wire contract for the Support Access area: routes, query parameters, form
 * field names, the outcome vocabulary and the pure helpers both sides share.
 *
 * A `'use server'` module may export nothing but async functions, and a Client
 * Component must not import one's siblings, so everything the pages, the forms
 * and the Server Actions have to agree on lives here — a plain module either
 * side may import. Getting a field name wrong then fails to compile instead of
 * posting a field nobody reads.
 *
 * Nothing defined here can carry content. The parameters are uuids, enum
 * tokens and small integers; the outcome tokens are a closed set; and the
 * only free text that ever crosses this boundary is an operator's own written
 * reason, which is exactly the thing the audit trail exists to keep.
 */

// ===========================================================================
// Routes
// ===========================================================================

/** Every grant, in every state. The review surface. */
export const SUPPORT_ACCESS_PATH = '/support/access'

/** The request form. Opens nothing; it only asks. */
export const SUPPORT_ACCESS_NEW_PATH = '/support/access/new'

export function grantHref(grantId: string): string {
  return `${SUPPORT_ACCESS_PATH}/${grantId}`
}

/** The user record, which is where an operator should look first. */
export function userHref(userId: string): string {
  return `/users/${userId}`
}

// ===========================================================================
// Query parameters
// ===========================================================================

/** Filters on the list. English, matching the table kit's own parameters. */
export const LIST_PARAMS = {
  status: 'status',
  live: 'live',
  holder: 'holder',
  subject: 'subject',
  page: 'page',
} as const

/** The reveal log's own pager, so it does not fight the grant list's `page`. */
export const REVEAL_PAGE_PARAM = 'reveals'

/**
 * What a Server Action reports back through the URL.
 *
 * One parameter, because every decision returns the operator to the grant they
 * acted on — the record is already identified by the path, so there is nothing
 * for a second parameter to say.
 */
export const RESULT_PARAMS = {
  outcome: 'result',
} as const

/** Pre-fills the request form from a user page. */
export const NEW_SUBJECT_PARAM = 'user'

/** Whose grants the list is showing. */
export const HOLDER_FILTERS = ['mine'] as const
export type HolderFilter = (typeof HOLDER_FILTERS)[number]

export function isHolderFilter(value: string): value is HolderFilter {
  return (HOLDER_FILTERS as readonly string[]).includes(value)
}

export const GRANTS_PAGE_SIZE = 25
export const REVEALS_PAGE_SIZE = 25
export const TRAIL_LIMIT = 25
export const SUBJECT_HISTORY_LIMIT = 5

// ===========================================================================
// Bounds
//
// The request form is a Client Component, so the bounds it renders — the
// reason floor, the window options, the ceiling sentence — have to live
// somewhere both sides can read; a `server-only` module is not that.
//
// They live here, which also makes them the one copy: the request action
// validates against these same constants, so a form that accepted a window the
// server would refuse is not expressible. What a window may be is still
// `support_access_grants_window_is_short`, and what a reason must be is still
// `support_access_grants_reason_is_written`; these mirror those so an operator
// is told before they submit rather than after.
// ===========================================================================

/** `support_access_grants_reason_is_written`: at least twenty characters. */
export const MIN_SUPPORT_ACCESS_REASON = 20
/** Long enough for a paragraph, short enough to read on the approval screen. */
export const MAX_SUPPORT_ACCESS_REASON = 500

/** `support_access_grants_window_is_short`: never more than twenty-four hours. */
export const MAX_SUPPORT_ACCESS_WINDOW_MINUTES = 24 * 60
export const DEFAULT_SUPPORT_ACCESS_WINDOW_MINUTES = 60

/** The windows the request form offers, shortest first. */
export const SUPPORT_ACCESS_WINDOW_OPTIONS: readonly number[] = Object.freeze([
  15,
  30,
  60,
  120,
  240,
  480,
  MAX_SUPPORT_ACCESS_WINDOW_MINUTES,
])

export function isValidSupportAccessReason(reason: string): boolean {
  const trimmed = reason.trim()
  return trimmed.length >= MIN_SUPPORT_ACCESS_REASON && trimmed.length <= MAX_SUPPORT_ACCESS_REASON
}

/**
 * A requested window, brought inside the range the database will accept.
 *
 * Every out-of-range answer is a *shorter* grant, never a longer one: a value
 * past the ceiling comes back at the ceiling, a fraction is floored, anything
 * below a minute becomes one minute, and something that is not a number at all
 * falls back to the default rather than to the maximum. `support_access_grants_
 * window_is_short` refuses the row either way; this exists so a mistyped window
 * is a one-hour grant rather than a refused request an operator retries during
 * an incident.
 */
export function clampWindowMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_SUPPORT_ACCESS_WINDOW_MINUTES
  const whole = Math.floor(minutes)
  if (whole < 1) return 1
  return Math.min(whole, MAX_SUPPORT_ACCESS_WINDOW_MINUTES)
}

export const REASON_HELP_TR = `Gerekçe en az ${MIN_SUPPORT_ACCESS_REASON} karakter olmalıdır: bir denetçinin tartabileceği bir cümle yazın.`

// ===========================================================================
// Form fields
// ===========================================================================

export const REQUEST_FIELDS = {
  subject: 'subjectUserId',
  scope: 'scope',
  reason: 'reason',
  ticket: 'ticketReference',
  window: 'windowMinutes',
} as const

/**
 * The decision forms all post the same three fields.
 *
 * `reason` is spelled exactly as `runAdminAction` reads it — the runner pulls
 * the justification off the parsed input by that name and refuses the action
 * when `admin_sensitive_actions` demands one and it is missing.
 */
export const DECISION_FIELDS = {
  grantId: 'grantId',
  reason: 'reason',
} as const

// ===========================================================================
// The request form's answer
// ===========================================================================

/**
 * What `requestSupportAccessAction` hands back to its form.
 *
 * Field issues are keyed by the form field they belong to, so the message lands
 * under the input that caused it rather than in a banner that says "something
 * was wrong".
 */
export interface RequestFormState {
  readonly status: 'idle' | 'success' | 'error'
  /** Whole-form message: a failure, or the success confirmation. */
  readonly message: string | null
  /** Field name from `REQUEST_FIELDS` to Turkish message. */
  readonly issues: Readonly<Record<string, string>>
  /** The grant that was opened, so the form can link to it. */
  readonly grantId: string | null
}

export const initialRequestFormState: RequestFormState = {
  status: 'idle',
  message: null,
  issues: {},
  grantId: null,
}

// ===========================================================================
// Parsing what arrives on the URL
// ===========================================================================

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isUuidParam(value: string): boolean {
  return UUID_RE.test(value)
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
 * The table's own links are built from this, so sorting or paging never drops a
 * filter the table itself knows nothing about.
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

export interface GrantListParams {
  readonly status: SupportAccessStatus | null
  readonly liveOnly: boolean
  readonly holder: HolderFilter | null
  /** A uuid, or null when the parameter was absent. */
  readonly subject: string | null
  /** True when a subject was supplied but is not a uuid: the screen says so. */
  readonly subjectRejected: boolean
  readonly page: number
}

export function parseGrantListParams(
  params: Record<string, string | string[] | undefined>,
): GrantListParams {
  const statusRaw = firstParam(params, LIST_PARAMS.status)
  const holderRaw = firstParam(params, LIST_PARAMS.holder)
  const subjectRaw = firstParam(params, LIST_PARAMS.subject)
  const pageRaw = Number(firstParam(params, LIST_PARAMS.page))

  return {
    status: isSupportAccessStatus(statusRaw) ? statusRaw : null,
    liveOnly: firstParam(params, LIST_PARAMS.live) === '1',
    holder: isHolderFilter(holderRaw) ? holderRaw : null,
    subject: isUuidParam(subjectRaw) ? subjectRaw : null,
    subjectRejected: subjectRaw !== '' && !isUuidParam(subjectRaw),
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1,
  }
}

/** The same values back as strings, for `Filters` and for link building. */
export function grantListParamValues(params: GrantListParams): Record<string, string> {
  return {
    [LIST_PARAMS.status]: params.status ?? '',
    [LIST_PARAMS.live]: params.liveOnly ? '1' : '',
    [LIST_PARAMS.holder]: params.holder ?? '',
    [LIST_PARAMS.subject]: params.subject ?? '',
    [LIST_PARAMS.page]: params.page > 1 ? String(params.page) : '',
  }
}

export const GRANT_STATUS_OPTIONS: readonly SupportAccessStatus[] = SUPPORT_ACCESS_STATUSES

// ===========================================================================
// Presentation
// ===========================================================================

/**
 * The tone a status wears.
 *
 * `active` is `primary` rather than `success`: a live grant is not good news to
 * be reassured by, it is a capability somebody currently holds over another
 * person's account, and the tile that counts them should read as attention, not
 * as health.
 */
export function grantStatusTone(status: SupportAccessStatus): BadgeTone {
  switch (status) {
    case 'active':
      return 'primary'
    case 'pending_approval':
      return 'warning'
    case 'denied':
      return 'neutral'
    case 'revoked':
      return 'critical'
    case 'expired':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/**
 * The subset of a grant row the pure guards read, from the shape the view
 * returns.
 *
 * `redact.ts` owns `GrantSnapshot` and every decision made on one; this only
 * moves a row into that shape so a page can ask the same question the reveal
 * path asks, against the same injected clock.
 */
export interface GrantRowShape {
  readonly grant_id: string
  readonly admin_user_id: string
  readonly subject_user_id: string
  readonly scopes: readonly string[]
  readonly status: SupportAccessStatus
  readonly granted_at: string | null
  readonly expires_at: string
  readonly revoked_at: string | null
}

export function toGrantSnapshot(row: GrantRowShape): GrantSnapshot {
  return {
    grantId: row.grant_id,
    adminUserId: row.admin_user_id,
    subjectUserId: row.subject_user_id,
    // A member the view produced that is not in the enum is dropped rather than
    // passed along: an unrecognised scope must never widen a grant.
    scopes: row.scopes.filter(isSupportAccessScope),
    status: row.status,
    grantedAt: row.granted_at === null ? null : new Date(row.granted_at),
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
  }
}

/**
 * The status to show, which is not always the status stored.
 *
 * `admin_cleanup_expired()` moves lapsed grants to `expired` on a schedule, so
 * a row can read `active` for a while after its window closed. The timestamps
 * are the truth — that is what `sa_assert_grant()` checks in Postgres — so a
 * lapsed grant is displayed as expired and the screen explains the difference
 * rather than showing a live badge over a dead permission.
 */
export function effectiveStatus(row: GrantRowShape, now: Date): SupportAccessStatus {
  if (row.status !== 'active') return row.status
  return isGrantLive(toGrantSnapshot(row), now) ? 'active' : 'expired'
}

/** True when the stored status and the clock disagree. Drives the note. */
export function isLapsedButUnswept(row: GrantRowShape, now: Date): boolean {
  return row.status === 'active' && !isGrantLive(toGrantSnapshot(row), now)
}

/** Scopes in the enum's declaration order, whatever order they arrived in. */
export function orderedScopes(
  scopes: readonly string[],
  order: readonly SupportAccessScope[],
): readonly SupportAccessScope[] {
  const present = new Set(scopes.filter(isSupportAccessScope))
  return order.filter((scope) => present.has(scope))
}

// ===========================================================================
// Outcomes
// ===========================================================================

const OUTCOME_KEYS = [
  'approved',
  'denied',
  'revoked',
  'fourEyes',
  'liveGrant',
  'ceiling',
  'stale',
  'notfound',
  'invalid',
  'forbidden',
  'ratelimited',
  'failed',
  'auditMissing',
] as const satisfies readonly SupportAccessOutcomeKey[]

export function isOutcomeKey(value: string): value is SupportAccessOutcomeKey {
  return (OUTCOME_KEYS as readonly string[]).includes(value)
}

/** `path?result=approved` — where a decision action sends the operator. */
export function withOutcome(path: string, outcome: SupportAccessOutcomeKey): string {
  const query = new URLSearchParams()
  query.set(RESULT_PARAMS.outcome, outcome)
  return `${path}?${query.toString()}`
}
