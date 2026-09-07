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
  }
}
