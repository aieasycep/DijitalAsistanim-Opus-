import {
  meetingNoteRequest,
  meetingNoteResponse,
  meetingPrepRequest,
  meetingPrepResponse,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapCalendarEvent, mapCommitment } from '../mappers'
import type {
  CalendarEventRow,
  CommitmentRow,
  EndpointContext,
  MeetingPrepBrief,
  PostMeetingNoteInput,
  PostMeetingNoteResult,
} from '../types'

/**
 * Rows the function already selected and RLS already scoped.
 *
 * The contract pins the envelope around them and leaves the rows themselves
 * permissive — adding a column must not require a contract change — so the
 * mapper is what narrows a row into a domain entity.
 */
function asRow<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

function rowsOf<T>(values: readonly Record<string, unknown>[]): T[] {
  return values as unknown as T[]
}

export interface MeetingsApi {
  prep(eventId: string): Promise<MeetingPrepBrief>
  /** Turns a note into the commitments it states, each quoted from the note. */
  postMeetingNote(input: PostMeetingNoteInput): Promise<PostMeetingNoteResult>
}

export function createMeetingsApi(ctx: EndpointContext): MeetingsApi {
  return {
    async prep(eventId) {
      const request = parseRequest(meetingPrepRequest, { eventId })
      const result = await ctx.http.callFunction('meeting-prep', request, meetingPrepResponse, {
        timeoutMs: 45_000,
      })
      return {
        eventId: result.eventId,
        event: mapCalendarEvent(asRow<CalendarEventRow>(result.event)),
        summary: result.summary,
        agenda: result.agenda,
        attendees: result.attendees,
        openCommitments: rowsOf<CommitmentRow>(result.openCommitments).map(mapCommitment),
        relatedThreadIds: result.relatedThreadIds,
        suggestedQuestions: result.suggestedQuestions,
      }
    },

    async postMeetingNote(input) {
      const request = parseRequest(meetingNoteRequest, {
        eventId: input.eventId,
        note: input.note,
      })
      // Not retried: a second attempt would race the first one's inserts, and
      // a note the user waited on is better reported than silently doubled.
      const result = await ctx.http.callFunction('meeting-note', request, meetingNoteResponse, {
        retry: false,
        timeoutMs: 45_000,
      })
      return {
        commitments: rowsOf<CommitmentRow>(result.commitments).map(mapCommitment),
        createdApprovalIds: result.createdApprovalIds,
      }
    },
  }
}
