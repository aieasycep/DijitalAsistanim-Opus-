'use server'

import { uuidSchema } from '@da/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  AI_CEILING_PATH,
  QUOTA_REVIEW_ACTION,
  QUOTA_REVIEW_ENTITY_TYPE,
  QUOTA_REVIEW_FIELDS,
  REFRESH_FIELDS,
  REVIEW_RESULT_PARAMS,
  isAiReturnPath,
  isQuotaDecision,
  isSpendWindowKey,
  type ReviewOutcome,
} from '@/components/ai/contract'
import { isValidReason, recordStaffAction } from '@/lib/audit'
import { requireStaffAction, type StaffSession } from '@/lib/auth'
import { loadUserSpendSnapshot } from '@/lib/queries/ai'

/**
 * The two Server Actions the AI area exposes.
 *
 * `recordQuotaReviewAction` is the only thing in this area that writes
 * anything. It deliberately does not change the account it is about: there is
 * no endpoint in this product that throttles a user, and a button that
 * pretended to would be worse than no button. What it does is real and durable
 * — it appends one `audit_logs` row saying which operator looked at which
 * account, what they concluded, why, and what the account's spend actually was
 * at that moment — and the ceiling table reads those rows back, so an account
 * someone has already triaged stops looking untouched to the next person on
 * shift. The row also surfaces in `/denetim` like every other staff action.
 *
 * Three properties keep it honest:
 *
 *   1. It is `ops`-gated through `requireStaffAction`, which throws rather than
 *      redirecting, and the page that renders the form is `ops`-gated too.
 *
 *   2. The spend figures in the audit row are re-read from `bo_ai_spend` inside
 *      the action, never taken from the form. A stale tab cannot enter a
 *      number into the permanent record.
 *
 *   3. Nothing content-shaped can travel through it. The form posts a uuid, one
 *      of three fixed decision tokens, a window key and a typed reason; the
 *      audit `detail` type admits scalars only. No address, subject or message
 *      exists on this path to leak.
 *
 * The redirect target is checked against the area's three-entry allowlist
 * rather than trusted from the form, so a crafted `donus` cannot turn a staff
 * button into an open redirect.
 */

/** Only used to parse a relative path; never fetched, never rendered. */
const RELATIVE_BASE = 'https://backoffice.invalid'

export async function recordQuotaReviewAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, QUOTA_REVIEW_FIELDS.returnTo))
  const userIdRaw = field(formData, QUOTA_REVIEW_FIELDS.userId)
  const decisionRaw = field(formData, QUOTA_REVIEW_FIELDS.decision)
  const windowRaw = field(formData, QUOTA_REVIEW_FIELDS.window)
  const reason = String(formData.get(QUOTA_REVIEW_FIELDS.reason) ?? '')

  let session: StaffSession
  try {
    session = await requireStaffAction('ops')
  } catch {
    redirect(withResult(returnTo, 'forbidden', null, userIdRaw))
  }

  const userId = uuidSchema.safeParse(userIdRaw)
  if (!userId.success || !isQuotaDecision(decisionRaw) || !isValidReason(reason)) {
    redirect(withResult(returnTo, 'invalid', null, userIdRaw))
  }

  // The window the operator was looking at, recorded so a later reader knows
  // which figure the reason was written against. An unknown key is dropped
  // rather than trusted into the record.
  const windowKey = isSpendWindowKey(windowRaw) ? windowRaw : 'unknown'

  const snapshot = await loadUserSpendSnapshot(userId.data)
  if (snapshot === null) {
    // No `bo_ai_spend` row means the account has never called a model: there is
    // nothing to review, and a review row would assert something untrue.
    redirect(withResult(returnTo, 'invalid', decisionRaw, userId.data))
  }

  try {
    await recordStaffAction({
      actor: { userId: session.userId, role: session.role },
      action: QUOTA_REVIEW_ACTION,
      subjectUserId: userId.data,
      entityType: QUOTA_REVIEW_ENTITY_TYPE,
      // The subject is the account itself, so the ceiling table can find the
      // review by `entity_id` when it lists that account again.
      entityId: userId.data,
      reason,
      outcome: decisionRaw,
      detail: {
        window: windowKey,
        cost_micros_24h: snapshot.costMicros24h,
        cost_micros_7d: snapshot.costMicros7d,
        cost_micros_30d: snapshot.costMicros30d,
        event_count_30d: snapshot.eventCount30d,
        model_count: snapshot.modelCount,
      },
    })
  } catch {
    // With no trail there is no review: say so rather than reporting success.
    redirect(withResult(returnTo, 'failed', decisionRaw, userId.data))
  }

  revalidatePath(returnTo.pathname)
  redirect(withResult(returnTo, 'recorded', decisionRaw, userId.data))
}

/** Re-runs every query on the current AI page, keeping its filters. */
export async function refreshAiAction(formData: FormData): Promise<void> {
  await requireStaffAction('ops')
  const returnTo = safeReturnTo(field(formData, REFRESH_FIELDS.returnTo))
  revalidatePath(returnTo.pathname)
  redirect(`${returnTo.pathname}${returnTo.search}`)
}

// ---------------------------------------------------------------------------
// Redirect targets
// ---------------------------------------------------------------------------

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim()
}

/**
 * The posted return path, if it is one of this area's; the ceiling page
 * otherwise.
 *
 * Parsing against a fixed base means an absolute URL to another host lands on a
 * different origin and is rejected, and a path this area does not own fails the
 * allowlist. Previous result parameters are stripped so two actions cannot
 * stack their answers on top of each other.
 */
function safeReturnTo(raw: string): URL {
  const fallback = new URL(AI_CEILING_PATH, RELATIVE_BASE)
  if (raw === '') return fallback

  let url: URL
  try {
    url = new URL(raw, RELATIVE_BASE)
  } catch {
    return fallback
  }

  if (url.origin !== RELATIVE_BASE) return fallback
  if (!isAiReturnPath(url.pathname)) return fallback

  for (const param of Object.values(REVIEW_RESULT_PARAMS)) url.searchParams.delete(param)
  return url
}

function withResult(
  returnTo: URL,
  outcome: ReviewOutcome,
  decision: string | null,
  userId: string,
): string {
  const url = new URL(returnTo.toString())
  url.searchParams.set(REVIEW_RESULT_PARAMS.outcome, outcome)
  if (decision !== null && decision !== '') {
    url.searchParams.set(REVIEW_RESULT_PARAMS.decision, decision.slice(0, 32))
  }
  if (userId !== '') url.searchParams.set(REVIEW_RESULT_PARAMS.user, userId.slice(0, 36))
  return `${url.pathname}${url.search}`
}
