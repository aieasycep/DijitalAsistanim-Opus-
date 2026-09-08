import { StatGrid, StatTileSkeleton } from '@/components/ui'
import {
  LoadingAnnouncement,
  PageSkeletonHeader,
  PanelSkeleton,
  privacyMessages,
} from '@/components/privacy'

/**
 * The overview's loading state.
 *
 * Shaped like the page it precedes — heading, window filter, eight tiles, then
 * the panels in the order they arrive — so nothing jumps when the queries land.
 */
export default function PrivacyLoading() {
  return (
    <div className="p-4">
      <LoadingAnnouncement />
      <PageSkeletonHeader filters={1} />

      <div className="flex flex-col gap-4" aria-hidden="true">
        <StatGrid>
          {Array.from({ length: 8 }, (_unused, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <PanelSkeleton rows={6} label={privacyMessages.deadline.section} />

        <div className="grid gap-4 xl:grid-cols-2">
          <PanelSkeleton rows={5} label={privacyMessages.breakdown.section} />
          <PanelSkeleton rows={5} label={privacyMessages.fulfilment.section} />
        </div>

        <PanelSkeleton rows={3} label={privacyMessages.deletion.section} />

        <div className="grid gap-4 xl:grid-cols-2">
          <PanelSkeleton rows={4} label={privacyMessages.deletion.eventsSection} />
          <PanelSkeleton rows={4} label={privacyMessages.deletion.marksSection} />
        </div>

        <PanelSkeleton rows={2} label={privacyMessages.retention.title} />
      </div>
    </div>
  )
}
