/**
 * Time-saved estimate for the weekly review.
 *
 * The number is shown to users, so the formula is deterministic, documented,
 * and deliberately conservative — it counts only work the product actually
 * removed, and it never claims credit for mail the user still opened. The
 * coefficients are stated here rather than tuned per-user so the same week's
 * data always yields the same figure.
 *
 * See `docs/AI_PIPELINE.md` for the reasoning behind each coefficient.
 */

export interface TimeSavedInput {
  /** Messages the pipeline classified without the user opening them. */
  emailsTriagedWithoutOpening: number
  /** Threads summarised and read as a summary instead of in full. */
  threadsReadAsSummary: number
  /** Replies where an AI draft was approved (edited or not). */
  draftsUsed: number
  /** Meetings the user opened a prep sheet for. */
  meetingPrepsOpened: number
  /** Follow-ups the engine surfaced that the user acted on. */
  followUpsSurfaced: number
  /** Deadlines and commitments extracted and confirmed. */
  commitmentsCaptured: number
}

/**
 * Seconds saved per unit. Each is the difference between doing the thing by
 * hand and doing it here — not the total time the task takes.
 */
export const TIME_SAVED_COEFFICIENTS = {
  /** Skimming and dismissing one unimportant message. */
  emailTriage: 12,
  /** Reading a summary rather than a whole thread. */
  threadSummary: 45,
  /** Composing a reply from scratch vs. editing a draft. */
  draft: 150,
  /** Digging up context before a meeting. */
  meetingPrep: 420,
  /** Noticing an unanswered thread yourself. */
  followUp: 90,
  /** Writing down a promise you made in an email. */
  commitment: 40,
} as const

export interface TimeSavedResult {
  totalSeconds: number
  totalMinutes: number
  breakdown: Array<{ key: keyof TimeSavedInput; seconds: number }>
}

export function estimateTimeSaved(input: TimeSavedInput): TimeSavedResult {
  const parts: Array<{ key: keyof TimeSavedInput; seconds: number }> = [
    {
      key: 'emailsTriagedWithoutOpening',
      seconds: input.emailsTriagedWithoutOpening * TIME_SAVED_COEFFICIENTS.emailTriage,
    },
    {
      key: 'threadsReadAsSummary',
      seconds: input.threadsReadAsSummary * TIME_SAVED_COEFFICIENTS.threadSummary,
    },
    { key: 'draftsUsed', seconds: input.draftsUsed * TIME_SAVED_COEFFICIENTS.draft },
    {
      key: 'meetingPrepsOpened',
      seconds: input.meetingPrepsOpened * TIME_SAVED_COEFFICIENTS.meetingPrep,
    },
    {
      key: 'followUpsSurfaced',
      seconds: input.followUpsSurfaced * TIME_SAVED_COEFFICIENTS.followUp,
    },
    {
      key: 'commitmentsCaptured',
      seconds: input.commitmentsCaptured * TIME_SAVED_COEFFICIENTS.commitment,
    },
  ]

  const totalSeconds = parts.reduce((sum, p) => sum + Math.max(0, p.seconds), 0)

  return {
    totalSeconds,
    totalMinutes: Math.round(totalSeconds / 60),
    breakdown: parts.filter((p) => p.seconds > 0).sort((a, b) => b.seconds - a.seconds),
  }
}
