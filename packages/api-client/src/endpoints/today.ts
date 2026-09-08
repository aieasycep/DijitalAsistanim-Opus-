import { DEFAULT_TIME_ZONE, toIsoDate, type IsoDate } from '@da/domain'
import { todayFeedRequest, todayFeedResponse } from '@da/validation'
import { parseRequest } from '../http'
import {
  mapApprovalAction,
  mapBriefing,
  mapBriefingItem,
  mapCalendarEvent,
  mapCommitment,
  mapFollowUp,
  mapInsight,
  mapLifeEvent,
} from '../mappers'
import type {
  ApprovalActionRow,
  BriefingItemRow,
  BriefingRow,
  CalendarEventRow,
  CommitmentRow,
  EndpointContext,
  FollowUpRow,
  InsightRow,
  LifeEventRow,
  TodayFeed,
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

function rowOf<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

export interface TodayApi {
  get(input?: { forDate?: IsoDate; timeZone?: string }): Promise<TodayFeed>
  /** Mark an insight done. Purely local state, so it applies immediately. */
  completeInsight(insightId: string): Promise<void>
  /** Hide an insight without completing it. */
  dismissInsight(insightId: string): Promise<void>
}

export function createTodayApi(ctx: EndpointContext): TodayApi {
  return {
    async get(input = {}) {
      const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE
      const request = parseRequest(todayFeedRequest, {
        forDate: input.forDate ?? toIsoDate(ctx.config.clock.now(), timeZone),
        timeZone,
      })
      const result = await ctx.http.callFunction('today-feed', request, todayFeedResponse)
      return {
        forDate: result.forDate,
        generatedAt: result.generatedAt,
        briefing: result.briefing ? mapBriefing(rowOf<BriefingRow>(result.briefing)) : null,
        briefingItems: rowsOf<BriefingItemRow>(result.briefingItems).map(mapBriefingItem),
        insights: rowsOf<InsightRow>(result.insights).map(mapInsight),
        events: rowsOf<CalendarEventRow>(result.events).map(mapCalendarEvent),
        commitments: rowsOf<CommitmentRow>(result.commitments).map(mapCommitment),
        followUps: rowsOf<FollowUpRow>(result.followUps).map(mapFollowUp),
        lifeEvents: rowsOf<LifeEventRow>(result.lifeEvents).map(mapLifeEvent),
        pendingApprovals: rowsOf<ApprovalActionRow>(result.pendingApprovals).map(mapApprovalAction),
      }
    },

    // Both write through RLS rather than an edge function: completing or
    // hiding an insight has no effect outside the app, so it needs no approval
    // and no server-side reasoning.
    async completeInsight(insightId) {
      await ctx.db.updateOne('insights', insightId, {
        completed_at: ctx.config.clock.now().toISOString(),
      })
    },

    async dismissInsight(insightId) {
      await ctx.db.updateOne('insights', insightId, {
        dismissed_at: ctx.config.clock.now().toISOString(),
      })
    },
  }
}
