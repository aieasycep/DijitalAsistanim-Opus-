import { Card, CardSkeleton, StatGrid, StatTileSkeleton } from '@/components/ui'
import { announcementMessages } from '@/lib/messages/announcements'

/**
 * The route-level loading states.
 *
 * Same rhythm as the loaded page — five tiles, a filter row, a table — so
 * nothing shifts under the cursor when the queries land. `role="status"` and a
 * visually hidden sentence, because a screen reader gets nothing at all from a
 * grid of grey rectangles.
 */

function SkeletonLine({ width, height = 'h-3' }: { width: string; height?: string }) {
  return <span aria-hidden="true" className={`bo-skeleton block ${height}`} style={{ width }} />
}

export function AnnouncementListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        {announcementMessages.list.title}
      </span>

      <div className="flex flex-col gap-2">
        <SkeletonLine width="14rem" height="h-5" />
        <SkeletonLine width="32rem" />
      </div>

      <StatGrid>
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </StatGrid>

      <div className="bo-panel flex flex-col gap-3 p-4">
        {Array.from({ length: 8 }, (_, index) => (
          <SkeletonLine key={index} width={`${95 - index * 4}%`} />
        ))}
      </div>
    </div>
  )
}

export function AnnouncementDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        {announcementMessages.detail.kicker}
      </span>

      <div className="flex flex-col gap-2">
        <SkeletonLine width="10rem" height="h-5" />
        <SkeletonLine width="26rem" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={announcementMessages.preview.title}>
          <CardSkeleton lines={4} />
        </Card>
        <Card title={announcementMessages.targeting.title}>
          <CardSkeleton lines={4} />
        </Card>
      </div>

      <Card title={announcementMessages.reach.title}>
        <CardSkeleton lines={2} />
      </Card>
    </div>
  )
}

export function AnnouncementFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        {announcementMessages.form.newTitle}
      </span>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="bo-panel flex flex-col gap-4 p-4">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <SkeletonLine width="6rem" height="h-2" />
              <SkeletonLine width="100%" height="h-7" />
            </div>
          ))}
        </div>
        <div className="bo-panel flex flex-col gap-3 p-4">
          <SkeletonLine width="8rem" height="h-3" />
          <SkeletonLine width="100%" height="h-24" />
          <SkeletonLine width="100%" height="h-24" />
        </div>
      </div>
    </div>
  )
}
