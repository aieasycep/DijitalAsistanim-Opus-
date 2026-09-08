import { DEFAULT_TIME_ZONE, toIsoDate, type IsoDate } from '@da/domain'
import {
  planDayRequest,
  planDayResponse,
  planSuggestionsRequest,
  planSuggestionsResponse,
  planWeekRequest,
  planWeekResponse,
  type PlanDayResponse,
  type PlanSuggestion,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapCalendarEvent, mapCommitment, mapReminder, mapTask } from '../mappers'
import type {
  CalendarEventRow,
  CommitmentRow,
  DayPlan,
  EndpointContext,
  ReminderRow,
  TaskRow,
  WeekPlan,
} from '../types'

/**
 * Rows the function already selected and RLS already scoped.
 *
 * The contract pins the envelope around them and leaves the rows themselves
 * permissive — adding a column must not require a contract change — so the
 * mapper is what narrows a row into a domain entity.
 */
function rowsOf<T>(values: readonly Record<string, unknown>[]): T[] {
  return values as unknown as T[]
}

function toDayPlan(response: PlanDayResponse): DayPlan {
  return {
    date: response.date,
    events: rowsOf<CalendarEventRow>(response.events).map(mapCalendarEvent),
    tasks: rowsOf<TaskRow>(response.tasks).map(mapTask),
    commitments: rowsOf<CommitmentRow>(response.commitments).map(mapCommitment),
    reminders: rowsOf<ReminderRow>(response.reminders).map(mapReminder),
    freeBlocks: response.freeBlocks,
    conflicts: response.conflicts,
    load: response.load,
  }
}

export interface PlanDayInput {
  date?: IsoDate
  timeZone?: string
}

export interface PlanWeekInput {
  /** Any date inside the wanted week; the function snaps it to the Monday. */
  startDate?: IsoDate
  timeZone?: string
}

export interface PlanSuggestionsInput {
  date?: IsoDate
  timeZone?: string
  /** How long a focus block to look for. The function defaults it to 90. */
  desiredMinutes?: number
}

export interface PlanApi {
  day(input?: PlanDayInput): Promise<DayPlan>
  week(input?: PlanWeekInput): Promise<WeekPlan>
  suggestions(input?: PlanSuggestionsInput): Promise<PlanSuggestion[]>
}

export function createPlanApi(ctx: EndpointContext): PlanApi {
  /** Today in the zone the caller asked for, from the injected clock. */
  function resolve(timeZone: string | undefined): { date: IsoDate; timeZone: string } {
    const zone = timeZone ?? DEFAULT_TIME_ZONE
    return { date: toIsoDate(ctx.config.clock.now(), zone), timeZone: zone }
  }

  return {
    async day(input = {}) {
      const today = resolve(input.timeZone)
      const request = parseRequest(planDayRequest, {
        date: input.date ?? today.date,
        timeZone: today.timeZone,
      })
      const result = await ctx.http.callFunction('plan-day', request, planDayResponse)
      return toDayPlan(result)
    },

    async week(input = {}) {
      const today = resolve(input.timeZone)
      const request = parseRequest(planWeekRequest, {
        startDate: input.startDate ?? today.date,
        timeZone: today.timeZone,
      })
      const result = await ctx.http.callFunction('plan-week', request, planWeekResponse)
      return {
        startDate: result.startDate,
        endDate: result.endDate,
        days: result.days.map(toDayPlan),
      }
    },

    async suggestions(input = {}) {
      const today = resolve(input.timeZone)
      const request = parseRequest(planSuggestionsRequest, {
        date: input.date ?? today.date,
        timeZone: today.timeZone,
        ...(input.desiredMinutes === undefined ? {} : { desiredMinutes: input.desiredMinutes }),
      })
      const result = await ctx.http.callFunction(
        'plan-suggestions',
        request,
        planSuggestionsResponse,
      )
      return result.suggestions
    },
  }
}
