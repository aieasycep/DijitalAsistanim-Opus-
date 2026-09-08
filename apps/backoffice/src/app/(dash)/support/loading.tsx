import { QueueSkeleton } from '@/components/tickets'

/**
 * The queue's route-level loading state.
 *
 * Four tiles, a filter bar and a table, in the same rhythm the loaded page
 * has, so nothing shifts under the cursor when the queries land.
 */
export default function SupportQueueLoading() {
  return <QueueSkeleton />
}
