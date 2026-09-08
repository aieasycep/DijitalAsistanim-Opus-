import type { BadgeTone } from '@/components/ui/Badge'
import type { EntitlementSource, GrantEffect, GrantOutcome, GrantStatus } from './contract'

/**
 * Tone and label decisions for the temporary-Pro area.
 *
 * Pure, and separate from the string table, because a tone is a claim about
 * health rather than a translation: `warning` on this screen means "somebody
 * should look at this", and the two places that could disagree about whether an
 * overlapping grant is a warning are a component and a message file. Keeping
 * the mapping here means there is one.
 *
 * Nothing in this module imports the database layer, so a Client Component may
 * import it directly.
 */

/**
 * The state of the grant row itself.
 *
 * `live` is `primary` rather than `success`: a grant in force is not a healthy
 * thing, it is an ongoing cost. Green would read as "all good" on the screen
 * whose whole purpose is to make free months visible.
 */
export function grantStatusTone(status: GrantStatus): BadgeTone {
  switch (status) {
    case 'live':
      return 'primary'
    case 'expired':
      return 'neutral'
    case 'revoked':
      return 'warning'
    default:
      return 'neutral'
  }
}

/** Which of the three states a row is in, from the view's own columns. */
export function grantStatusOf(row: { is_live: boolean; revoked_at: string | null }): GrantStatus {
  if (row.revoked_at !== null) return 'revoked'
  return row.is_live ? 'live' : 'expired'
}

/**
 * What the grant is actually doing.
 *
 * `overlaps_store` is the only warning: goodwill spent on an account that is
 * already paying is money leaving twice, and it is the finding this column
 * exists to surface. `behind_referral` is information — the product is applying
 * its own rule and the grant is redundant, but nothing was paid twice.
 * `only_record` is neutral: the grant is the sole record, which is the normal
 * case and not, on its own, a problem.
 */
export function grantEffectTone(effect: GrantEffect): BadgeTone {
  switch (effect) {
    case 'overlaps_store':
      return 'warning'
    case 'behind_referral':
      return 'info'
    case 'only_record':
      return 'neutral'
    case 'not_live':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/** How the product's own answer is coloured on the detail panel. */
export function entitlementSourceTone(source: EntitlementSource): BadgeTone {
  switch (source) {
    case 'subscription':
      return 'success'
    case 'trial':
      return 'primary'
    case 'referral_bonus':
      return 'info'
    case 'none':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/**
 * The banner's tone.
 *
 * `granted` is `primary`, not `success`: writing a free month worked, and it
 * still means somebody is now getting Pro for nothing. `revoked` is `success`
 * for the mirror reason — a cost was stopped.
 */
export function outcomeTone(outcome: GrantOutcome): BadgeTone {
  switch (outcome) {
    case 'granted':
      return 'primary'
    case 'revoked':
      return 'success'
    case 'alreadyRevoked':
      return 'info'
    case 'overlap':
    case 'rejected':
    case 'invalid':
    case 'ratelimited':
      return 'warning'
    case 'forbidden':
    case 'notfound':
    case 'failed':
    case 'auditMissing':
      return 'critical'
    default:
      return 'neutral'
  }
}

export interface NamedAdmin {
  readonly name: string | null
  readonly emailRedacted: string | null
}

/**
 * How an administrator is named on a row.
 *
 * The display name when there is one, the redacted address otherwise, and a
 * stated "unknown" when the lookup found nothing — never a blank cell, which
 * would read as "nobody did this".
 */
export function adminLabel(admin: NamedAdmin | undefined, unknownLabel: string): string {
  if (admin === undefined) return unknownLabel
  return admin.name ?? admin.emailRedacted ?? unknownLabel
}

/** An integer percentage of a whole, or 0 when the whole is 0. */
export function shareOf(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}
