'use server'

import { uuidSchema } from '@da/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  PRIVACY_PATH,
  PRIVACY_RESULT_PARAMS,
  PRIVACY_RETURN_PATHS,
  REFRESH_FIELDS,
  RERUN_AUDIT_ACTION,
  RERUN_ENTITY_TYPE,
  RERUN_FIELDS,
  RERUN_DEDUPE_MINUTES,
  isRerunnableStatus,
  type RerunOutcome,
} from '@/components/privacy/contract'
import { daysToDeadline } from '@/components/privacy/deadline'
import { isValidReason, recordStaffAction } from '@/lib/audit'
import { requireStaffAction, type StaffSession } from '@/lib/auth'
import type { BoPrivacyRequestRow } from '@/lib/db'
import { findPrivacyRequest, hasRecentRerunOrder } from '@/lib/queries/privacy'

/**
 * The two Server Actions the privacy area exposes.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE, AND WHY
 * ---------------------------------------------------------------------------
 *
 * There is no delete action. Erasure runs through `delete-account`, which
 * requires the user's own session and the user typing their own address, and
 * which revokes provider tokens, empties both storage buckets and removes the
 * auth row in one irreversible pass. Giving an operator a button for that would
 * mean a support ticket could end someone's account, and no amount of auditing
 * makes that an acceptable capability for a tool whose entire promise is that
 * staff cannot reach into an account.
 *
 * There is also no action that rebuilds an export archive. Building one means
 * reading a user's whole mailbox, calendar, contacts and assistant history into
 * a single file; `data-export-request` does that under the user's own
 * authorisation and nothing else, and the backoffice deliberately holds no
 * credential that would let it stand in for them. A button here that assembled
 * a mailbox would be the single largest breach of the guarantee this tool
 * exists to keep — larger than anything the views were shaped to prevent.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE RE-RUN ORDER ACTUALLY IS
 * ---------------------------------------------------------------------------
 *
 * So the action a stuck export gets is the one a person can legitimately take:
 * an audited instruction that this request needs running again. It writes an
 * `audit_logs` row naming the operator, the request, the user it belongs to,
 * how old it is, how long is left before the statutory deadline, and a written
 * reason. That row is the effect — it is read straight back out of `bo_audit`
 * by the tables on these pages, so a request shows its standing order to the
 * next operator, and `/denetim` shows the same row to whoever audits the audit.
 * Before it existed, "who noticed this export had been stuck for nine days, and
 * what did they do about it" was a question nothing in the system could answer.
 *
 * ---------------------------------------------------------------------------
 * WHAT TRAVELS
 * ---------------------------------------------------------------------------
 *
 * A request id that parsed as a uuid, an operator's own typed reason, and
 * counts. The request's status and failure code are re-read from
 * `bo_privacy_requests` rather than trusted from the form, so the audit row
 * describes what the database says rather than what a posted field claimed. The
 * redirect target is checked against a three-entry allowlist, so a crafted
 * `donus` field cannot turn a staff button into an open redirect.
 */

/** Only used to parse a relative path; never fetched, never rendered. */
const RELATIVE_BASE = 'https://backoffice.invalid'

export async function orderExportRerunAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, RERUN_FIELDS.returnTo))
  const requestIdRaw = field(formData, RERUN_FIELDS.requestId)
  const reason = String(formData.get(RERUN_FIELDS.reason) ?? '')

  let session: StaffSession
  try {
    session = await requireStaffAction('support')
  } catch {
    redirect(withResult(returnTo, 'forbidden', requestIdRaw))
  }

  const requestId = uuidSchema.safeParse(requestIdRaw)
  if (!requestId.success || !isValidReason(reason)) {
    redirect(withResult(returnTo, 'invalid', requestIdRaw))
  }

  // The state that matters is the database's, not the form's: a row that
  // finished while the operator had the page open must not collect an order.
  let request: BoPrivacyRequestRow | null = null
  let lookupFailed = false
  try {
    request = await findPrivacyRequest(requestId.data)
  } catch {
    lookupFailed = true
  }
  if (lookupFailed) redirect(withResult(returnTo, 'failed', requestId.data))
  if (request === null) redirect(withResult(returnTo, 'notfound', requestId.data))
  if (!isRerunnableStatus(request.status)) {
    redirect(withResult(returnTo, 'ineligible', requestId.data))
  }

  // Each order eventually causes a full archive rebuild, so a second operator
  // on the same ticket is told one already stands rather than doubling it. A
  // dedupe check that could not run is treated as a failure: proceeding blind
  // is exactly the case this guard exists for.
  let duplicate = false
  let dedupeFailed = false
  try {
    duplicate = await hasRecentRerunOrder(requestId.data)
  } catch {
    dedupeFailed = true
  }
  if (dedupeFailed) redirect(withResult(returnTo, 'failed', requestId.data))
  if (duplicate) redirect(withResult(returnTo, 'duplicate', requestId.data))

  const remainingDays = daysToDeadline(request.requested_at)

  try {
    await recordStaffAction({
      actor: { userId: session.userId, role: session.role },
      action: RERUN_AUDIT_ACTION,
      subjectUserId: request.user_id,
      entityType: RERUN_ENTITY_TYPE,
      entityId: request.request_id,
      reason,
      detail: {
        request_status: request.status,
        age_hours: request.age_hours,
        // Rounded to whole days and negative once breached, so the trail records
        // how much statutory time was left when the order was given.
        days_to_deadline: Math.trunc(remainingDays),
        overdue: remainingDays <= 0,
        failure_code: request.failure_code,
        has_artifact: request.has_artifact,
        dedupe_window_minutes: RERUN_DEDUPE_MINUTES,
      },
    })
  } catch {
    // The audit row is the entire effect of this action. If it did not land,
    // nothing happened, and the operator has to be told that rather than
    // reassured by a green banner over an order nobody will ever see.
    redirect(withResult(returnTo, 'failed', requestId.data))
  }

  revalidatePath(returnTo.pathname)
  redirect(withResult(returnTo, 'ordered', requestId.data))
}

/** Re-runs every query on the current privacy page, filters intact. */
export async function refreshPrivacyAction(formData: FormData): Promise<void> {
  await requireStaffAction('support')
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

/**
 * The posted return path, if it is one of ours; the dashboard otherwise.
 *
 * Parsing against a fixed base means an absolute URL to another host lands on a
 * different origin and is rejected, and a path this area does not own is
 * rejected by the allowlist. Previous result parameters are stripped so a second
 * action cannot stack its answer on top of the first one's.
 */
function safeReturnTo(raw: string): URL {
  const fallback = new URL(PRIVACY_PATH, RELATIVE_BASE)
  if (raw === '') return fallback

  let url: URL
  try {
    url = new URL(raw, RELATIVE_BASE)
  } catch {
    return fallback
  }

  if (url.origin !== RELATIVE_BASE) return fallback
  if (!(PRIVACY_RETURN_PATHS as readonly string[]).includes(url.pathname)) return fallback

  for (const param of Object.values(PRIVACY_RESULT_PARAMS)) url.searchParams.delete(param)
  return url
}

function withResult(returnTo: URL, outcome: RerunOutcome, requestId: string): string {
  const url = new URL(returnTo.toString())
  url.searchParams.set(PRIVACY_RESULT_PARAMS.outcome, outcome)
  if (requestId !== '') {
    url.searchParams.set(PRIVACY_RESULT_PARAMS.request, requestId.slice(0, 64))
  }
  return `${url.pathname}${url.search}`
}
