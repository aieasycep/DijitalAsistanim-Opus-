import {
  BRIEFING_SECTIONS,
  CAPTURE_INTENTS,
  COMMITMENT_DIRECTIONS,
  EMAIL_CATEGORIES,
  IMPORTANCE_LEVELS,
  LIFE_EVENT_TYPES,
  REPLY_TONES,
} from '@da/domain'
import { z } from 'zod'
import { confidenceSchema, isoInstantSchema, moneySchema, safeUrlSchema } from './primitives.ts'

/**
 * Structured output contracts for every model call.
 *
 * These schemas are the enforcement point for the product's anti-hallucination
 * rule. Two mechanisms do the work:
 *
 *   - every factual field that could be invented (a deadline, an amount, a
 *     reference number) is nullable, so "I could not find one" is always a
 *     legal answer and the model is never cornered into producing a value; and
 *   - every such field is paired with a `sourceQuote` that must appear
 *     verbatim in the input, which `verifyQuotes` checks after parsing.
 *
 * A response that fails either check is rejected and retried once, then
 * degraded to a lower-confidence record — it is never persisted as-is.
 */

const enumOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values)

export const personMentionSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().max(320).nullable(),
  /** How this person relates to the message: sender, recipient, mentioned. */
  role: z.enum(['sender', 'recipient', 'mentioned']),
})

export const commitmentExtractionSchema = z.object({
  text: z.string().min(3).max(500),
  direction: enumOf(COMMITMENT_DIRECTIONS),
  personName: z.string().max(120).nullable(),
  /** Null unless the source states a date; never inferred from tone. */
  dueAt: isoInstantSchema.nullable(),
  /** Verbatim sentence the promise was read from. Checked against the source. */
  sourceQuote: z.string().min(3).max(600),
  confidence: confidenceSchema,
})

export const suggestedActionSchema = z.object({
  kind: z.enum([
    'open_source',
    'draft_reply',
    'create_task',
    'add_to_calendar',
    'set_reminder',
    'prepare_meeting',
    'mark_done',
    'track_shipment',
    'open_person',
    'dismiss',
  ]),
  label: z.string().min(1).max(60),
  params: z.record(z.string(), z.string().max(500)).default({}),
})

/** The per-thread analysis produced by stage 3 of the ingestion pipeline. */
export const emailAnalysisSchema = z.object({
  summary: z.string().min(1).max(600),
  importance: enumOf(IMPORTANCE_LEVELS),
  category: enumOf(EMAIL_CATEGORIES),
  /** Why it matters, in the user's language. Null when nothing stands out. */
  reasonImportant: z.string().max(300).nullable(),
  requiresUserAction: z.boolean(),
  deadline: isoInstantSchema.nullable(),
  /** Required whenever `deadline` is set — the text the date was read from. */
  deadlineQuote: z.string().max(600).nullable(),
  people: z.array(personMentionSchema).max(20).default([]),
  commitments: z.array(commitmentExtractionSchema).max(10).default([]),
  followUp: z
    .object({
      expectsReply: z.boolean(),
      /** Whose turn it is to respond. */
      awaiting: z.enum(['user', 'other', 'nobody']),
    })
    .nullable(),
  suggestedActions: z.array(suggestedActionSchema).max(5).default([]),
  confidence: confidenceSchema,
})

export type EmailAnalysis = z.infer<typeof emailAnalysisSchema>

export const lifeEventExtractionSchema = z.object({
  type: enumOf(LIFE_EVENT_TYPES),
  title: z.string().min(1).max(160),
  detail: z.string().max(400).nullable(),
  occursAt: isoInstantSchema.nullable(),
  occursAtQuote: z.string().max(600).nullable(),
  /** Only when the source prints an amount; never derived. */
  amount: moneySchema.nullable(),
  amountQuote: z.string().max(600).nullable(),
  /** Tracking number, PNR, reservation code — verbatim from the source. */
  reference: z.string().max(80).nullable(),
  trackingUrl: safeUrlSchema.nullable(),
  confidence: confidenceSchema,
})

export type LifeEventExtraction = z.infer<typeof lifeEventExtractionSchema>

export const lifeEventBatchSchema = z.object({
  events: z.array(lifeEventExtractionSchema).max(10).default([]),
})

export const briefingItemSchema = z.object({
  section: z.enum(BRIEFING_SECTIONS),
  title: z.string().min(1).max(200),
  detail: z.string().max(500).nullable(),
  importance: enumOf(IMPORTANCE_LEVELS),
  /** Id of the record this item was built from — the source chip's target. */
  sourceId: z.string().max(100).nullable(),
  sourceType: z
    .enum(['email', 'calendar_event', 'task', 'commitment', 'capture', 'notification'])
    .nullable(),
})

export const briefingGenerationSchema = z.object({
  /** One-line hook, e.g. "Bugün bilmen gereken 5 şey var." */
  headline: z.string().min(1).max(160),
  /** Editorial prose rendered in Lora. */
  narrative: z.string().min(1).max(4000),
  items: z.array(briefingItemSchema).max(30).default([]),
})

export type BriefingGeneration = z.infer<typeof briefingGenerationSchema>

export const replyDraftSchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(8000),
  tone: enumOf(REPLY_TONES),
  /** Anything the model deliberately left for the user to fill in. */
  openQuestions: z.array(z.string().max(200)).max(5).default([]),
})

export type ReplyDraft = z.infer<typeof replyDraftSchema>

export const meetingPrepSchema = z.object({
  purpose: z.string().max(400).nullable(),
  lastContactSummary: z.string().max(400).nullable(),
  openLoops: z.array(z.string().max(200)).max(10).default([]),
  userOwes: z.array(z.string().max(200)).max(10).default([]),
  otherOwes: z.array(z.string().max(200)).max(10).default([]),
  /** Exactly what it says: three, because more is not a briefing. */
  talkingPoints: z.array(z.string().max(240)).min(1).max(3),
  twoMinuteSummary: z.string().max(1200),
  confidence: confidenceSchema,
})

export type MeetingPrep = z.infer<typeof meetingPrepSchema>

export const captureAnalysisSchema = z.object({
  intent: z.enum(CAPTURE_INTENTS),
  title: z.string().min(1).max(200),
  summary: z.string().max(800),
  startsAt: isoInstantSchema.nullable(),
  endsAt: isoInstantSchema.nullable(),
  dateQuote: z.string().max(600).nullable(),
  location: z.string().max(200).nullable(),
  people: z.array(z.string().max(120)).max(10).default([]),
  amount: moneySchema.nullable(),
  reference: z.string().max(80).nullable(),
  keyPoints: z.array(z.string().max(240)).max(8).default([]),
  suggestedActions: z.array(suggestedActionSchema).max(5).default([]),
  confidence: confidenceSchema,
})

export type CaptureAnalysis = z.infer<typeof captureAnalysisSchema>

export const assistantCitationSchema = z.object({
  sourceType: z.enum([
    'email',
    'calendar_event',
    'task',
    'capture',
    'commitment',
    'notification',
    'contact',
  ]),
  sourceId: z.string().max(100),
  label: z.string().max(160),
})

export const assistantAnswerSchema = z.object({
  answer: z.string().min(1).max(4000),
  citations: z.array(assistantCitationSchema).max(10).default([]),
  /**
   * Set when the turn asks for a write. The assistant never executes; the
   * server turns this into a pending approval and the client shows the card.
   */
  proposedAction: z
    .object({
      type: z.enum([
        'email_send',
        'calendar_create',
        'calendar_update',
        'task_create',
        'reminder_create',
        'commitment_create',
      ]),
      what: z.string().max(200),
      why: z.string().max(300),
      /** Free-form draft payload; validated against the action's own schema next. */
      draft: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  /** False when the model could not ground the answer; the UI says so plainly. */
  grounded: z.boolean(),
  confidence: confidenceSchema,
})

export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>

export const personalizationInsightSchema = z.object({
  statement: z.string().min(3).max(200),
  kind: z.enum([
    'sender_always_important',
    'domain_always_important',
    'keyword_high_priority',
    'category_low_priority',
  ]),
  matchValue: z.string().min(1).max(320),
  strength: confidenceSchema,
})

export const personalizationBatchSchema = z.object({
  preferences: z.array(personalizationInsightSchema).max(10).default([]),
})

/**
 * Confidence below this is never rendered as a fact. Items land in the feed
 * with an explicit "kaynakta kesinleşmiyor" note and, when actionable, ask the
 * user to confirm before anything is created.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6

/** Below this the extraction is dropped entirely rather than shown hedged. */
export const REJECT_CONFIDENCE_THRESHOLD = 0.3

export interface QuoteViolation {
  field: string
  quote: string
}

function normalizeForQuoteMatch(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/[“”„‟"']/g, '"')
    .replace(/[–—]/g, '-')
    .trim()
}

/**
 * Verify that each `(field, quote)` pair really occurs in `sourceText`.
 *
 * This is what makes the nullable-plus-quote design bite: a model that invents
 * a deadline must also invent the sentence it came from, and that sentence
 * will not be in the source. Matching is whitespace- and quote-mark-insensitive
 * so ordinary reformatting does not cause false rejections.
 */
export function verifyQuotes(
  sourceText: string,
  pairs: ReadonlyArray<{ field: string; quote: string | null | undefined }>,
): QuoteViolation[] {
  const haystack = normalizeForQuoteMatch(sourceText)
  const violations: QuoteViolation[] = []
  for (const { field, quote } of pairs) {
    if (!quote) continue
    const needle = normalizeForQuoteMatch(quote)
    if (needle.length < 3) continue
    if (!haystack.includes(needle)) violations.push({ field, quote })
  }
  return violations
}

/**
 * Strip every claim whose quote could not be found, rather than rejecting the
 * whole analysis. The summary survives; the unverifiable deadline does not.
 */
export function stripUnverifiedClaims(
  analysis: EmailAnalysis,
  sourceText: string,
): { analysis: EmailAnalysis; stripped: string[] } {
  const stripped: string[] = []
  const next: EmailAnalysis = {
    ...analysis,
    commitments: [...analysis.commitments],
  }

  const deadlineViolations = verifyQuotes(sourceText, [
    { field: 'deadline', quote: analysis.deadlineQuote },
  ])
  if (analysis.deadline && (!analysis.deadlineQuote || deadlineViolations.length > 0)) {
    next.deadline = null
    next.deadlineQuote = null
    stripped.push('deadline')
  }

  next.commitments = analysis.commitments.filter((c) => {
    const bad = verifyQuotes(sourceText, [{ field: 'commitment', quote: c.sourceQuote }])
    if (bad.length > 0) {
      stripped.push(`commitment:${c.text.slice(0, 40)}`)
      return false
    }
    return true
  })

  return { analysis: next, stripped }
}
