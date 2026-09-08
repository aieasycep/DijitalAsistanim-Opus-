import { StatGrid, StatTileSkeleton } from '@/components/ui'
import {
  LoadingAnnouncement,
  PageSkeletonHeader,
  PanelSkeleton,
  privacyMessages,
} from '@/components/privacy'

/** The retention page's loading state: four tiles, then the two tables. */
export default function RetentionLoading() {
  return (
    <div className="p-4">
      <LoadingAnnouncement />
      <PageSkeletonHeader filters={0} />

      <div className="flex flex-col gap-4" aria-hidden="true">
        <StatGrid>
          {Array.from({ length: 4 }, (_unused, index) => (
            <StatTileSkeleton key={index} />
          ))}
        </StatGrid>

        <PanelSkeleton rows={8} label={privacyMessages.retention.tablesSection} />

        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <PanelSkeleton rows={6} label={privacyMessages.retention.runsSection} />
          <PanelSkeleton rows={4} label={privacyMessages.retention.title} />
        </div>
      </div>
    </div>
  )
}
