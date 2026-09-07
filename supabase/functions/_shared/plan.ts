import type { TimedEvent } from './domain.ts'

/** A calendar_events row, in the shape the plan helpers actually read. */
export interface CalendarEventRow {
  id: string
  title: string | null
  starts_at: string
  ends_at: string
  is_all_day: boolean | null
  location: string | null
  attendees: unknown
}

/**
 * Map database rows to the `TimedEvent` shape the calendar-intelligence
 * functions expect. Kept here rather than inlined in each function so free
 * blocks, conflicts and day-load all read the same fields the same way.
 */
export function toTimedEvents(rows: readonly CalendarEventRow[]): TimedEvent[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? '',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: Boolean(row.is_all_day),
    location: row.location,
    attendeeCount: Array.isArray(row.attendees) ? row.attendees.length : 0,
  }))
}
