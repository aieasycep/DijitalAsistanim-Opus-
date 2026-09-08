import type { Clock } from '@da/domain'
import Link from 'next/link'
import { StatGrid, StatTile } from '@/components/ui'
import type { BoPromptVersionRow } from '@/lib/db'
import { formatCostMicros, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import type { ModelUsage } from '@/lib/queries/prompts'
import { promptMessages } from '@/lib/messages/prompts'
import { AI_SPEND_PATH } from './contract'
import { costPerCall } from './presentation'

/**
 * What this version actually cost, and — just as deliberately — what cannot be
 * measured about it.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR NUMBERS THAT ARE REAL
 * ---------------------------------------------------------------------------
 *
 * Call count, cost, cost per call and the last call. All four come from
 * `bo_prompt_versions`, whose lateral join counts the `ai_usage_events` rows
 * carrying this version's `prompt_version_id` over thirty days. Cost per call is
 * arithmetic over the first two and is labelled as derived; with no calls it is
 * an em dash rather than a zero, because "free" and "never ran" are different
 * facts.
 *
 * ---------------------------------------------------------------------------
 * THE TWO THAT ARE NOT, AND WHY THEY ARE STILL ON THE PAGE
 * ---------------------------------------------------------------------------
 *
 * Per-version token totals and a per-version thumbs up/down rate were both
 * asked for and neither is derivable:
 *
 *   - `ai_usage_events` records tokens, but no content-blind view groups them by
 *     `prompt_version_id`, and this app may not add a view.
 *   - `ai_feedback` has no prompt-version column at all — a signal is keyed to
 *     the entity a user reacted to — and it is a content table with a free-text
 *     note, so it has no `bo_*` view and cannot get one from here.
 *
 * Leaving them off the screen would have meant an operator wondering whether
 * nobody had looked. Rendering a plausible-looking substitute would have been
 * worse. So they are named, with the reason, in the place they would have been —
 * and the one honest token figure available, the model's platform-wide total, is
 * offered separately and labelled model-wide in its own heading.
 */
export function UsagePanel({
  metrics,
  clock,
}: {
  /** The view row for this version, or null when the read failed. */
  metrics: BoPromptVersionRow | null
  clock: Clock
}) {
  const events = metrics?.event_count_30d ?? 0
  const cost = metrics?.cost_micros_30d ?? 0
  const perCall = metrics === null ? null : costPerCall(cost, events)

  return (
    <div className="flex flex-col gap-4">
      <StatGrid>
        <StatTile
          label={promptMessages.usage.calls}
          hint={promptMessages.usage.callsHint}
          value={metrics === null ? '—' : formatNumber(events)}
          tone={events > 0 ? 'primary' : 'neutral'}
        />
        <StatTile
          label={promptMessages.usage.cost}
          hint={promptMessages.usage.costHint}
          value={metrics === null ? '—' : formatCostMicros(cost)}
        />
        <StatTile
          label={promptMessages.usage.perCall}
          hint={promptMessages.usage.perCallHint}
          value={perCall === null ? '—' : formatCostMicros(perCall)}
        />
        <StatTile
          label={promptMessages.usage.lastUsed}
          hint={promptMessages.usage.lastUsedHint}
          value={metrics?.last_used_at == null ? '—' : formatRelative(metrics.last_used_at, clock)}
        />
      </StatGrid>

      {metrics !== null && events === 0 ? (
        <p className="rounded-md bg-surface2 px-3 py-2 text-[12px] text-muted">
          {promptMessages.usage.noEvents}
        </p>
      ) : null}

      {metrics?.last_used_at == null ? null : (
        <p className="text-[11px] text-faint">{formatDateTime(metrics.last_used_at)}</p>
      )}

      <div className="rounded-md border border-hairline p-3">
        <p className="bo-kicker">{promptMessages.usage.unattributed}</p>
        <dl className="mt-2 flex flex-col gap-3">
          <div>
            <dt className="text-[12px] font-semibold text-ink">
              {promptMessages.usage.tokensTitle}
            </dt>
            <dd className="mt-0.5 max-w-prose text-[11px] text-faint">
              {promptMessages.usage.tokensBody}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-semibold text-ink">
              {promptMessages.usage.feedbackTitle}
            </dt>
            <dd className="mt-0.5 max-w-prose text-[11px] text-faint">
              {promptMessages.usage.feedbackBody}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

/**
 * The model's platform-wide totals, stated as platform-wide in every line.
 *
 * This is not attribution and the panel never pretends it is: the heading, the
 * description and the tile hints all say the figure covers every feature using
 * the model. It is here because token volume is the one thing an operator
 * cannot get any other way, and an order of magnitude clearly labelled is worth
 * more than a blank.
 */
export function ModelUsagePanel({ usage }: { usage: ModelUsage | null }) {
  if (usage === null) {
    return <p className="text-[12px] text-faint">{promptMessages.usage.modelNoModel}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted">{promptMessages.usage.modelDescription}</p>

      {usage.eventCount === 0 ? (
        <p className="rounded-md bg-surface2 px-3 py-2 text-[12px] text-muted">
          {promptMessages.usage.modelEmpty}
        </p>
      ) : (
        <StatGrid>
          <StatTile
            label={promptMessages.usage.modelEvents}
            value={formatNumber(usage.eventCount)}
          />
          <StatTile
            label={promptMessages.usage.modelTokensIn}
            value={formatNumber(usage.tokensIn)}
          />
          <StatTile
            label={promptMessages.usage.modelTokensOut}
            value={formatNumber(usage.tokensOut)}
          />
          <StatTile
            label={promptMessages.usage.modelCost}
            value={formatCostMicros(usage.costMicros)}
            href={AI_SPEND_PATH}
          />
        </StatGrid>
      )}

      {usage.truncated ? (
        <p
          role="status"
          className="rounded-md bg-warning-soft px-3 py-2 text-[11px] text-warning-text"
        >
          {promptMessages.usage.modelTruncated}
        </p>
      ) : null}

      <Link
        href={AI_SPEND_PATH}
        className="self-start text-[12px] font-medium text-primary hover:underline"
      >
        {promptMessages.usage.modelLink}
      </Link>
    </div>
  )
}
