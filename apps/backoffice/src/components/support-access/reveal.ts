import { DAY_MS } from '@da/domain'
// Type-only, and deliberately so: `@/lib/db` is `server-only`, and the row
// shapes are the `returns table (…)` clauses of the eight `sa_reveal_*`
// functions. Re-declaring them here would be a second description of one
// database contract, and the two would drift on the first migration.
import type {
  RevealApprovalRow,
  RevealAssistantMessageRow,
  RevealCalendarEventRow,
  RevealCaptureRow,
  RevealEmailMessageRow,
  RevealEmailSubjectRow,
  RevealIdentityRow,
  RevealNotificationRow,
} from '@/lib/db'
import { istanbulDayEnd, istanbulDayStart } from '@/lib/format'
import type { AdminPermission } from '@/lib/permissions'
import {
  SCOPE_SENSITIVITY_ORDER,
  evaluateReveal,
  grantMinutesRemaining,
  isSupportAccessScope,
  type RevealDenialReason,
  type SupportAccessScope,
} from '@/lib/redact'
import { toGrantSnapshot, type GrantRowShape } from './contract'

/**
 * The reveal console's contract, and the decisions it makes before it asks the
 * database anything.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DECIDED HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------
 *
 * Nothing here authorises a reveal. `sa_assert_grant()` does that, in the same
 * statement that returns the data, and it is re-checked a third time by the
 * trigger on `support_access_reveals`. The Server Action does not repeat those
 * six checks: it calls the function and renders whatever refusal comes back.
 *
 * What is decided here is **which controls the screen draws**. A grant covers
 * specific scopes, and a scope it does not cover must not appear as a button
 * that posts a form the database will refuse — that is a dead control wearing a
 * live one's clothes. So the same guard the reveal path uses, `evaluateReveal`
 * from `redact.ts`, is asked once per scope while the page renders, and only
 * the scopes it allows are offered. The guard is the same one either way; this
 * module simply asks it eight times instead of once.
 *
 * ---------------------------------------------------------------------------
 * THE TWO BOUNDS THAT ARE THE CONSOLE'S OWN
 * ---------------------------------------------------------------------------
 *
 * `clampRevealLimit` mirrors what `sa_reveal_email_subjects` already does to
 * `p_limit`, so the number on the form is the number that will be read.
 *
 * `MAX_REVEAL_RANGE_DAYS` mirrors nothing: the calendar function accepts any
 * range, and one call over five years opens five years of somebody's diary and
 * logs it as a single reveal. The ceiling is a decision this console makes, and
 * it is stated on the form rather than discovered by a refusal.
 */

// ===========================================================================
// What each scope needs from the operator
// ===========================================================================

export type RevealInputKind =
  /** `sa_reveal_identity` takes the grant and nothing else. */
  | 'none'
  /** One record, named by its uuid. */
  | 'record'
  /** A bounded listing — email subjects, newest first. */
  | 'listing'
  /** A date range — calendar events. */
  | 'range'

/**
 * One kind per scope, from the signatures in 0019. This is what makes the form
 * a function of the chosen scope rather than eight hand-written forms that
 * could each be wrong in their own way.
 */
export const SCOPE_INPUT_KIND: Readonly<Record<SupportAccessScope, RevealInputKind>> =
  Object.freeze({
    identity: 'none',
    email_subject: 'listing',
    email_body: 'record',
    calendar_detail: 'range',
    assistant_conversation: 'record',
    capture_content: 'record',
    approval_payload: 'record',
    notification_content: 'record',
  })

// ===========================================================================
// Bounds
// ===========================================================================

/** `sa_reveal_email_subjects` clamps `p_limit` to this. So does the form. */
export const MAX_REVEAL_LISTING_LIMIT = 200
/** Deliberately below the function's own default of 50: narrowest first. */
export const DEFAULT_REVEAL_LISTING_LIMIT = 25

export const REVEAL_LISTING_LIMIT_OPTIONS: readonly number[] = Object.freeze([
  10,
  DEFAULT_REVEAL_LISTING_LIMIT,
  50,
  100,
  MAX_REVEAL_LISTING_LIMIT,
])

/**
 * A requested listing size, brought inside the range the function will honour.
 *
 * Every wrong answer is a *smaller* listing, never a larger one: past the
 * ceiling comes back at the ceiling, a fraction is floored, below one becomes
 * one, and something that is not a number falls back to the default rather than
 * to the maximum.
 */
export function clampRevealLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_REVEAL_LISTING_LIMIT
  const whole = Math.floor(limit)
  if (whole < 1) return 1
  return Math.min(whole, MAX_REVEAL_LISTING_LIMIT)
}

/**
 * How much diary one reveal may open.
 *
 * `sa_reveal_calendar_events` logs `count(*)` over the range as a single reveal
 * with one `item_count`, so an unbounded range is one audit row for an entire
 * calendar. A month is long enough for "which meeting did the assistant miss"
 * and short enough that the log still says something.
 */
export const MAX_REVEAL_RANGE_DAYS = 31

export type RevealRangeIssue = 'invalid' | 'backwards' | 'too_wide'

export type RevealRange =
  | {
      readonly ok: true
      /** Inclusive lower bound, as `sa_reveal_calendar_events` compares it. */
      readonly from: string
      /** Exclusive upper bound — the function filters `starts_at < p_to`. */
      readonly to: string
      readonly days: number
    }
  | { readonly ok: false; readonly issue: RevealRangeIssue }

/**
 * Two Istanbul calendar days into the instants the function takes.
 *
 * The operator picks days, not instants: an operations screen that asked for
 * UTC timestamps would be answered wrongly by everybody in the office. The
 * closing day is included in full, which is why the exclusive bound is the
 * millisecond after its last one.
 */
export function resolveRevealRange(from: string, to: string): RevealRange {
  const start = istanbulDayStart(from)
  const closing = istanbulDayEnd(to)
  if (start === null || closing === null) return { ok: false, issue: 'invalid' }
  if (closing.getTime() < start.getTime()) return { ok: false, issue: 'backwards' }

  const end = new Date(closing.getTime() + 1)
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS)
  if (days > MAX_REVEAL_RANGE_DAYS) return { ok: false, issue: 'too_wide' }

  return { ok: true, from: start.toISOString(), to: end.toISOString(), days }
}

// ===========================================================================
// What this operator may spend, right now
// ===========================================================================

export interface RevealAvailabilityQuery {
  /** The grant row as `bo_support_access_grants` returns it. */
  readonly row: GrantRowShape
  /** The signed-in operator, as `admin_users.id`. */
  readonly viewerAdminUserId: string
  /** Their effective permissions, from `admin_permissions_for()`. */
  readonly permissions: ReadonlySet<AdminPermission>
  readonly now: Date
}

export type RevealAvailability =
  | {
      readonly permitted: true
      /** Least revealing first, and never wider than the grant's own list. */
      readonly scopes: readonly SupportAccessScope[]
      readonly minutesRemaining: number
    }
  | {
      readonly permitted: false
      /** Which of the five checks refused. Drives the sentence on screen. */
      readonly reason: RevealDenialReason
      readonly minutesRemaining: number
    }

/**
 * Which of the eight scopes this operator may open under this grant, now.
 *
 * The answer is produced by asking `evaluateReveal` — the same guard the reveal
 * path itself passes through — once per scope, so a control is drawn only where
 * a reveal would actually be allowed. An expired grant, a grant belonging to
 * somebody else and a role that has lost `support.access.reveal` all come back
 * as a refusal with a reason rather than as an empty list, because "no scopes"
 * and "not your grant" are different things to tell an operator at 02:00.
 */
export function revealAvailability(query: RevealAvailabilityQuery): RevealAvailability {
  const grant = toGrantSnapshot(query.row)
  const minutesRemaining = grantMinutesRemaining(grant, query.now)

  const ask = (scope: SupportAccessScope) =>
    evaluateReveal({
      grant,
      adminUserId: query.viewerAdminUserId,
      // This screen is about the grant's own subject, so `wrong_subject` cannot
      // fire here. That check exists for a caller carrying a subject from
      // somewhere else — a user page reaching for a grant over another account.
      subjectUserId: grant.subjectUserId,
      scope,
      permissions: query.permissions,
      now: query.now,
    })

  const scopes = SCOPE_SENSITIVITY_ORDER.filter((scope) => ask(scope).allowed)
  if (scopes.length > 0) return { permitted: true, scopes, minutesRemaining }

  // Nothing may be spent, so name the rule that refused rather than showing an
  // empty list. Asked against a scope the grant actually carries, so a lapsed
  // grant does not report `scope_denied`; a grant whose stored scopes were all
  // unrecognised carries none, and is correctly refused on the scope. The loop
  // above already asked about this scope, so the answer is a refusal by
  // construction — the fallback only keeps the type total.
  const named: SupportAccessScope = grant.scopes[0] ?? 'identity'
  const decision = ask(named)
  return {
    permitted: false,
    reason: decision.allowed ? 'scope_denied' : decision.reason,
    minutesRemaining,
  }
}

export interface RevealScopeSelection {
  /** The scope the form should render, or null when none was chosen. */
  readonly scope: SupportAccessScope | null
  /** True when a scope was named on the URL and this grant does not cover it. */
  readonly rejected: boolean
}

/**
 * The scope from the URL, if this grant covers it.
 *
 * A hand-edited `?scope=email_body` on a grant that names only `identity` opens
 * nothing and draws nothing: it is reported as rejected and the screen says the
 * grant's scopes cannot be widened. The database would refuse it too — this is
 * what stops the operator being shown a form whose only possible outcome is a
 * refusal they cannot act on.
 */
export function selectRevealScope(
  raw: string,
  offered: readonly SupportAccessScope[],
): RevealScopeSelection {
  if (raw === '') return { scope: null, rejected: false }
  if (!isSupportAccessScope(raw) || !offered.includes(raw)) {
    return { scope: null, rejected: true }
  }
  return { scope: raw, rejected: false }
}

// ===========================================================================
// What comes back
// ===========================================================================

/**
 * One reveal's rows, tagged with the scope that opened them.
 *
 * A discriminated union rather than a bag of optional arrays: the renderer
 * switches on `scope` and the compiler proves that every member has a branch,
 * so a scope added to the enum cannot reach a screen with nothing to draw it.
 */
export type RevealPayload =
  | { readonly scope: 'identity'; readonly rows: readonly RevealIdentityRow[] }
  | { readonly scope: 'email_subject'; readonly rows: readonly RevealEmailSubjectRow[] }
  | { readonly scope: 'email_body'; readonly rows: readonly RevealEmailMessageRow[] }
  | { readonly scope: 'calendar_detail'; readonly rows: readonly RevealCalendarEventRow[] }
  | {
      readonly scope: 'assistant_conversation'
      readonly rows: readonly RevealAssistantMessageRow[]
    }
  | { readonly scope: 'capture_content'; readonly rows: readonly RevealCaptureRow[] }
  | { readonly scope: 'approval_payload'; readonly rows: readonly RevealApprovalRow[] }
  | { readonly scope: 'notification_content'; readonly rows: readonly RevealNotificationRow[] }

/** The fields the reveal form posts. */
export const REVEAL_FIELDS = {
  grantId: 'grantId',
  scope: 'scope',
  recordId: 'recordId',
  limit: 'limit',
  from: 'from',
  to: 'to',
} as const

/**
 * What `revealAction` hands back to its form.
 *
 * The rows travel in the action's response and never through the URL: a query
 * string is written to the browser's history, the server log and the referrer
 * header, and none of those is a place a stranger's mail belongs.
 */
export interface RevealFormState {
  readonly status: 'idle' | 'revealed' | 'error'
  /** Which rule refused, in Turkish. Null while nothing has gone wrong. */
  readonly message: string | null
  /** Field name from `REVEAL_FIELDS` to Turkish message. */
  readonly issues: Readonly<Record<string, string>>
  /** What the database returned, or null when nothing was opened. */
  readonly payload: RevealPayload | null
  /** Correlates this render with the reveal row and the audit row. */
  readonly requestId: string | null
  /** When the reveal happened, from the action's injected clock. */
  readonly revealedAt: string | null
}

export const initialRevealFormState: RevealFormState = {
  status: 'idle',
  message: null,
  issues: {},
  payload: null,
  requestId: null,
  revealedAt: null,
}
