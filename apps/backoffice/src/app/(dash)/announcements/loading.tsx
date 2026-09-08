import { AnnouncementListSkeleton } from '@/components/announcements'

/**
 * The list's route-level loading state.
 *
 * Five tiles, a filter row and a table, in the same rhythm the loaded page has,
 * so nothing shifts under the cursor when the queries land.
 */
export default function AnnouncementsLoading() {
  return <AnnouncementListSkeleton />
}
