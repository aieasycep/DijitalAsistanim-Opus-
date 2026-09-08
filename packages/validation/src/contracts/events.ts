import type { CalendarEvent, EventAttendee } from '@da/domain'
import { z } from 'zod'
import { isoDateSchema, timeZoneSchema, uuidSchema } from '../primitives.ts'

/**
 * The `events` group — the calendar reads behind `api.events`.
 *
 * This group has no edge function, and that is deliberate: a calendar event is
 * the user's own row, nothing in the app may change it (every calendar write
 * goes through the approval executor), so listing one and opening one are
 * PostgREST reads under RLS. There is no JSON envelope between two
 * hand-written definitions here, and inventing one would pin nothing.
 *
 * The two halves of this boundary that *did* drift are pinned instead:
 *
 *  1. **The query.** `eventsListRequest` carries the two local dates *and the
 *     zone they are local to*. The client used to take the dates alone and
 *     append a literal `Z`, so in Europe/Istanbul the window ran 03:00 to
 *     02:59 the next morning: an event that ended at 01:00 on the first day
 *     was missing, and one that started at 01:00 the morning after the last
 *     day was included. A day boundary is not a property of a date, so the
 *     zone is part of the request rather than something the reader assumes.
 *
 *  2. **The one field the migration does not pin.** `calendar_events.attendees`
 *     is `jsonb`; migration 0004 checks that it is an array and stops there, so
 *     the *nesting inside the row* is exactly the kind of thing these contracts
 *     exist for. Every writer — the Google sync, the Microsoft sync, the
 *     approval executor and the demo seed — stores the domain `EventAttendee`
 *     verbatim, in camelCase. The API client's row type had guessed snake_case
 *     (`response_status`, `is_organizer`, `is_self`), so every attendee reached
 *     the app with those three fields `undefined`: the user appeared in their
 *     own attendee list, nobody was ever the organizer, and the RSVP badge
 *     looked its label up under the key `undefined` — which crashes the event
 *     screen outright, since a missing key is `t(undefined)`. The domain name
 *     wins, because the writers already speak it.
 *
 * Rows themselves stay permissive elsewhere, as `common.ts` sets out. The
 * exception here is earned: `attendees` is free-form provider JSON rather than
 * a set of columns, so nothing upstream of this schema checks it at all.
 */

// ── Statuses ────────────────────────────────────────────────────────────────

/** The `calendar_events.status` check constraint, as the domain names it. */
export const CALENDAR_EVENT_STATUSES = ['confirmed', 'tentative', 'cancelled'] as const

export const calendarEventStatus = z.enum(CALENDAR_EVENT_STATUSES) satisfies z.ZodType<
  CalendarEvent['status']
>

export type CalendarEventStatus = z.infer<typeof calendarEventStatus>

/**
 * How an invitee answered.
 *
 * The providers are mapped onto this set at sync time — Graph's `response` and
 * Google's `responseStatus` both land here — so an unanswered invitation is
 * `needs_action` and never an absent field.
 */
export const EVENT_RESPONSE_STATUSES = [
  'accepted',
  'declined',
  'tentative',
  'needs_action',
] as const

export const eventResponseStatus = z.enum(EVENT_RESPONSE_STATUSES) satisfies z.ZodType<
  EventAttendee['responseStatus']
>

export type EventResponseStatus = z.infer<typeof eventResponseStatus>

// ── The attendees array inside a calendar_events row ─────────────────────────

/**
 * One invitee, as the syncs and the executor store it.
 *
 * Every field falls back rather than failing, because the value being parsed is
 * provider JSON that was written months ago by a build that no longer exists: a
 * Graph resource invitee has no address at all (the sync stores `''`), and the
 * demo seed predates `isSelf`. A meeting that cannot be opened is a worse
 * outcome than an invitee shown as unanswered, so the fallbacks are the same
 * ones the writers use for a field the provider omitted.
 */
export const eventAttendee = z.object({
  email: z.string().max(320).catch(''),
  name: z.string().max(200).nullable().catch(null),
  responseStatus: eventResponseStatus.catch('needs_action'),
  isOrganizer: z.boolean().catch(false),
  isSelf: z.boolean().catch(false),
}) satisfies z.ZodType<EventAttendee, z.ZodTypeDef, unknown>

/**
 * The stored array.
 *
 * An entry that is not an object at all is dropped instead of failing the
 * event: one malformed invitee must not make a meeting unopenable, and the
 * count the screen shows is then the count of invitees it can actually name.
 */
export const eventAttendees = z
  .array(z.unknown())
  .catch([])
  .transform((values) =>
    values.flatMap((value) => {
      const parsed = eventAttendee.safeParse(value)
      return parsed.success ? [parsed.data] : []
    }),
  ) satisfies z.ZodType<EventAttendee[], z.ZodTypeDef, unknown>

// ── events.list ─────────────────────────────────────────────────────────────

/**
 * An inclusive local-date window, and the zone its boundaries are read in.
 *
 * Inclusive on both ends: `from` and `to` are days the caller wants back, not a
 * half-open range, which is why a single day is `{ from: d, to: d }`.
 */
export const eventsListRequest = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    timeZone: timeZoneSchema,
  })
  .refine((range) => range.to >= range.from, {
    message: 'The end of the range must not precede its start',
    path: ['to'],
  })

export type EventsListRequest = z.infer<typeof eventsListRequest>

/**
 * A cancelled event is not on your calendar.
 *
 * `plan-day`, `plan-week` and `today-feed` all drop it server-side and the demo
 * client drops it too; the live list was the only reader that kept it, so the
 * same day showed one set of meetings on the plan screen and another through
 * `events.list`. Opening a cancelled event by id still works — a notification
 * deep link written before the cancellation has to land somewhere.
 */
export const LISTED_EVENT_STATUSES = [
  'confirmed',
  'tentative',
] as const satisfies readonly CalendarEventStatus[]

// ── events.get ──────────────────────────────────────────────────────────────

/** `calendar_events.id`, not the provider's `external_event_id`. */
export const eventsGetRequest = z.object({ eventId: uuidSchema })

export type EventsGetRequest = z.infer<typeof eventsGetRequest>
