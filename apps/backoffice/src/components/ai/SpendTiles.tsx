import { StatGrid, StatTile } from '@/components/ui'
import { formatCompact, formatCostMicros, formatNumber } from '@/lib/format'
import type { SpendWindow, SpenderCounts } from '@/lib/queries/ai'
import { AI_CEILING_PATH } from './contract'
import { deltaOf, formatCostPerEvent, formatRatio, type DeltaDirection } from './format'
import { aiMessages, operationLabel } from './messages'

/**
 * The headline of the spend page.
 *
 * Every tile is a sum over `bo_ai_spend_daily` buckets for the selected window,
 * and every one that can carries a comparison against the equally long window
 * before it — a cost total with no direction is a number nobody acts on. When
 * the previous period had no spend at all, the tile says so instead of
 * inventing a percentage out of a zero baseline.
 */

export function SpendTotalsTiles({ spend }: { spend: SpendWindow }) {
  const cost = deltaOf(spend.current.costMicros, spend.previous.costMicros)
  const events = deltaOf(spend.current.events, spend.previous.events)
  const tokens = spend.current.tokensIn + spend.current.tokensOut

  return (
    <StatGrid>
      <StatTile
        label={aiMessages.spend.costTotal}
        value={formatCostMicros(spend.current.costMicros)}
        hint={deltaHint(cost.direction, cost.ratio, formatCostMicros(spend.previous.costMicros))}
        tone={cost.direction === 'up' ? 'warning' : 'neutral'}
      />
      <StatTile
        label={aiMessages.spend.eventTotal}
        value={formatCompact(spend.current.events)}
        hint={deltaHint(events.direction, events.ratio, formatCompact(spend.previous.events))}
      />
      <StatTile
        label={aiMessages.spend.costPerEvent}
        value={formatCostPerEvent(spend.current.costMicros, spend.current.events)}
        hint={`${formatNumber(spend.current.events)} ${aiMessages.fields.events.toLocaleLowerCase('tr-TR')}`}
      />
      <StatTile
        label={aiMessages.spend.tokensTotal}
        value={formatCompact(tokens)}
        hint={`${formatCompact(spend.current.tokensIn)} / ${formatCompact(spend.current.tokensOut)} ${aiMessages.spend.tokensSplit}`}
      />
    </StatGrid>
  )
}

/**
 * How many distinct people the window's cost is spread across, in the three
 * rolling windows `bo_ai_spend` pre-sums — each an exact `count(*)`, never a
 * sum of per-bucket user counts, which would double-count anyone who used two
 * models in a day.
 */
export function SpenderTiles({
  counts,
  spend,
}: {
  counts: SpenderCounts
  spend: SpendWindow | null
}) {
  const topOperation = spend?.operations[0] ?? null

  return (
    <StatGrid>
      <StatTile
        label={aiMessages.spend.spenders24h}
        value={formatNumber(counts.in24h)}
        href={AI_CEILING_PATH}
      />
      <StatTile label={aiMessages.spend.spenders7d} value={formatNumber(counts.in7d)} />
      <StatTile label={aiMessages.spend.spenders30d} value={formatNumber(counts.in30d)} />
      {topOperation && spend ? (
        <StatTile
          label={aiMessages.spend.topOperation}
          value={operationLabel(topOperation.key)}
          hint={`${formatCostMicros(topOperation.costMicros)} · ${formatRatio(
            spend.current.costMicros > 0
              ? topOperation.costMicros / spend.current.costMicros
              : null,
          )}`}
        />
      ) : null}
    </StatGrid>
  )
}

function deltaHint(direction: DeltaDirection, ratio: number | null, previousLabel: string): string {
  if (direction === 'none') return aiMessages.spend.deltaNoBase
  if (direction === 'flat' || ratio === null) {
    return `${aiMessages.spend.deltaFlat} · ${aiMessages.spend.deltaPrevious(previousLabel)}`
  }
  const change = formatRatio(ratio)
  const text =
    direction === 'up' ? aiMessages.spend.deltaUp(change) : aiMessages.spend.deltaDown(change)
  return `${text} · ${aiMessages.spend.deltaPrevious(previousLabel)}`
}
