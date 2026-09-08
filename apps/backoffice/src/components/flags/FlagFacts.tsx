import type { Clock } from '@da/domain'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import type { BoFeatureFlagRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { flagMessages, flagPlanLabels, flagPlatformLabels } from '@/lib/messages/flags'
import type { FlagAdmin } from '@/lib/queries/flags'
import { orderedPlans, orderedPlatforms } from './contract'
import { adminLabel, describeVersionRange } from './presentation'

/**
 * The record, field by field.
 *
 * Every value here is a stored column, shown as stored — the two switches are
 * rendered as their own words rather than folded into the state pill, because
 * "ana anahtar açık, kill switch çekili" is a real and important combination
 * and a single summary cannot express it. An empty targeting array reads "tüm
 * platformlar", which is what an empty array means to the evaluator.
 */
export function FlagFacts({
  flag,
  updatedBy,
  createdBy,
  clock,
}: {
  flag: BoFeatureFlagRow
  updatedBy: FlagAdmin | undefined
  createdBy: FlagAdmin | undefined
  clock: Clock
}) {
  const platforms = orderedPlatforms(flag.platforms)
  const plans = orderedPlans(flag.plans)

  const items: readonly { label: string; value: ReactNode }[] = [
    {
      label: flagMessages.detail.factKey,
      value: <span className="font-mono text-[12px] text-ink">{flag.key}</span>,
    },
    { label: flagMessages.detail.factDescription, value: flag.description },
    {
      label: flagMessages.detail.factEnabled,
      value: (
        <Badge tone={flag.enabled ? 'primary' : 'neutral'}>
          {flag.enabled ? flagMessages.detail.enabledYes : flagMessages.detail.enabledNo}
        </Badge>
      ),
    },
    {
      label: flagMessages.detail.factKillSwitch,
      value: (
        <Badge tone={flag.kill_switch ? 'critical' : 'neutral'}>
          {flag.kill_switch
            ? flagMessages.detail.killSwitchPulled
            : flagMessages.detail.killSwitchReleased}
        </Badge>
      ),
    },
    {
      label: flagMessages.detail.factRollout,
      value: <span className="tabular-nums">%{flag.rollout_percentage}</span>,
    },
    {
      label: flagMessages.detail.factPlatforms,
      value:
        platforms.length === 0
          ? flagMessages.targeting.allPlatforms
          : platforms.map((platform) => flagPlatformLabels[platform]).join(', '),
    },
    {
      label: flagMessages.detail.factPlans,
      value:
        plans.length === 0
          ? flagMessages.targeting.allPlans
          : plans.map((plan) => flagPlanLabels[plan]).join(', '),
    },
    { label: flagMessages.detail.factVersions, value: describeVersionRange(flag) },
    {
      label: flagMessages.detail.factCreated,
      value: `${formatDateTime(flag.created_at)} · ${adminLabel(createdBy)}`,
    },
    {
      label: flagMessages.detail.factUpdated,
      value: flagMessages.detail.changedBy(
        adminLabel(updatedBy),
        `${formatDateTime(flag.updated_at)} (${formatRelative(flag.updated_at, clock)})`,
      ),
    },
    {
      label: flagMessages.detail.factId,
      value: <span className="font-mono text-[11px] text-faint">{flag.flag_id}</span>,
    },
  ]

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="bo-kicker">{item.label}</dt>
          <dd className="mt-0.5 text-[12px] break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
