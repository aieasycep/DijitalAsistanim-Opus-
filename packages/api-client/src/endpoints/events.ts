import type { CalendarEvent, IsoDate } from '@da/domain'
import { mapCalendarEvent } from '../mappers'
import type { CalendarEventRow, EndpointContext } from '../types'

export interface EventsApi {
  /** Events overlapping a local date range, ordered by start. */
  list(range: { from: IsoDate; to: IsoDate }): Promise<CalendarEvent[]>
  get(eventId: string): Promise<CalendarEvent | null>
}

/**
 * Calendar reads.
 *
 * Straight table reads under RLS: a calendar event is the user's own row, and
 * nothing here can change it. Every write to a calendar goes through the
 * approval executor instead, which is why this module has no update method.
 */
export function createEventsApi(ctx: EndpointContext): EventsApi {
  return {
    async list(range) {
      const rows = await ctx.db.selectMany<CalendarEventRow>('calendar_events', {
        filters: [
          // A day boundary in the user's zone is resolved by the caller; the
          // range is inclusive of anything that has not finished yet.
          { column: 'ends_at', op: 'gte', value: `${range.from}T00:00:00Z` },
          { column: 'starts_at', op: 'lte', value: `${range.to}T23:59:59Z` },
        ],
        order: { column: 'starts_at', ascending: true },
        limit: 500,
      })
      return rows.map(mapCalendarEvent)
    },

    async get(eventId) {
      const row = await ctx.db.selectOne<CalendarEventRow>('calendar_events', {
        filters: [{ column: 'id', op: 'eq', value: eventId }],
      })
      return row ? mapCalendarEvent(row) : null
    },
  }
}
