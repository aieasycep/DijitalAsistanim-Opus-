import { TicketDetailSkeleton } from '@/components/tickets'

/**
 * The detail page's route-level loading state, in the same two-column rhythm
 * the loaded page has, so nothing shifts when the queries land.
 */
export default function TicketDetailLoading() {
  return <TicketDetailSkeleton />
}
