import { StatGrid, StatTileSkeleton } from '@/components/ui'
import {
  LoadingAnnouncement,
  PageSkeletonHeader,
  PanelSkeleton,
  TableSkeleton,
  auditMessages,
} from '@/components/audit'

/**
 * The log's loading state.
 *
 * Shaped like the page it precedes — heading, the two filter bars, the access
 * receipt, four tiles, the table, the pager and the retention panel — so
 * nothing jumps when the queries land.
 */
export default function AuditLoading() {
  return (
    <div className="p-4">
      <LoadingAnnouncement />
      <PageSkeletonHeader filterBars={2} />

      <div className="flex flex-col gap-4" aria-hidden="true">
        <div className="bo-panel flex items-center gap-3 px-3 py-2">
          <span className="bo-skeleton h-2.5 w-24" />
          <span className="bo-skeleton h-4 w-56 rounded-full" />
        </div>

        <StatGrid>
          {Array.from({ length: 4 }, (_unused, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <TableSkeleton rows={12} />

        <div className="bo-panel flex items-center justify-between px-3 py-2">
          <span className="bo-skeleton h-5 w-40 rounded-md" />
          <span className="bo-skeleton h-3 w-32" />
        </div>

        <PanelSkeleton rows={5} label={auditMessages.retention.title} />
      </div>
    </div>
  )
}
