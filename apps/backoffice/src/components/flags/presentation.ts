import type { BadgeTone } from '@/components/ui/Badge'
import { flagMessages, flagPlanLabels, flagPlatformLabels } from '@/lib/messages/flags'
import {
  ROLLOUT_MAX,
  isNarrowed,
  orderedPlans,
  orderedPlatforms,
  type FlagOutcome,
  type FlagState,
  type FlagTargeting,
} from './contract'

/**
 * How a flag's values are rendered, decided once.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO GREEN
 * ---------------------------------------------------------------------------
 *
 * A tone is a claim, and the claim a green pill makes — "this is fine" — is not
 * one this screen is in a position to make. A flag at 100% is not health, it is
 * a decision somebody took; a flag at 0% is not a fault, it is a rollout that
 * has not started. So `on` is `primary` (a fact, stated firmly), `partial` is
 * `info`, `off` is `neutral`, and the only coloured warning in the set is the
 * kill switch, which really does mean somebody has stopped something.
 *
 * `describeAudience` is the other half of the same rule. The state pill answers
 * "which of the four", and it is never shown without the sentence that answers
 * "for whom" — including the parts that are unrestricted, spelled out as "tüm
 * platformlar" rather than left blank. A blank reads as "no restriction" to the
 * person who wrote the flag and as "no idea" to everybody else.
 *
 * Everything here is pure and imports nothing that touches the database, so a
 * Client Component may use it as freely as a Server one.
 */

export const flagStateTone: Readonly<Record<FlagState, BadgeTone>> = Object.freeze({
  killed: 'critical',
  off: 'neutral',
  partial: 'info',
  on: 'primary',
})

// ===========================================================================
// The audience, in words
// ===========================================================================

/**
 * The four conditions a user must meet, each as one phrase.
 *
 * Always four entries, in evaluation order: percentage, platform, plan,
 * version. An unrestricted dimension says so rather than being omitted.
 */
export function describeAudience(targeting: FlagTargeting): readonly string[] {
  const platforms = orderedPlatforms(targeting.platforms)
  const plans = orderedPlans(targeting.plans)

  const rollout =
    targeting.rollout_percentage >= ROLLOUT_MAX
      ? flagMessages.targeting.fullRollout
      : targeting.rollout_percentage <= 0
        ? flagMessages.targeting.noRollout
        : flagMessages.targeting.rollout(targeting.rollout_percentage)

  return [
    rollout,
    platforms.length === 0
      ? flagMessages.targeting.allPlatforms
      : platforms.map((platform) => flagPlatformLabels[platform]).join(' / '),
    plans.length === 0
      ? flagMessages.targeting.allPlans
      : plans.map((plan) => flagPlanLabels[plan]).join(' / '),
    describeVersionRange(targeting),
  ]
}

export function describeVersionRange(targeting: FlagTargeting): string {
  const { min_app_version: min, max_app_version: max } = targeting
  if (min !== null && max !== null) return flagMessages.targeting.versionRange(min, max)
  if (min !== null) return flagMessages.targeting.minVersion(min)
  if (max !== null) return flagMessages.targeting.maxVersion(max)
  return flagMessages.targeting.allVersions
}

/** One line for a table cell: `%25 · iOS · Pro · 2.1.0 ve üstü`. */
export function audienceLine(targeting: FlagTargeting): string {
  return describeAudience(targeting).join(' · ')
}

/** The sentence under the state pill: whether this reaches everybody it could. */
export function audienceNote(targeting: FlagTargeting): string {
  return isNarrowed(targeting)
    ? flagMessages.targeting.narrowedNote
    : flagMessages.targeting.everyoneNote
}

// ===========================================================================
// Per-user pins
// ===========================================================================

/**
 * The tone a pin's value wears.
 *
 * A lapsed pin is `neutral` rather than loud: it is no longer doing anything,
 * and the reason it is still listed is so somebody notices and removes it, not
 * so the screen shouts. A live pin is coloured by what it forces — `primary`
 * for an account that has been switched on ahead of the rollout, `critical` for
 * one that has been switched off — because those are two different exceptions
 * and a reviewer needs to tell them apart at a glance.
 */
export function overrideValueTone(enabled: boolean, isExpired: boolean): BadgeTone {
  if (isExpired) return 'neutral'
  return enabled ? 'primary' : 'critical'
}

// ===========================================================================
// Outcomes
// ===========================================================================

const SUCCESS_OUTCOMES: ReadonlySet<FlagOutcome> = new Set<FlagOutcome>([
  'created',
  'updated',
  'enabled',
  'disabled',
  'unkilled',
  'overrideSet',
  'overrideRemoved',
])

const WARNING_OUTCOMES: ReadonlySet<FlagOutcome> = new Set<FlagOutcome>([
  'killed',
  'noop',
  'duplicate',
  'conflict',
  'ratelimited',
])

/**
 * The banner's tone.
 *
 * `killed` is a warning rather than a success: pulling a kill switch works, and
 * it is still not good news — something is now off for everybody, and the
 * banner should read that way to the person who did it.
 */
export function outcomeTone(outcome: FlagOutcome): BadgeTone {
  if (SUCCESS_OUTCOMES.has(outcome)) return 'success'
  if (WARNING_OUTCOMES.has(outcome)) return 'warning'
  return 'critical'
}

// ===========================================================================
// People
// ===========================================================================

export interface NamedAdmin {
  readonly name: string | null
  readonly emailRedacted: string | null
  readonly roleLabel: string
}

/**
 * How a staff member is named on a flag screen.
 *
 * The display name when there is one, the redacted address otherwise, and the
 * honest "bilinmiyor" when the row names an admin this console can no longer
 * resolve — never a bare uuid dressed up as a person.
 */
export function adminLabel(admin: NamedAdmin | undefined): string {
  if (admin === undefined) return flagMessages.detail.changedByUnknown
  return admin.name ?? admin.emailRedacted ?? flagMessages.detail.changedByUnknown
}
