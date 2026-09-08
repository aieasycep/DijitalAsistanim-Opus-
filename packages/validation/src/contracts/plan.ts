import type { CalendarConflict, DayLoad, FreeBlock } from '@da/domain'
import { z } from 'zod'
import { isoDateSchema, isoInstantSchema, timeZoneSchema, uuidSchema } from '../primitives.ts'
import { rowsSchema } from './common.ts'

/**
 * The `plan` group — `plan-day`, `plan-week` and `plan-suggestions`.
 *
 * Three decisions here are worth stating, because every other group faces the
 * same three:
 *
 *  1. **The domain names win.** `summarizeDayLoad` and `detectConflicts` in
 *     `@da/domain` produce the analysis; the wire carries their fields under
 *     their own names. Where the client had guessed differently
 *     (`meetingMinutes` for `bookedMinutes`, `longestFreeMinutes` for
 *     `longestFreeBlockMinutes`, a conflict as a bare time range) the client
 *     was wrong and was corrected. `satisfies z.ZodType<…>` below turns that
 *     agreement into a compile error rather than a convention.
 *
 *  2. **A week is a list of days.** `planWeekResponse.days` is an array of
 *     `planDayResponse`, so the screen can render either range through one
 *     code path — which is exactly what `app/(tabs)/plan.tsx` does. That only
 *     holds if a day plan means the same thing in both ranges, so a day's
 *     tasks, commitments and reminders are the ones *dated within that day*.
 *     The outstanding backlog is a different question with its own endpoint.
 *
 *  3. **No user-facing sentence crosses the wire.** A conflict and a
 *     suggestion travel as an i18n key plus its values, so the app renders
 *     them in the reader's language and the server never ships a string it
 *     would have to translate.
 */

/**
 * Values interpolated into an i18n message — the wire form of `MessageValues`
 * in `@da/i18n`. Kept structural rather than imported so `@da/validation` does
 * not depend on the catalogue.
 */
const messageValuesSchema = z.record(z.string(), z.union([z.string(), z.number()]))

/** A gap on the calendar, as `findFreeBlocks` reports it. */
export const planFreeBlock = z.object({
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema,
  minutes: z.number().int().min(0),
}) satisfies z.ZodType<FreeBlock>

export type PlanFreeBlock = z.infer<typeof planFreeBlock>

/**
 * A collision on the calendar, as `detectConflicts` reports it.
 *
 * `messageKey` resolves against `calendar.conflict.*` and `values` fills its
 * placeholders, which is why the conflict names the two meetings involved
 * instead of saying "you have a clash".
 */
export const planConflict = z.object({
  kind: z.enum(['overlap', 'back_to_back', 'no_prep_time', 'location_change']),
  eventIds: z.array(uuidSchema).min(1),
  /** Minutes of overlap, or minutes of gap for the non-overlap kinds. */
  minutes: z.number().int(),
  messageKey: z.string().min(1),
  values: messageValuesSchema,
}) satisfies z.ZodType<CalendarConflict>

export type PlanConflict = z.infer<typeof planConflict>

/** The shape of a day, as `summarizeDayLoad` reports it. */
export const planDayLoad = z.object({
  /** Total booked minutes, overlaps counted once. */
  bookedMinutes: z.number().int().min(0),
  meetingCount: z.number().int().min(0),
  longestFreeBlockMinutes: z.number().int().min(0),
  backToBackRuns: z.number().int().min(0),
  level: z.enum(['light', 'moderate', 'heavy']),
}) satisfies z.ZodType<DayLoad>

export type PlanDayLoad = z.infer<typeof planDayLoad>

export const PLAN_SUGGESTION_KINDS = [
  'focus_block',
  'reschedule',
  'buffer',
  'prepare',
  'decline',
] as const

/**
 * One proposal on the plan screen.
 *
 * A suggestion is an observation until it has a start and an end; only then
 * can the screen offer to turn it into an approval, which is why the instants
 * are nullable rather than absent.
 */
export const planSuggestion = z.object({
  /**
   * Stable across refetches: it is the React key, the end-to-end test id, and
   * the half of the approval's idempotency key that says which suggestion was
   * acted on — so a double tap reuses one approval instead of stacking two.
   */
  id: z.string().min(1).max(200),
  kind: z.enum(PLAN_SUGGESTION_KINDS),
  /** Resolves against `plan.suggestion.*`. */
  messageKey: z.string().min(1),
  values: messageValuesSchema,
  startsAt: isoInstantSchema.nullable(),
  endsAt: isoInstantSchema.nullable(),
  minutes: z.number().int().min(0).nullable(),
  relatedEventId: uuidSchema.nullable(),
})

export type PlanSuggestion = z.infer<typeof planSuggestion>

// ── plan-day ────────────────────────────────────────────────────────────────

/**
 * The day to plan, and the zone its boundaries are computed in. Both optional:
 * the function falls back to the caller's profile zone and to today in it.
 *
 * The field is `date`, not `forDate`. `forDate` is the name of a *column*
 * (`insights.for_date`, `briefings.for_date`); nothing here is stored, so the
 * column name only ever misled the reader — and the client, the query keys and
 * both screens already spoke `date`.
 */
export const planDayRequest = z.object({
  date: isoDateSchema.optional(),
  timeZone: timeZoneSchema.optional(),
})

export type PlanDayRequest = z.infer<typeof planDayRequest>

export const planDayResponse = z.object({
  date: isoDateSchema,
  events: rowsSchema,
  tasks: rowsSchema,
  commitments: rowsSchema,
  reminders: rowsSchema,
  freeBlocks: z.array(planFreeBlock).default([]),
  conflicts: z.array(planConflict).default([]),
  load: planDayLoad,
})

export type PlanDayResponse = z.infer<typeof planDayResponse>

// ── plan-week ───────────────────────────────────────────────────────────────

/** Any date inside the wanted week; the function snaps it to the Monday. */
export const planWeekRequest = z.object({
  startDate: isoDateSchema.optional(),
  timeZone: timeZoneSchema.optional(),
})

export type PlanWeekRequest = z.infer<typeof planWeekRequest>

export const planWeekResponse = z.object({
  startDate: isoDateSchema,
  /** Inclusive: the seventh day, not the exclusive boundary after it. */
  endDate: isoDateSchema,
  days: z.array(planDayResponse).default([]),
})

export type PlanWeekResponse = z.infer<typeof planWeekResponse>

// ── plan-suggestions ────────────────────────────────────────────────────────

export const planSuggestionsRequest = z.object({
  date: isoDateSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  /** How long a focus block the caller is hoping for. */
  desiredMinutes: z.number().int().min(15).max(480).default(90),
})

export type PlanSuggestionsRequest = z.infer<typeof planSuggestionsRequest>

export const planSuggestionsResponse = z.object({
  suggestions: z.array(planSuggestion).default([]),
})

export type PlanSuggestionsResponse = z.infer<typeof planSuggestionsResponse>
