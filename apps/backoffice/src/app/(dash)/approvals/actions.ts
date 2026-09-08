'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  APPROVALS_PATH,
  APPROVAL_RESULT_PARAMS,
  APPROVAL_RETURN_PATHS,
  APPROVAL_WINDOW_DAYS,
  REFRESH_FIELDS,
  REVIEW_AUDIT_ACTIONS,
  REVIEW_ENTITY_TYPES,
  REVIEW_FIELDS,
  isApprovalActionType,
  isApprovalWindowKey,
  isFailureCode,
  type ReviewOutcome,
  type ReviewScope,
} from '@/components/approvals/contract'
import { isValidReason, recordStaffAction, type AuditDetail } from '@/lib/audit'
import { requireStaffAction, type StaffSession } from '@/lib/auth'

/**
 * The Server Actions the approvals area exposes.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE, AND WHY
 * ---------------------------------------------------------------------------
 *
 * There is no action that touches an approval. Executing or retrying one sends
 * the message the user drafted, and the backend agrees: `approval-retry`
 * requires that user's own token, and the expiry-and-retry sweep is behind
 * `CRON_SECRET`. Neither credential is one the backoffice holds, and neither is
 * one it should ask for — a staff button that puts mail in a stranger's outbox
 * is exactly the power this tool exists to demonstrate nobody has.
 *
 * So what staff can do with an approval number is record a finding against it.
 * That is not a gesture: the record is an `audit_logs` row that `/denetim`
 * renders, naming the operator, the action type or failure code, the window, the
 * measured value, and a written reason. It answers "who noticed the rejection
 * rate on email_send doubling, and what did they conclude" — which, before this
 * page existed, nothing in the system could answer.
 *
 * ---------------------------------------------------------------------------
 * WHAT TRAVELS
 * ---------------------------------------------------------------------------
 *
 * The subject of a review is an `approval_action_type` member or a failure code
 * that already passed through `bo_error_code()` in the database. Both are this
 * codebase's own vocabulary, checked against it here rather than trusted from
 * the form, so nothing a user or a provider wrote can reach an audit row through
 * this path. No user id is recorded at all: a review is about a class of
 * approvals, not a person.
 *
 * The redirect target is checked against a two-entry allowlist rather than
 * trusted from the form, so a crafted `donus` field cannot turn a staff button
 * into an open redirect.
 */

/** Only used to parse a relative path; never fetched, never rendered. */
const RELATIVE_BASE = 'https://backoffice.invalid'

export async function recordApprovalReviewAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, REVIEW_FIELDS.returnTo))
  const scopeRaw = field(formData, REVIEW_FIELDS.scope)
  const subjectRaw = field(formData, REVIEW_FIELDS.subject)
  const windowRaw = field(formData, REVIEW_FIELDS.window)
  const measure = wholeNumber(field(formData, REVIEW_FIELDS.measure))
  const sample = wholeNumber(field(formData, REVIEW_FIELDS.sample))
  const reason = String(formData.get(REVIEW_FIELDS.reason) ?? '')

  let session: StaffSession
  try {
    session = await requireStaffAction('ops')
  } catch {
    redirect(withResult(returnTo, 'forbidden', subjectRaw))
  }

  const scope = toScope(scopeRaw, subjectRaw)
  if (
    scope === null ||
    !isApprovalWindowKey(windowRaw) ||
    measure === null ||
    sample === null ||
    !isValidReason(reason)
  ) {
    redirect(withResult(returnTo, 'invalid', subjectRaw))
  }

  const detail: AuditDetail =
    scope === 'type'
      ? {
          scope,
          window: windowRaw,
          window_days: APPROVAL_WINDOW_DAYS[windowRaw],
          // Basis points: an integer crosses a URL and lands in jsonb without a
          // locale deciding where the decimal separator goes.
          rejection_rate_bp: measure,
          decided_count: sample,
        }
      : {
          scope,
          window: windowRaw,
          window_days: APPROVAL_WINDOW_DAYS[windowRaw],
          failure_count: measure,
          exhausted_count: sample,
        }

  try {
    await recordStaffAction({
      actor: { userId: session.userId, role: session.role },
      action: REVIEW_AUDIT_ACTIONS[scope],
      // A review is about a class of approvals. Naming a user here would be
      // both wrong and a privacy regression, so the subject stays null.
      subjectUserId: null,
      entityType: REVIEW_ENTITY_TYPES[scope],
      entityId: subjectRaw,
      reason,
      detail,
    })
  } catch {
    // The trail is the entire effect of this action. If it did not land, nothing
    // happened, and the operator has to be told that rather than reassured.
    redirect(withResult(returnTo, 'failed', subjectRaw))
  }

  revalidatePath(returnTo.pathname)
  redirect(withResult(returnTo, 'recorded', subjectRaw))
}

/** Re-runs every query on the current approvals page. */
export async function refreshApprovalsAction(formData: FormData): Promise<void> {
  await requireStaffAction('ops')
  const returnTo = safeReturnTo(field(formData, REFRESH_FIELDS.returnTo))
  revalidatePath(returnTo.pathname)
  redirect(`${returnTo.pathname}${returnTo.search}`)
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim()
}

/** A non-negative integer, or null for anything else. */
function wholeNumber(raw: string): number | null {
  if (!/^\d{1,12}$/.test(raw)) return null
  const value = Number.parseInt(raw, 10)
  return Number.isSafeInteger(value) ? value : null
}

/**
 * The scope, only if its subject is valid for it.
 *
 * A type must be a member of `approval_action_type`; a code must have the token
 * shape `bo_error_code()` guarantees on the way out of the database. Anything
 * else is refused rather than cleaned up, because a "sanitised" subject is a
 * subject nobody chose.
 */
function toScope(scope: string, subject: string): ReviewScope | null {
  if (scope === 'type') return isApprovalActionType(subject) ? 'type' : null
  if (scope === 'code') return isFailureCode(subject) ? 'code' : null
  return null
}

// ---------------------------------------------------------------------------
// Redirect targets
// ---------------------------------------------------------------------------

/**
 * The posted return path, if it is one of ours; the dashboard otherwise.
 *
 * Parsing against a fixed base means an absolute URL to another host lands on a
 * different origin and is rejected, and a path this area does not own is
 * rejected by the allowlist. Any previous result parameters are stripped so a
 * second action cannot stack its answer on top of the first one's.
 */
function safeReturnTo(raw: string): URL {
  const fallback = new URL(APPROVALS_PATH, RELATIVE_BASE)
  if (raw === '') return fallback

  let url: URL
  try {
    url = new URL(raw, RELATIVE_BASE)
  } catch {
    return fallback
  }

  if (url.origin !== RELATIVE_BASE) return fallback
  if (!(APPROVAL_RETURN_PATHS as readonly string[]).includes(url.pathname)) return fallback

  for (const param of Object.values(APPROVAL_RESULT_PARAMS)) url.searchParams.delete(param)
  return url
}

function withResult(returnTo: URL, outcome: ReviewOutcome, subject: string): string {
  const url = new URL(returnTo.toString())
  url.searchParams.set(APPROVAL_RESULT_PARAMS.outcome, outcome)
  if (subject !== '') url.searchParams.set(APPROVAL_RESULT_PARAMS.subject, subject.slice(0, 64))
  return `${url.pathname}${url.search}`
}
