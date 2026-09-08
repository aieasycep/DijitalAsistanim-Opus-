import {
  LoadingAnnouncement,
  PageHeaderSkeleton,
  PanelSkeleton,
  TileGridSkeleton,
  aiMessages,
} from '@/components/ai'

/**
 * The ceiling page's loading state: four summary tiles and then the account
 * table, twenty rows deep — the page size the query actually asks for, so the
 * panel does not shrink when the rows arrive.
 */
export default function AiCeilingLoading() {
  return (
    <div className="p-4">
      <LoadingAnnouncement />
      <PageHeaderSkeleton />

      <div className="flex flex-col gap-4" aria-hidden="true">
        <TileGridSkeleton />
        <PanelSkeleton rows={12} label={aiMessages.ceiling.tableSection} />
      </div>
    </div>
  )
}
