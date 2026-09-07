import { DEFAULT_TIME_ZONE, toIsoDate, type IsoDate } from '@da/domain'
import { isoDateSchema, isoInstantSchema } from '@da/validation'
import { z } from 'zod'
import { rowOf } from '../http'
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

const todayResponseSchema = z.object({
  forDate: isoDateSchema,
  generatedAt: isoInstantSchema,
  briefing: rowOf<BriefingRow>().nullable(),
  briefingItems: z.array(rowOf<BriefingItemRow>()).default([]),
  insights: z.array(rowOf<InsightRow>()).default([]),
  events: z.array(rowOf<CalendarEventRow>()).default([]),
  commitments: z.array(rowOf<CommitmentRow>()).default([]),
  followUps: z.array(rowOf<FollowUpRow>()).default([]),
  lifeEvents: z.array(rowOf<LifeEventRow>()).default([]),
  pendingApprovals: z.array(rowOf<ApprovalActionRow>()).default([]),
})

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
      const forDate = input.forDate ?? toIsoDate(ctx.config.clock.now(), timeZone)
      const result = await ctx.http.callFunction(
        'today-feed',
        { forDate, timeZone },
        todayResponseSchema,
      )
      return {
        forDate: result.forDate,
        generatedAt: result.generatedAt,
        briefing: result.briefing ? mapBriefing(result.briefing) : null,
        briefingItems: result.briefingItems.map(mapBriefingItem),
        insights: result.insights.map(mapInsight),
        events: result.events.map(mapCalendarEvent),
        commitments: result.commitments.map(mapCommitment),
        followUps: result.followUps.map(mapFollowUp),
        lifeEvents: result.lifeEvents.map(mapLifeEvent),
        pendingApprovals: result.pendingApprovals.map(mapApprovalAction),
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
