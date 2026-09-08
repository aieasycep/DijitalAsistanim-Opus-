import {
  LoadingAnnouncement,
  PageHeaderSkeleton,
  PanelSkeleton,
  TileGridSkeleton,
  aiMessages,
} from '@/components/ai'

/**
 * The spend page's loading state, shaped like the page it precedes: two rows of
 * tiles, the daily table, the two breakdowns side by side, then the funnel and
 * the top-spender list. Nothing moves when the queries land.
 */
export default function AiSpendLoading() {
  return (
    <div className="p-4">
      <LoadingAnnouncement />
      <PageHeaderSkeleton />

      <div className="flex flex-col gap-4" aria-hidden="true">
        <TileGridSkeleton />
        <TileGridSkeleton />
        <PanelSkeleton rows={7} label={aiMessages.spend.dailySection} />
        <div className="grid gap-4 xl:grid-cols-2">
          <PanelSkeleton rows={4} label={aiMessages.spend.modelSection} />
          <PanelSkeleton rows={5} label={aiMessages.spend.operationSection} />
        </div>
        <PanelSkeleton rows={6} label={aiMessages.triage.section} />
        <PanelSkeleton rows={6} label={aiMessages.spend.topSection} />
      </div>
    </div>
  )
}
