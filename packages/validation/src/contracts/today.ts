import { z } from 'zod'
import { isoDateSchema, isoInstantSchema, timeZoneSchema } from '../primitives.ts'
import { rowSchema, rowsSchema } from './common.ts'

/**
 * The `today` group — `today-feed`, the one request the home screen makes.
 *
 * Three decisions are worth stating:
 *
 *  1. **`forDate` stays `forDate` here.** The `plan` group renamed its request
 *     field to `date` because nothing in a plan is stored under `for_date` and
 *     the column name only misled the reader. Today is the opposite case: the
 *     day *is* a stored column (`briefings.for_date`, `insights.for_date`) and
 *     the function filters both tables by it, so the wire name is the column
 *     name. Both sides already agreed on it, so nothing had to move.
 *
 *  2. **The envelope is pinned, the rows are not.** Every list is a
 *     `rowsSchema`, so adding a column to `insights` is not a contract change;
 *     what is pinned is that `followUps` is called `followUps` and sits at the
 *     top level. That is the half that drifts.
 *
 *  3. **One round trip, one envelope.** Today is the first screen after a cold
 *     start, so its eight lists arrive together rather than as eight requests.
 *     That makes the envelope wide, which is exactly why it needs pinning: a
 *     renamed key here is a whole section of the home screen rendering empty.
 */

/**
 * The day to build the feed for, and the zone its boundaries are computed in.
 *
 * Both optional: the function falls back to the caller's profile zone and to
 * today in it. The date is not merely echoed — it anchors the local-day window
 * that scopes events, reminders, follow-ups and approvals, so asking for
 * yesterday returns yesterday's day rather than yesterday's briefing wrapped
 * around today's calendar.
 */
export const todayFeedRequest = z.object({
  forDate: isoDateSchema.optional(),
  timeZone: timeZoneSchema.optional(),
})

export type TodayFeedRequest = z.infer<typeof todayFeedRequest>

export const todayFeedResponse = z.object({
  forDate: isoDateSchema,
  /**
   * When the server assembled this feed. The home-screen widget compares it
   * against the snapshot it last wrote, so it must be an instant the server
   * produced and never one the device guessed.
   */
  generatedAt: isoInstantSchema,
  /** The most recent briefing for the day, or null before one is generated. */
  briefing: rowSchema.nullable(),
  /** Empty whenever `briefing` is null — the items belong to that briefing. */
  briefingItems: rowsSchema,
  insights: rowsSchema,
  events: rowsSchema,
  commitments: rowsSchema,
  /**
   * Threads still waiting on someone else — `waiting` *and* `nudged`.
   *
   * Drafting a nudge moves the row to `nudged`, so a feed that carried only
   * `waiting` made the card vanish the moment the user acted on it. The
   * follow-ups list endpoint already spans both statuses; this one now agrees.
   */
  followUps: rowsSchema,
  lifeEvents: rowsSchema,
  pendingApprovals: rowsSchema,
})

export type TodayFeedResponse = z.infer<typeof todayFeedResponse>
