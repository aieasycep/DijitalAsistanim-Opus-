'use server'

import { MAX_REDEMPTIONS_PER_REFERRER, normalizeReferralCode } from '@da/domain'
import { uuidSchema } from '@da/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  BILLING_PATH,
  BILLING_RETURN_PATHS,
  REFERRAL_CODE_PATTERN,
  REFRESH_FIELDS,
  REVOKE_AUDIT_ACTION,
  REVOKE_FIELDS,
  REVOKE_RESULT_PARAMS,
  type RevokeOutcome,
} from '@/components/billing/contract'
import { isValidReason, recordStaffAction } from '@/lib/audit'
import { requireStaffAction, type StaffSession } from '@/lib/auth'
import { loadReferral } from '@/lib/queries/billing'

/**
 * The two Server Actions the billing area exposes.
 *
 * ---------------------------------------------------------------------------
 * WHY THE REVOCATION IS AN ORDER AND NOT AN UPDATE
 * ---------------------------------------------------------------------------
 *
 * `@/lib/db` gives the whole application exactly one write — `insertAuditLog` —
 * and every other privileged operation it exposes is a read. That is the shape
 * of the guarantee, not a gap in it: the service role bypasses row level
 * security, so a second writer handed to this app would be a general mutation
 * path over every table in the database, including the ones the views exist to
 * keep out of reach. There is no `referral-revoke` edge function to call
 * either, and `subscription-refresh` — the only billing function that writes —
 * authenticates as the *user*, so calling it would require the backoffice to
 * mint a user session, which is the exact capability the product promises
 * nobody has.
 *
 * What this action therefore does is the strongest thing available to it, and
 * it is not nothing: it re-reads the referral from `bo_referrals` so the
 * numbers it records are the database's and not the form's, then appends one
 * `audit_logs` row naming the operator, their role, the referral, the referrer,
 * the live credit counts and a reason they had to type. The order appears
 * immediately in the page's own trail and in `/denetim`, and the code's
 * `credit_revoked_count` sits beside it — so "was this carried out?" is a
 * question the screen answers rather than one the button pretends to settle.
 *
 * Both actions redirect with their outcome in the query string. The target is
 * checked against a three-entry allowlist rather than trusted from the form, so
 * a crafted `donus` field cannot turn a staff button into an open redirect.
 */

/** Only used to parse a relative path; never fetched, never rendered. */
const RELATIVE_BASE = 'https://backoffice.invalid'

export async function revokeReferralCreditAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, REVOKE_FIELDS.returnTo))
  const referralIdRaw = field(formData, REVOKE_FIELDS.referralId)
  const referrerIdRaw = field(formData, REVOKE_FIELDS.referrerUserId)
  const codeRaw = field(formData, REVOKE_FIELDS.code)
  const reason = String(formData.get(REVOKE_FIELDS.reason) ?? '')

  let session: StaffSession
  try {
    session = await requireStaffAction('ops')
  } catch {
    redirect(withResult(returnTo, 'forbidden', referralIdRaw))
  }

  const referralId = uuidSchema.safeParse(referralIdRaw)
  const referrerId = uuidSchema.safeParse(referrerIdRaw)
  const code = normalizeReferralCode(codeRaw)

  if (
    !referralId.success ||
    !referrerId.success ||
    !REFERRAL_CODE_PATTERN.test(code) ||
    !isValidReason(reason)
  ) {
    redirect(withResult(returnTo, 'invalid', referralIdRaw))
  }

  // The form is a hint about *which* referral, never about its state. Every
  // number that reaches the audit row is re-read here, so an order recorded
  // against "12 active credits" says what the database said at that instant.
  let referral: Awaited<ReturnType<typeof loadReferral>>
  try {
    referral = await loadReferral(referralId.data)
  } catch {
    redirect(withResult(returnTo, 'failed', referralId.data))
  }

  if (referral === null) {
    redirect(withResult(returnTo, 'notfound', referralId.data))
  }

  // `referrals.user_id` and `referrals.code` never change for a given row, so a
  // posted pair that disagrees with the stored one is a tampered form rather
  // than a stale page.
  if (referral.user_id !== referrerId.data || referral.code !== code) {
    redirect(withResult(returnTo, 'invalid', referral.referral_id))
  }

  const activeCredits = referral.credit_active_count
  const outcome: RevokeOutcome = activeCredits > 0 ? 'success' : 'noop'

  try {
    await recordStaffAction({
      actor: { userId: session.userId, role: session.role },
      action: REVOKE_AUDIT_ACTION,
      subjectUserId: referral.user_id,
      entityType: 'referral',
      entityId: referral.referral_id,
      reason,
      outcome,
      detail: {
        code: referral.code,
        active_credits: activeCredits,
        credit_count: referral.credit_count,
        already_revoked: referral.credit_revoked_count,
        redemption_count: referral.redemption_count,
        bonus_days_total: referral.bonus_days_total,
        at_or_over_limit: referral.redemption_count >= MAX_REDEMPTIONS_PER_REFERRER,
      },
    })
  } catch {
    // With no trail there is no order: the whole value of this button is the
    // row it writes, so a failed write must not report success.
    redirect(withResult(returnTo, 'failed', referral.referral_id))
  }

  // The orders panel on the page reads the trail this row just joined, so the
  // operator sees the effect of the button without reloading by hand.
  revalidatePath(returnTo.pathname)
  redirect(withResult(returnTo, outcome, referral.referral_id))
}

/** Re-runs every query on the current billing page, keeping its filters. */
export async function refreshBillingAction(formData: FormData): Promise<void> {
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
 * The posted return path, if it is one of ours; the billing landing page
 * otherwise.
 *
 * Parsing against a fixed base means an absolute URL to another host lands on a
 * different origin and is rejected, and a path we do not own is rejected by the
 * allowlist. Any previous result parameters are stripped so a second action
 * cannot stack its answer on top of the first one's.
 */
function safeReturnTo(raw: string): URL {
  const fallback = new URL(BILLING_PATH, RELATIVE_BASE)
  if (raw === '') return fallback

  let url: URL
  try {
    url = new URL(raw, RELATIVE_BASE)
  } catch {
    return fallback
  }

  if (url.origin !== RELATIVE_BASE) return fallback
  if (!(BILLING_RETURN_PATHS as readonly string[]).includes(url.pathname)) return fallback

  for (const param of Object.values(REVOKE_RESULT_PARAMS)) url.searchParams.delete(param)
  return url
}

function withResult(returnTo: URL, outcome: RevokeOutcome, referralId: string): string {
  const url = new URL(returnTo.toString())
  url.searchParams.set(REVOKE_RESULT_PARAMS.outcome, outcome)
  if (referralId !== '') {
    url.searchParams.set(REVOKE_RESULT_PARAMS.referral, referralId.slice(0, 36))
  }
  return `${url.pathname}${url.search}`
}
