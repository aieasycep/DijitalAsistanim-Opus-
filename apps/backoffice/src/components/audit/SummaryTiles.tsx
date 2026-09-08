import { StatGrid, StatTile } from '@/components/ui'
import { formatCompact } from '@/lib/format'
import { LOG_PARAMS } from './contract'
import { filterHref, type ParamValues } from './href'
import { auditMessages } from './messages'
import type { Settled } from '@/lib/queries/audit'

/**
 * Four exact counts over the filter set that is on screen.
 *
 * Each tile is `count(*)` with the current filters, plus its own dimension — so
 * "Ekip işlemi" is the same query as the table's total with the actor pinned to
 * staff, and its link is that same view. A tile that cannot be turned into a
 * filter carries no link rather than a link that goes nowhere: "Kullanıcıya
 * bağlı" is total minus the rows with a null subject, and PostgREST has no
 * `not is null` to express the positive half as a filter.
 *
 * A count that failed renders as an em dash with its panel's error tone rather
 * than as a zero. A zero is a claim.
 */

export interface SummaryTilesProps {
  matching: Settled<number>
  staff: Settled<number>
  failed: Settled<number>
  userLinked: Settled<number>
  params: ParamValues
}

function tileValue(result: Settled<number>): string {
  return result.ok ? formatCompact(result.value) : '—'
}

function tileHint(result: Settled<number>, hint: string): string {
  return result.ok ? hint : result.message
}

export function SummaryTiles({ matching, staff, failed, userLinked, params }: SummaryTilesProps) {
  return (
    <StatGrid>
      <StatTile
        label={auditMessages.tiles.matching}
        value={tileValue(matching)}
        hint={tileHint(matching, auditMessages.tiles.matchingHint)}
        tone={matching.ok ? 'neutral' : 'critical'}
      />
      <StatTile
        label={auditMessages.tiles.staff}
        value={tileValue(staff)}
        hint={tileHint(staff, auditMessages.tiles.staffHint)}
        tone={staff.ok ? 'primary' : 'critical'}
        href={filterHref(params, LOG_PARAMS.actor, 'ekip')}
      />
      <StatTile
        label={auditMessages.tiles.failed}
        value={tileValue(failed)}
        hint={tileHint(failed, auditMessages.tiles.failedHint)}
        tone={!failed.ok || failed.value > 0 ? 'critical' : 'neutral'}
        href={filterHref(params, LOG_PARAMS.outcome, 'hata')}
      />
      <StatTile
        label={auditMessages.tiles.userLinked}
        value={tileValue(userLinked)}
        hint={tileHint(userLinked, auditMessages.tiles.userLinkedHint)}
        tone={userLinked.ok ? 'neutral' : 'critical'}
      />
    </StatGrid>
  )
}
