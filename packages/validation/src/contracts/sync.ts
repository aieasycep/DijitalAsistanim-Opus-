import { z } from 'zod'
import { uuidSchema } from '../primitives.ts'

/**
 * The `sync` group — `initial-analysis` and `initial-analysis-progress`.
 *
 * `sync-start` belongs to this group by name but its contract lives in
 * `./accounts.ts`, beside the connected-account schemas it is keyed by: the
 * integrations screen is its only caller and "Şimdi eşitle" sits on the card of
 * the account it syncs. Splitting it out would have meant two files describing
 * one screen.
 *
 * Three decisions here:
 *
 *  1. **One shape, two endpoints.** The onboarding screen renders
 *     `progressQuery.data ?? start.data`, so the answer to "run the pass" and
 *     the answer to "how is the pass going" have to be interchangeable — they
 *     are literally the same schema below. When they were separate the POST
 *     could report a phase the poll could not, and the screen would flicker
 *     between two different truths two seconds apart.
 *
 *  2. **The phase order is defined once.** It used to exist three times: as a
 *     `z.enum` in the client schema, as a `PHASES` array in
 *     `initial-analysis-progress` (which turned it into the progress fraction)
 *     and as a `PHASE_ORDER` array in the screen (which turned it into the
 *     step ticks). Three copies of an ordering is three chances for the bar and
 *     the ticks to disagree. `INITIAL_ANALYSIS_PHASES` and
 *     `initialAnalysisProgressFor` are the one copy, imported by all three.
 *
 *  3. **`failed` is reachable.** The screen has always had a failure card, a
 *     retry button and Turkish copy for both, behind `phase === 'failed'` — and
 *     neither function could ever produce that phase, so the whole branch was
 *     dead. Both functions now report it under the same rule `sync-start`
 *     uses: the pass tried, every account it tried failed, and nothing landed.
 *     A partial failure is not a dead end and keeps going; the integrations
 *     screen is where a single broken mailbox is surfaced.
 */

/**
 * The pass, in order, from queued to the finished briefing.
 *
 * Each one is reported only on evidence that it happened — rows that exist, a
 * sync state that completed — never on a counter the job increments, because a
 * counter keeps climbing after the job has died.
 */
export const INITIAL_ANALYSIS_PHASES = [
  'queued',
  'mail',
  'analysis',
  'calendar',
  'follow_ups',
  'briefing',
  'done',
] as const

export type InitialAnalysisOrderedPhase = (typeof INITIAL_ANALYSIS_PHASES)[number]

/**
 * `failed` is outside the ordering on purpose: it is not a further step, it is
 * the pass stopping. How far it had got before stopping is carried by
 * `progress`, so the bar does not snap back to zero on a failure.
 */
export const initialAnalysisPhase = z.enum([...INITIAL_ANALYSIS_PHASES, 'failed'])

export type InitialAnalysisPhase = z.infer<typeof initialAnalysisPhase>

/**
 * How far along the pass a phase is, as the 0..1 fraction the progress bar and
 * the step ticks both read.
 *
 * `failed` reports 0 for its own sake only; a failing run reports the fraction
 * of the last phase it actually reached, which is what the screen renders.
 */
export function initialAnalysisProgressFor(phase: InitialAnalysisPhase): number {
  const index = (INITIAL_ANALYSIS_PHASES as readonly string[]).indexOf(phase)
  return index < 0 ? 0 : index / (INITIAL_ANALYSIS_PHASES.length - 1)
}

// ── initial-analysis ────────────────────────────────────────────────────────

export const initialAnalysisRequest = z.object({
  /** The onboarding pass reads back this far; the rest is backfilled later. */
  hours: z.number().int().min(1).max(168).default(72),
})

export type InitialAnalysisRequest = z.infer<typeof initialAnalysisRequest>

/**
 * What the onboarding screen shows: where the pass is, and what it has found
 * so far.
 *
 * The four counts are the four steps the screen lists, in its order, so a count
 * that stops being reported is a compile error rather than a step that silently
 * renders blank.
 */
export const initialAnalysisResponse = z.object({
  phase: initialAnalysisPhase,
  /** Messages stored for this user. */
  emailsFound: z.number().int().min(0),
  /** Threads scored `critical` or `high`. */
  importantFound: z.number().int().min(0),
  /** Calendar events stored for this user. */
  meetingsFound: z.number().int().min(0),
  /** Follow-ups still waiting on a reply. */
  followUpsFound: z.number().int().min(0),
  /** 0..1, from `initialAnalysisProgressFor`. Never derived independently. */
  progress: z.number().min(0).max(1),
  /** The morning briefing this pass produced, once it is ready. */
  briefingId: uuidSchema.nullable(),
  /**
   * An `ErrorCode`, so the app can translate it rather than render a server
   * sentence. Non-null only alongside `phase: 'failed'` — one field answers
   * "did it stop", and it is `phase`.
   */
  errorCode: z.string().min(1).max(60).nullable(),
})

export type InitialAnalysisResponse = z.infer<typeof initialAnalysisResponse>

// ── initial-analysis-progress ───────────────────────────────────────────────

// The request is empty: the pass is the caller's own, scoped by their token,
// and the day it reports on is the day in their profile time zone. There is
// nothing for the client to assert, so there is no request schema to assert it
// with.

/** The same shape as `initialAnalysisResponse`; see decision 1 above. */
export const initialAnalysisProgressResponse = initialAnalysisResponse

export type InitialAnalysisProgressResponse = z.infer<typeof initialAnalysisProgressResponse>
