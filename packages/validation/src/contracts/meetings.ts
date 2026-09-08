import { z } from 'zod'
import { isoInstantSchema, uuidSchema } from '../primitives.ts'
import { rowSchema, rowsSchema } from './common.ts'

/**
 * The `meetings` group — `meeting-prep` and `meeting-note`.
 *
 * This group is where the two-definitions problem was at its worst, so three
 * decisions are worth stating:
 *
 *  1. **The screen decides the envelope.** `meeting-prep` used to answer with
 *     `{ prep, sources, generated }` — the model's raw output next to the raw
 *     material it was given — while the client required
 *     `{ eventId, event, summary, agenda, attendees, openCommitments,
 *     relatedThreadIds, suggestedQuestions }`. Nothing overlapped, so every
 *     "Hazırla" ended on a permanent error screen. The client's shape is the
 *     one `app/meeting/[id]/index.tsx` actually renders, section for section,
 *     and it is the one pinned here: the function now assembles the brief
 *     instead of shipping its own working notes.
 *
 *  2. **A brief is assembled, not transcribed.** The model contributes exactly
 *     two things — the two-minute paragraph and the points worth raising. The
 *     agenda comes from the invite, the attendees from `contacts`, the open
 *     items from `commitments` rows and the threads from `email_threads`, so
 *     each of them can be opened by the reader. That is why `openCommitments`
 *     is a row array rather than the model's `userOwes` sentences: a promise
 *     the user can tap through to is worth more than a re-typed one.
 *
 *  3. **A note produces promises, not a proposal.** `meeting-note` used to
 *     return one unsaved `proposedCommitment` and the client's schema, whose
 *     `commitments` array defaults to empty, accepted it happily — so the
 *     extraction "succeeded" and the screen said "Aksiyon çıkmadı" every
 *     single time. The note now writes the commitments it can quote and
 *     returns the stored rows, which is what the screen links to and what the
 *     demo client has always done.
 */

// ── meeting-prep ────────────────────────────────────────────────────────────

/** `calendar_events.id`, not the provider's `external_event_id`. */
export const meetingPrepRequest = z.object({ eventId: uuidSchema })

export type MeetingPrepRequest = z.infer<typeof meetingPrepRequest>

/**
 * One person on the invite, with everything the app already knows about them.
 *
 * Every field except the address is nullable, because the whole point of the
 * section is to distinguish "we know this person" from "we do not": a null
 * `lastContactAt` is what makes the screen show the first-meeting badge, and
 * inventing a value for it would turn a stranger into a regular.
 */
export const meetingPrepAttendee = z.object({
  email: z.string().max(320),
  name: z.string().max(200).nullable(),
  company: z.string().max(200).nullable(),
  role: z.string().max(200).nullable(),
  isVip: z.boolean(),
  lastContactAt: isoInstantSchema.nullable(),
  /** The summary of the most recent thread with them. Never model prose. */
  recentContext: z.string().max(1000).nullable(),
})

export type MeetingPrepAttendee = z.infer<typeof meetingPrepAttendee>

export const meetingPrepResponse = z.object({
  eventId: uuidSchema,
  /** The full `calendar_events` row: the header needs title, start and end. */
  event: rowSchema,
  /**
   * The two-minute paragraph, in the user's language.
   *
   * Empty when no model is configured, and the screen renders
   * `meeting.unavailable` in its place rather than an empty card under an
   * "AI generated" badge — an honest gap beats a confident blank.
   */
  summary: z.string().max(1200),
  /** Read off the invite's own list markers; empty when it has none. */
  agenda: z.array(z.string().max(300)).default([]),
  attendees: z.array(meetingPrepAttendee).default([]),
  /** Open `commitments` rows with these people, so each one can be opened. */
  openCommitments: rowsSchema,
  /** `email_threads.id`s the screen links to. */
  relatedThreadIds: z.array(uuidSchema).default([]),
  suggestedQuestions: z.array(z.string().max(300)).default([]),
})

export type MeetingPrepResponse = z.infer<typeof meetingPrepResponse>

// ── meeting-note ────────────────────────────────────────────────────────────

export const meetingNoteRequest = z.object({
  eventId: uuidSchema,
  /** What the user typed or dictated after the meeting. */
  note: z.string().min(1).max(4000),
})

export type MeetingNoteRequest = z.infer<typeof meetingNoteRequest>

export const meetingNoteResponse = z.object({
  /**
   * The stored `commitments` rows, in the order the note states them.
   *
   * Stored, not proposed: the screen opens each one at `/commitment/:id`, so a
   * row without an id is a card that cannot be tapped. Re-running the same
   * note returns the same rows — `commitments_user_source_quote_key` makes a
   * quoted sentence unique per source, and the function reuses what is already
   * there instead of cloning the promise.
   */
  commitments: rowsSchema,
  /**
   * Approvals the note created.
   *
   * Recording a promise and storing the note both stay inside the app, so
   * neither needs one; anything that would leave — a summary mail, a follow-up
   * invitation — reaches the user as an approval and its id is carried here
   * rather than acted on behind their back.
   */
  createdApprovalIds: z.array(uuidSchema).default([]),
})

export type MeetingNoteResponse = z.infer<typeof meetingNoteResponse>
