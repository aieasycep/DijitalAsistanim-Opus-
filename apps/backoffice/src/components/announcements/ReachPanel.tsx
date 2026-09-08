import { CardError, StatGrid, StatTile } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { announcementMessages } from '@/lib/messages/announcements'
import type { AnnouncementReach, UnmeasuredDimension } from '@/lib/queries/announcements'
import { sharePercent } from './presentation'

/**
 * The figures the publish decision rests on.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CAVEATS ARE AS PROMINENT AS THE NUMBER
 * ---------------------------------------------------------------------------
 *
 * Three parts of the targeting cannot be counted from the content-blind views:
 * a minimum app version (no aggregate view carries a per-user app version), a
 * `web` platform target (`push_tokens.platform` only records iOS and Android),
 * and Pro granted outside the store. Each of those makes the real audience
 * *smaller* than the figure above, and a confirmation dialog that quietly
 * ignored them would overstate the reach on the one screen where the number is
 * the entire point of the screen.
 *
 * So `estimateReach` returns what it could not narrow by, and this panel prints
 * it as a list under the tiles rather than as a footnote nobody reads.
 *
 * ---------------------------------------------------------------------------
 * A FAILED ESTIMATE IS NOT A ZERO
 * ---------------------------------------------------------------------------
 *
 * When the count could not be taken, the panel says so. It never falls through
 * to an empty state, because "0 kullanıcı" and "sayılamadı" would lead an
 * operator to opposite decisions.
 */

const UNMEASURED_COPY: Readonly<Record<UnmeasuredDimension, string>> = Object.freeze({
  min_app_version: announcementMessages.reach.unmeasuredVersion,
  web_platform: announcementMessages.reach.unmeasuredWeb,
  plan_source: announcementMessages.reach.unmeasuredPlan,
})

export interface ReachPanelProps {
  reach: AnnouncementReach | null
  error: string | null
  /** Compact drops the total-accounts tile, for the confirmation dialog. */
  compact?: boolean
}

export function ReachPanel({ reach, error, compact = false }: ReachPanelProps) {
  if (error !== null) {
    return <CardError message={error} hint={announcementMessages.reach.errorHint} />
  }
  if (reach === null) {
    return <CardError message={announcementMessages.reach.error} />
  }

  const share = sharePercent(reach.targeted, reach.liveUsers)

  return (
    <div className="flex flex-col gap-3">
      <StatGrid>
        <StatTile
          label={announcementMessages.reach.targeted}
          value={formatNumber(reach.targeted)}
          hint={
            share === null
              ? announcementMessages.reach.targetedHint
              : announcementMessages.reach.share(share)
          }
          tone="primary"
        />
        {reach.withDevice === null ? null : (
          <StatTile
            label={announcementMessages.reach.withDevice}
            value={formatNumber(reach.withDevice)}
            hint={announcementMessages.reach.withDeviceHint}
            tone="info"
          />
        )}
        {compact ? null : (
          <StatTile
            label={announcementMessages.reach.liveUsers}
            value={formatNumber(reach.liveUsers)}
            hint={announcementMessages.reach.liveUsersHint}
          />
        )}
      </StatGrid>

      {reach.unmeasured.length === 0 ? null : (
        <div className="rounded-md bg-warning-soft px-3 py-2">
          <p className="bo-kicker text-warning-text">
            {announcementMessages.reach.unmeasuredTitle}
          </p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
            {reach.unmeasured.map((dimension) => (
              <li key={dimension} className="text-[12px] text-warning-text">
                {UNMEASURED_COPY[dimension]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
