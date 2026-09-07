import { DEFAULT_TIME_ZONE, toIsoDate, type IsoDate } from '@da/domain'
import { isoDateSchema, isoInstantSchema, uuidSchema } from '@da/validation'
import { z } from 'zod'
import { rowOf } from '../http'
import { mapCalendarEvent, mapCommitment, mapReminder, mapTask } from '../mappers'
import type {
  CalendarEventRow,
  CommitmentRow,
  DayPlan,
  EndpointContext,
  PlanSuggestion,
  ReminderRow,
  TaskRow,
  WeekPlan,
} from '../types'

const freeBlockSchema = z.object({
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema,
  minutes: z.number().int().min(0),
})

const conflictSchema = z.object({
  eventIds: z.array(uuidSchema),
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema,
})

const loadSchema = z.object({
  meetingCount: z.number().int().min(0),
  meetingMinutes: z.number().int().min(0),
  longestFreeMinutes: z.number().int().min(0),
  level: z.enum(['light', 'moderate', 'heavy']),
})

const dayPlanSchema = z.object({
  date: isoDateSchema,
  events: z.array(rowOf<CalendarEventRow>()).default([]),
  tasks: z.array(rowOf<TaskRow>()).default([]),
  commitments: z.array(rowOf<CommitmentRow>()).default([]),
  reminders: z.array(rowOf<ReminderRow>()).default([]),
  freeBlocks: z.array(freeBlockSchema).default([]),
  conflicts: z.array(conflictSchema).default([]),
  load: loadSchema,
})

const weekPlanSchema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  days: z.array(dayPlanSchema).default([]),
})

const suggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(['focus_block', 'reschedule', 'buffer', 'prepare', 'decline']),
        title: z.string(),
        detail: z.string(),
        startsAt: isoInstantSchema.nullable(),
        endsAt: isoInstantSchema.nullable(),
        relatedEventId: uuidSchema.nullable(),
      }),
    )
    .default([]),
})

type DayPlanResponse = z.infer<typeof dayPlanSchema>

function toDayPlan(response: DayPlanResponse): DayPlan {
  return {
    date: response.date,
    events: response.events.map(mapCalendarEvent),
    tasks: response.tasks.map(mapTask),
    commitments: response.commitments.map(mapCommitment),
    reminders: response.reminders.map(mapReminder),
    freeBlocks: response.freeBlocks,
    conflicts: response.conflicts,
    load: response.load,
  }
}

export interface PlanApi {
  day(input?: { date?: IsoDate; timeZone?: string }): Promise<DayPlan>
  week(input?: { startDate?: IsoDate; timeZone?: string }): Promise<WeekPlan>
  suggestions(input?: { date?: IsoDate; timeZone?: string }): Promise<PlanSuggestion[]>
}

export function createPlanApi(ctx: EndpointContext): PlanApi {
  function resolve(input: { date?: IsoDate; startDate?: IsoDate; timeZone?: string }): {
    date: IsoDate
    timeZone: string
  } {
    const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE
    const date = input.date ?? input.startDate ?? toIsoDate(ctx.config.clock.now(), timeZone)
    return { date, timeZone }
  }

  return {
    async day(input = {}) {
      const { date, timeZone } = resolve(input)
      const result = await ctx.http.callFunction('plan-day', { date, timeZone }, dayPlanSchema)
      return toDayPlan(result)
    },

    async week(input = {}) {
      const { date, timeZone } = resolve(input)
      const result = await ctx.http.callFunction(
        'plan-week',
        { startDate: date, timeZone },
        weekPlanSchema,
      )
      return {
        startDate: result.startDate,
        endDate: result.endDate,
        days: result.days.map(toDayPlan),
      }
    },

    async suggestions(input = {}) {
      const { date, timeZone } = resolve(input)
      const result = await ctx.http.callFunction(
        'plan-suggestions',
        { date, timeZone },
        suggestionsSchema,
      )
      return result.suggestions
    },
  }
}
