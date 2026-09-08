import {
  DEFAULT_TIME_ZONE,
  endOfLocalDay,
  zonedTimeToUtc,
  type CalendarEvent,
  type IsoDate,
} from '@da/domain'
import {
  eventAttendees,
  eventsGetRequest,
  eventsListRequest,
  LISTED_EVENT_STATUSES,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapCalendarEvent } from '../mappers'
import type { CalendarEventRow, EndpointContext } from '../types'

export interface EventsListInput {
  /** First local day of the window, inclusive. */
  from: IsoDate
  /** Last local day of the window, inclusive. */
  to: IsoDate
  /** The zone those two days are read in. Defaults to the app's own zone. */
  timeZone?: string
}

export interface EventsApi {
  /** Events overlapping a local date range, ordered by start. */
  list(range: EventsListInput): Promise<CalendarEvent[]>
  get(eventId: string): Promise<CalendarEvent | null>
}

/**
 * Midnight that opens `date` in `timeZone`, as a UTC instant.
 *
 * `zonedTimeToUtc` settles the DST cases: on a spring-forward morning the day
 * opens at the first instant that exists, not at an hour the zone skipped.
 */
function localDayStart(date: IsoDate, timeZone: string): Date {
  // `eventsListRequest` has already established `YYYY-MM-DD`, so the slices are
  // exact and there is no partial date to defend against here.
  return zonedTimeToUtc(
    {
      year: Number(date.slice(0, 4)),
      month: Number(date.slice(5, 7)),
      day: Number(date.slice(8, 10)),
      hour: 0,
      minute: 0,
    },
    timeZone,
  )
}

/**
 * The domain entity, with the attendees the row actually stores.
 *
 * `mapCalendarEvent` reads `attendees` through a hand-written snake_case row
 * type that no writer has ever produced — the column is provider JSON holding
 * the camelCase domain shape — so the contract parses that array and its
 * result replaces the mapper's guess. Everything else in the row is real
 * columns, pinned by the migration, and the mapper is right about them.
 */
function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return { ...mapCalendarEvent(row), attendees: eventAttendees.parse(row.attendees) }
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
      const request = parseRequest(eventsListRequest, {
        from: range.from,
        to: range.to,
        timeZone: range.timeZone ?? DEFAULT_TIME_ZONE,
      })
      // The window is inclusive of anything that has not finished before the
      // first day opens and has already begun by the time the last day closes.
      const opensAt = localDayStart(request.from, request.timeZone)
      const closesAt = endOfLocalDay(localDayStart(request.to, request.timeZone), request.timeZone)

      const rows = await ctx.db.selectMany<CalendarEventRow>('calendar_events', {
        filters: [
          { column: 'ends_at', op: 'gte', value: opensAt.toISOString() },
          { column: 'starts_at', op: 'lte', value: closesAt.toISOString() },
        ],
        inFilter: { column: 'status', values: LISTED_EVENT_STATUSES },
        order: { column: 'starts_at', ascending: true },
        limit: 500,
      })
      return rows.map(toCalendarEvent)
    },

    async get(eventId) {
      const request = parseRequest(eventsGetRequest, { eventId })
      const row = await ctx.db.selectOne<CalendarEventRow>('calendar_events', {
        filters: [{ column: 'id', op: 'eq', value: request.eventId }],
      })
      return row ? toCalendarEvent(row) : null
    },
  }
}
