'use server'

import { BRIEFING_KINDS, isAppError, systemClock, toIsoDate, type BriefingKind } from '@da/domain'
import { revalidatePath } from 'next/cache'
import { isValidReason, recordStaffAction } from '@/lib/audit'
import { requireStaffAction } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import {
  BRIEFING_REGENERATE_ACTION,
  briefingEntityId,
  briefingKindAllowed,
  deriveEntitlements,
  loadUserDetail,
} from '@/lib/queries/users'
import { isUserId } from './params'
import { userEnumLabels, userMessages } from './messages'
import type { RegenerateBriefingState } from './action-state'

/**
 * The one staff action in the users area: ask for a user's briefing to be
 * regenerated for their own today.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS RECORDS A REQUEST INSTEAD OF GENERATING A BRIEFING
 * ---------------------------------------------------------------------------
 *
 * Generating a briefing means calling `briefing-generate`, which authenticates
 * as the user and answers with the finished briefing — its narrative, its
 * headline, its items. For the backoffice to call it, a staff member would need
 * a user session, and the moment such a session can be minted the product's
 * central promise stops being structural: whoever holds the backoffice's
 * credentials could read any mailbox, and the only thing preventing it would be
 * a policy. So this action does not, and must not, hold that capability.
 *
 * What it does instead is durable, attributable and content-free: it validates
 * the request against the user's real state — not deleted, has a connected
 * account, entitled to that briefing kind — resolves the date in the *user's*
 * time zone rather than the operator's, and appends one `audit_logs` row naming
 * the staff member, the subject, the target and the reason. The request appears
 * on the page immediately, in the history panel beside the form.
 *
 * Every refusal below is a real answer to a support call. "No connected
 * account" and "that briefing kind is not in their plan" are, between them, the
 * two most common reasons a briefing never arrived — so the button that cannot
 * proceed still tells the operator why, which is more than a briefing it
 * silently regenerated would have.
 */
export async function regenerateBriefingAction(
  _previous: RegenerateBriefingState,
  formData: FormData,
): Promise<RegenerateBriefingState> {
  const userId = String(formData.get('kullaniciId') ?? '').trim()
  const rawKind = String(formData.get('tur') ?? '').trim()
  const reason = String(formData.get('gerekce') ?? '').trim()

  const fail = (message: string): RegenerateBriefingState => ({
    status: 'error',
    message,
    forDate: null,
    kind: null,
  })

  if (!isUserId(userId)) return fail(userMessages.regenerate.errorUser)
  if (!(BRIEFING_KINDS as readonly string[]).includes(rawKind)) {
    return fail(userMessages.regenerate.errorKind)
  }
  const kind = rawKind as BriefingKind
  if (!isValidReason(reason)) return fail(userMessages.regenerate.errorReason)

  try {
    const staff = await requireStaffAction('support')

    const user = await loadUserDetail(userId)
    if (!user) return fail(userMessages.regenerate.errorNotFound)
    if (user.is_deleted) return fail(userMessages.regenerate.errorDeleted)
    if (user.account_connected_count === 0) {
      return fail(userMessages.regenerate.errorNoAccount)
    }

    const entitlements = deriveEntitlements(user)
    if (!briefingKindAllowed(entitlements, kind)) {
      return fail(userMessages.regenerate.errorNotEntitled)
    }

    // The user's day, not the operator's: an operator in Istanbul asking at
    // 01:00 for a user in Berlin must not target tomorrow's briefing.
    const forDate = toIsoDate(systemClock.now(), user.time_zone)

    await recordStaffAction({
      actor: { userId: staff.userId, role: staff.role },
      action: BRIEFING_REGENERATE_ACTION,
      subjectUserId: userId,
      entityType: 'briefing',
      entityId: briefingEntityId(forDate, kind),
      reason,
      detail: {
        kind,
        for_date: forDate,
        time_zone: user.time_zone,
        plan: entitlements.plan,
        entitlement_source: entitlements.source,
        connected_accounts: user.account_connected_count,
        devices: user.device_count,
      },
    })

    // The history panel on this page reads the trail this row just joined, so
    // the operator sees the effect of the button without reloading by hand.
    revalidatePath(`/kullanicilar/${userId}`)

    return {
      status: 'success',
      message: userMessages.regenerate.success(
        formatDate(forDate),
        userEnumLabels.briefingKind[kind] ?? kind,
      ),
      forDate,
      kind,
    }
  } catch (error) {
    if (isAppError(error) && (error.code === 'forbidden' || error.code === 'unauthorized')) {
      return fail(userMessages.regenerate.errorForbidden)
    }
    return fail(userMessages.regenerate.errorUnavailable)
  }
}
