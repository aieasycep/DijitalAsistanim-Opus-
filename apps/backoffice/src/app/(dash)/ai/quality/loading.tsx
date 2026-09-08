import {
  LoadingAnnouncement,
  PageHeaderSkeleton,
  PanelSkeleton,
  TileGridSkeleton,
  aiMessages,
} from '@/components/ai'

/**
 * The quality page's loading state: one row of rate tiles, the draft table,
 * two trends side by side, then the briefing and capture breakdowns — the same
 * order the page itself renders them in.
 */
export default function AiQualityLoading() {
  return (
    <div className="p-4">
      <LoadingAnnouncement />
      <PageHeaderSkeleton />

      <div className="flex flex-col gap-4" aria-hidden="true">
        <TileGridSkeleton />
        <PanelSkeleton rows={5} label={aiMessages.quality.draftSection} />
        <div className="grid gap-4 xl:grid-cols-2">
          <PanelSkeleton rows={7} label={aiMessages.quality.trendSection} />
          <PanelSkeleton rows={7} label={aiMessages.quality.briefingTrendSection} />
        </div>
        <PanelSkeleton rows={4} label={aiMessages.quality.briefingSection} />
        <PanelSkeleton rows={5} label={aiMessages.quality.captureSection} />
      </div>
    </div>
  )
}
