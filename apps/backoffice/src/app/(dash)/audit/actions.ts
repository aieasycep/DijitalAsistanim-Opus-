'use server'

import { uuidSchema } from '@da/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  ACCESS_ACTION,
  ACCESS_DEDUPE_MINUTES,
  ACCESS_ENTITY_TYPE,
  ACCESS_REASON,
  AUDIT_PATH,
  AUDIT_RETURN_PATHS,
  REFRESH_FIELDS,
  RESULT_PARAMS,
  REVIEW_ACTION,
  REVIEW_DEDUPE_MINUTES,
  REVIEW_ENTITY_TYPE,
  REVIEW_FIELDS,
  isScopeKey,
  type AccessOutcome,
  type ReviewOutcome,
} from '@/components/audit/contract'
import { isValidReason, recordStaffAction } from '@/lib/audit'
import { requireStaffAction, type StaffSession } from '@/lib/auth'
import type { BoAuditRow } from '@/lib/db'
import { findAuditEntry, hasRecentAccessRecord, hasRecentReview } from '@/lib/queries/audit'

/**
 * The three Server Actions the audit area exposes.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE, AND WHY
 * ---------------------------------------------------------------------------
 *
 * Nothing in this file edits or deletes an audit row, and nothing ever will.
 * `audit_logs` is append-only by design — 0011 grants no update or delete
 * policy on it to any role a person can hold — and a console that could rewrite
 * the record it displays would be worth less than no console at all. The only
 * thing that ever removes information from this table is the nightly retention
 * sweep, which runs on a schedule nobody here can reach.
 *
 * There is also no export button. An audit export is a file of user ids and
 * timestamps leaving the controlled environment, and the moment it exists the
 * guarantee this tool is built on becomes "nobody reads user mail, and also
 * please look after that CSV". An assessor is shown the live page, filtered.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE TWO WRITES ACTUALLY ARE
 * ---------------------------------------------------------------------------
 *
 * Both write one `audit_logs` row and nothing else. That is not a weak effect —
 * on this page it is the whole point. A review note answers "did anyone ever
 * look at this row, and what did they conclude", and an access record answers
 * "who read the trail, and what were they looking for". Neither question was
 * answerable before, and both are the first thing an auditor of the auditors
 * asks.
 *
 * ---------------------------------------------------------------------------
 * WHAT TRAVELS
 * ---------------------------------------------------------------------------
 *
 * An entry id that parsed as a uuid, a filter-set token that matched
 * `bo_identifier()`'s own shape, an operator's typed reason, and codes re-read
 * from the database rather than trusted from the form. The redirect target is
 * checked against a two-entry allowlist, so a crafted `donus` field cannot turn
 * a staff button into an open redirect.
 */

/** Only used to parse a relative path; never fetched, never rendered. */
const RELATIVE_BASE = 'https://backoffice.invalid'

// ===========================================================================
// Filing a review note against one entry
// ===========================================================================

export async function recordEntryReviewAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, REVIEW_FIELDS.returnTo))
  const entryIdRaw = field(formData, REVIEW_FIELDS.entryId)
  const reason = String(formData.get(REVIEW_FIELDS.reason) ?? '')

  let session: StaffSession
  try {
    session = await requireStaffAction('ops')
  } catch {
    redirect(withResult(returnTo, 'yetkisiz', entryIdRaw))
  }

  const entryId = uuidSchema.safeParse(entryIdRaw)
  if (!entryId.success || !isValidReason(reason)) {
    redirect(withResult(returnTo, 'gecersiz', entryIdRaw))
  }

  // The row being reviewed is re-read rather than described by the form, so the
  // note records what the trail says rather than what a posted field claimed.
  let entry: BoAuditRow | null = null
  let lookupFailed = false
  try {
    entry = await findAuditEntry(entryId.data)
  } catch {
    lookupFailed = true
  }
  if (lookupFailed) redirect(withResult(returnTo, 'basarisiz', entryId.data))
  if (entry === null) redirect(withResult(returnTo, 'bulunamadi', entryId.data))

  // A double-submitted form must not make one operator's single reading of a
  // row look like two in the record that exists to be counted on.
  let duplicate = false
  let dedupeFailed = false
  try {
    duplicate = await hasRecentReview(entryId.data, session.userId, REVIEW_DEDUPE_MINUTES)
  } catch {
    dedupeFailed = true
  }
  if (dedupeFailed) redirect(withResult(returnTo, 'basarisiz', entryId.data))
  if (duplicate) redirect(withResult(returnTo, 'yinelenen', entryId.data))

  try {
    await recordStaffAction({
      actor: { userId: session.userId, role: session.role },
      action: REVIEW_ACTION,
      // The note belongs to the same user's history as the row it is about, so
      // "everything that ever happened concerning this account" stays complete.
      subjectUserId: entry.subject_user_id,
      entityType: REVIEW_ENTITY_TYPE,
      entityId: entry.audit_id,
      reason,
      detail: {
        entry_action: entry.action,
        entry_actor: entry.actor,
        entry_outcome: entry.outcome,
        entry_entity_type: entry.entity_type,
        entry_created_at: entry.created_at,
        dedupe_window_minutes: REVIEW_DEDUPE_MINUTES,
      },
    })
  } catch {
    // The audit row is the entire effect of this action. If it did not land,
    // nothing happened, and the operator has to be told that rather than
    // reassured by a green banner over a note nobody will ever see.
    redirect(withResult(returnTo, 'basarisiz', entryId.data))
  }

  revalidatePath(returnTo.pathname)
  redirect(withResult(returnTo, 'isaretlendi', entryId.data))
}

// ===========================================================================
// Recording that a staff member read the trail
// ===========================================================================

/**
 * File one `audit.log_inspected` row for this operator and this filter set.
 *
 * Called from the page once it is actually in front of a person, not during the
 * render, so a prefetch nobody looked at leaves no trace. De-duplicated
 * server-side: repeating the same question inside the window is the same
 * reading, and a trail that records the same reading forty times is a trail
 * that hides the thirty-ninth thing that mattered.
 *
 * It never throws. A failure to record the read is reported to the operator as
 * a failure — the receipt on the page turns red — but it must not take down the
 * page that was being read.
 */
export async function recordAuditAccessAction(scopeKey: string): Promise<AccessOutcome> {
  if (!isScopeKey(scopeKey)) return 'basarisiz'

  let session: StaffSession
  try {
    session = await requireStaffAction('ops')
  } catch {
    return 'basarisiz'
  }

  try {
    const already = await hasRecentAccessRecord(session.userId, scopeKey, ACCESS_DEDUPE_MINUTES)
    if (already) return 'zaten_var'

    await recordStaffAction({
      actor: { userId: session.userId, role: session.role },
      action: ACCESS_ACTION,
      subjectUserId: null,
      entityType: ACCESS_ENTITY_TYPE,
      entityId: scopeKey,
      reason: ACCESS_REASON,
      detail: { dedupe_window_minutes: ACCESS_DEDUPE_MINUTES },
    })
    return 'islendi'
  } catch {
    return 'basarisiz'
  }
}

// ===========================================================================
// Refresh
// ===========================================================================

/** Re-runs every query on the current audit page, filters and cursor intact. */
export async function refreshAuditAction(formData: FormData): Promise<void> {
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

/**
 * The posted return path, if it is one of ours; the trail otherwise.
 *
 * Parsing against a fixed base means an absolute URL to another host lands on a
 * different origin and is rejected, and a path this area does not own is
 * rejected by the allowlist. Previous result parameters are stripped so a
 * second action cannot stack its answer on top of the first one's.
 */
function safeReturnTo(raw: string): URL {
  const fallback = new URL(AUDIT_PATH, RELATIVE_BASE)
  if (raw === '') return fallback

  let url: URL
  try {
    url = new URL(raw, RELATIVE_BASE)
  } catch {
    return fallback
  }

  if (url.origin !== RELATIVE_BASE) return fallback
  if (!(AUDIT_RETURN_PATHS as readonly string[]).includes(url.pathname)) return fallback

  for (const param of Object.values(RESULT_PARAMS)) url.searchParams.delete(param)
  return url
}

function withResult(returnTo: URL, outcome: ReviewOutcome, entryId: string): string {
  const url = new URL(returnTo.toString())
  url.searchParams.set(RESULT_PARAMS.outcome, outcome)
  if (entryId !== '') url.searchParams.set(RESULT_PARAMS.entry, entryId.slice(0, 64))
  return `${url.pathname}${url.search}`
}
