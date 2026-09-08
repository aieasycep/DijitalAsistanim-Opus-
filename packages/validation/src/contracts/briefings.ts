import type { BriefingKind } from '@da/domain'
import { BRIEFING_KINDS } from '@da/domain'
import { z } from 'zod'
import { isoDateSchema, safeUrlSchema, uuidSchema } from '../primitives.ts'
import { rowSchema, rowsSchema } from './common.ts'

/**
 * The `briefings` group — `briefing-generate` and `briefing-audio`.
 *
 * Three decisions here, each of them a bug this file makes impossible:
 *
 *  1. **A generation that produced nothing says so, in the type.**
 *     `briefing-generate` has always had four outcomes — it generated one, it
 *     already had one, the day is a quiet day, or the midday pulse had no
 *     change to report — and the last two answer `briefing: null`. The client
 *     parsed the briefing as a non-nullable row, so a quiet-day answer came
 *     back as `ai_invalid_output`: the screen reported a broken server for what
 *     was in fact a deliberate, successful decision not to write a briefing.
 *     The response is a discriminated union on `status`, so neither side can
 *     read a briefing out of an answer that does not carry one.
 *
 *  2. **Every "ready" answer carries its items.** The cached branch returned
 *     the briefing row alone while the client defaulted `items` to `[]`, so
 *     asking for a briefing that already existed produced a briefing with its
 *     sections silently emptied. `items` is part of the ready envelope, and the
 *     function now reads them on both branches.
 *
 *  3. **`forDate` is the right name here.** Elsewhere it was a column name
 *     leaking onto the wire; in this group the value *is* `briefings.for_date`
 *     — the local date the briefing covers, the field `Briefing.forDate`
 *     carries, and the second half of the `(kind, for_date)` key the function
 *     upserts on. Both sides already agreed on it, and it stays.
 *
 * Row *contents* stay permissive, per `./common.ts`. One caveat worth writing
 * down because it cost the stats card: `briefings.stats` is a JSONB blob, not a
 * set of columns, and every writer stores it with the domain's own field names
 * (`estimatedMinutesSaved`, not `estimated_minutes_saved`). The row-side type
 * in `@da/api-client` had guessed the column convention and mapped the blob to
 * `undefined`; the domain names win, and the mapper was corrected.
 */

export const briefingKind = z.enum(BRIEFING_KINDS) satisfies z.ZodType<BriefingKind>

// ── briefing-generate ───────────────────────────────────────────────────────

export const briefingGenerateRequest = z.object({
  kind: briefingKind,
  /** The local date to cover. Omitted, the function derives it from the kind. */
  forDate: isoDateSchema.optional(),
  /**
   * Write one even when the rules say not to.
   *
   * This is what the "Yeniden hazırla" button sends: an explicit ask overrides
   * the quiet-day rule, the midday no-change rule and the cache, because the
   * user is standing in front of the screen asking for it.
   */
  force: z.boolean().default(false),
})

export type BriefingGenerateRequest = z.infer<typeof briefingGenerateRequest>

/** Why an answer carries a briefing. */
export const BRIEFING_READY_REASONS = ['generated', 'cached'] as const

export const briefingReadyReason = z.enum(BRIEFING_READY_REASONS)

export type BriefingReadyReason = z.infer<typeof briefingReadyReason>

/**
 * Why an answer carries none.
 *
 * `quiet_day` is a day the user asked not to hear from us on; `no_change` is
 * the midday pulse declining to repeat the morning. Both are successes — the
 * product deciding to stay quiet — which is why they travel as a reason rather
 * than as an error.
 */
export const BRIEFING_SKIP_REASONS = ['quiet_day', 'no_change'] as const

export const briefingSkipReason = z.enum(BRIEFING_SKIP_REASONS)

export type BriefingSkipReason = z.infer<typeof briefingSkipReason>

export const briefingGenerateResponse = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    reason: briefingReadyReason,
    /** The `briefings` row, freshly written or read back from the cache. */
    briefing: rowSchema,
    /** Its `briefing_items`, in `position` order. */
    items: rowsSchema,
  }),
  z.object({
    status: z.literal('skipped'),
    reason: briefingSkipReason,
    // No `briefing` and no `items`: there is nothing to carry, and a null
    // beside a reason is one more field to disagree with the reason.
  }),
])

export type BriefingGenerateResponse = z.infer<typeof briefingGenerateResponse>

// ── briefing-audio ──────────────────────────────────────────────────────────

export const briefingAudioRequest = z.object({
  briefingId: uuidSchema,
  /** Overrides the deployment's default voice. */
  voice: z.string().min(1).max(60).nullable().default(null),
  speed: z.number().min(0.5).max(2).default(1),
})

export type BriefingAudioRequest = z.infer<typeof briefingAudioRequest>

/**
 * Audio for a briefing, in whichever of the two tiers the deployment can serve.
 *
 * `audioUrl` is null when no TTS provider is configured, when synthesis failed,
 * or when the caller's plan does not include it — and `ssmlOrText` is populated
 * in every one of those cases, because the device's own synthesiser reads it.
 * That is the whole reason both fields travel together: "listen" must work on a
 * deployment with no speech credentials at all.
 */
export const briefingAudioResponse = z.object({
  audioUrl: safeUrlSchema.nullable(),
  /** The provider that rendered `audioUrl`; null whenever it is null. */
  provider: z.string().min(1).nullable(),
  /** Headline and narrative, ready to be spoken. */
  ssmlOrText: z.string(),
  durationSeconds: z.number().int().min(0).nullable(),
})

export type BriefingAudioResponse = z.infer<typeof briefingAudioResponse>
