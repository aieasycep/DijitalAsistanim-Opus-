import { isoInstantSchema, uuidSchema } from '@da/validation'
import { z } from 'zod'
import { rowOf } from '../http'
import { mapCalendarEvent, mapCommitment } from '../mappers'
import type {
  CalendarEventRow,
  CommitmentRow,
  EndpointContext,
  MeetingPrepBrief,
  PostMeetingNoteInput,
  PostMeetingNoteResult,
} from '../types'

const meetingPrepResponseSchema = z.object({
  eventId: uuidSchema,
  event: rowOf<CalendarEventRow>(),
  summary: z.string(),
  agenda: z.array(z.string()).default([]),
  attendees: z
    .array(
      z.object({
        email: z.string(),
        name: z.string().nullable(),
        company: z.string().nullable(),
        role: z.string().nullable(),
        isVip: z.boolean(),
        lastContactAt: isoInstantSchema.nullable(),
        recentContext: z.string().nullable(),
      }),
    )
    .default([]),
  openCommitments: z.array(rowOf<CommitmentRow>()).default([]),
  relatedThreadIds: z.array(uuidSchema).default([]),
  suggestedQuestions: z.array(z.string()).default([]),
})

const postMeetingNoteResponseSchema = z.object({
  commitments: z.array(rowOf<CommitmentRow>()).default([]),
  createdApprovalIds: z.array(uuidSchema).default([]),
})

export interface MeetingsApi {
  prep(eventId: string): Promise<MeetingPrepBrief>
  /** Turns a note into commitments and proposals — all of them pending approval. */
  postMeetingNote(input: PostMeetingNoteInput): Promise<PostMeetingNoteResult>
}

export function createMeetingsApi(ctx: EndpointContext): MeetingsApi {
  return {
    async prep(eventId) {
      const result = await ctx.http.callFunction(
        'meeting-prep',
        { eventId },
        meetingPrepResponseSchema,
        { timeoutMs: 45_000 },
      )
      return {
        eventId: result.eventId,
        event: mapCalendarEvent(result.event),
        summary: result.summary,
        agenda: result.agenda,
        attendees: result.attendees,
        openCommitments: result.openCommitments.map(mapCommitment),
        relatedThreadIds: result.relatedThreadIds,
        suggestedQuestions: result.suggestedQuestions,
      }
    },

    async postMeetingNote(input) {
      const result = await ctx.http.callFunction(
        'meeting-note',
        { eventId: input.eventId, note: input.note },
        postMeetingNoteResponseSchema,
        { retry: false, timeoutMs: 45_000 },
      )
      return {
        commitments: result.commitments.map(mapCommitment),
        createdApprovalIds: result.createdApprovalIds,
      }
    },
  }
}
