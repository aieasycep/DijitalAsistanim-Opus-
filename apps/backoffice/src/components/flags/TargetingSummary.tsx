import { flagMessages, flagStateHints } from '@/lib/messages/flags'
import type { FlagState, FlagTargeting } from './contract'
import { StateBadge } from './StateBadge'
import { audienceNote, describeAudience } from './presentation'

/**
 * What this flag is actually doing, in full.
 *
 * The specification's rule for this module, rendered: a row must show its real
 * current state, so "enabled at 25% for iOS on Pro" is written out as those
 * four conditions rather than reduced to a coloured dot. Every dimension is
 * named, including the unrestricted ones — "tüm platformlar" is information,
 * a blank space is not.
 *
 * The values come from `bo_feature_flags`, which computes `effective_state`
 * the way the evaluator computes it. Nothing here decides anything; it
 * describes the record the mobile app will read.
 */
export function TargetingSummary({
  state,
  targeting,
  showHint = true,
}: {
  state: FlagState
  targeting: FlagTargeting
  showHint?: boolean
}) {
  const parts = describeAudience(targeting)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge state={state} />
        <ul className="flex flex-wrap items-center gap-1.5">
          {parts.map((part) => (
            <li
              key={part}
              className="rounded bg-surface2 px-1.5 py-0.5 text-[11px] font-medium text-muted"
            >
              {part}
            </li>
          ))}
        </ul>
      </div>

      {showHint ? (
        <div className="flex flex-col gap-1">
          <p className="text-[12px] text-muted">{flagStateHints[state]}</p>
          <p className="text-[11px] text-faint">{audienceNote(targeting)}</p>
          {state === 'killed' ? (
            <p className="rounded-md bg-critical-soft px-2.5 py-1.5 text-[11px] text-critical-text">
              {flagMessages.actions.killPulledNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
