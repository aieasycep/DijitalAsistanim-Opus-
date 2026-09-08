import {
  LoadingAnnouncement,
  PageSkeletonHeader,
  PanelSkeleton,
  TableSkeleton,
  auditMessages,
} from '@/components/audit'

/**
 * The breakdown's loading state.
 *
 * This page fans out to one exact count per action token, so it is the slowest
 * screen in the area and the one where a skeleton earns its keep: the shape it
 * draws is the shape that arrives.
 */
export default function AuditBreakdownLoading() {
  return (
    <div className="p-4">
      <LoadingAnnouncement />
      <PageSkeletonHeader filterBars={2} />

      <div className="flex flex-col gap-4" aria-hidden="true">
        <TableSkeleton rows={10} />

        <div className="grid gap-4 xl:grid-cols-3">
          <PanelSkeleton rows={5} label={auditMessages.breakdown.groupColumn} />
          <PanelSkeleton rows={5} label={auditMessages.breakdown.actorSection} />
          <PanelSkeleton rows={3} label={auditMessages.breakdown.outcomeSection} />
        </div>
      </div>
    </div>
  )
}
