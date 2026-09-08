import {
  LoadingAnnouncement,
  PageSkeletonHeader,
  PanelSkeleton,
  privacyMessages,
} from '@/components/privacy'

/** The queue's loading state: the same header, filter bar and table shape. */
export default function PrivacyRequestsLoading() {
  return (
    <div className="p-4">
      <LoadingAnnouncement />
      <PageSkeletonHeader filters={2} />
      <div aria-hidden="true">
        <PanelSkeleton rows={10} label={privacyMessages.queue.title} />
      </div>
    </div>
  )
}
