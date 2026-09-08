import type { EmailCategory, PriorityRuleKind } from '@da/domain'
import { EMAIL_CATEGORIES } from '@da/domain'
import { z } from 'zod'
import { priorityRuleInputSchema } from '../api-schemas.ts'
import { uuidSchema } from '../primitives.ts'
import { rowSchema } from './common.ts'

/**
 * The `rules` group — `priority-rule-create`, plus the PostgREST reads and
 * writes behind `api.rules`.
 *
 * Five decisions, each of them a defect this file makes impossible:
 *
 *  1. **One function, one envelope.** Creating a rule is the only call that
 *     crosses a function boundary, because an insert is plan-limited and the
 *     limit is counted server-side; listing, toggling, deleting and forgetting
 *     are PostgREST calls under RLS. So `{ rule }` is the only envelope pinned
 *     here — the two sides already agreed on it, and pinning it is what keeps
 *     them agreed.
 *
 *  2. **A category rule needs its category.** `evaluatePriority` matches
 *     `category_low_priority` on `matchCategory` and never reads `matchValue`
 *     for it (`packages/domain/src/priority.ts`, the demotion tier). The rules
 *     screen offered the kind as a chip and then sent the typed text as
 *     `matchValue` with `matchCategory` left null, so every category rule a
 *     user created was inert: it appeared in the list, its toggle worked, and
 *     it demoted nothing. The request now refuses a category rule without a
 *     category, and the screen asks for one instead of a free-text value.
 *
 *  3. **The categories are the domain's.** `priorityRuleInputSchema` spelled
 *     the twelve values out inline, so a category added to `EMAIL_CATEGORIES`
 *     would have been rejected by the wire while the engine happily matched it.
 *     `satisfies z.ZodType<EmailCategory>` below turns that into a compile
 *     error rather than a convention.
 *
 *  4. **What is stored is the normalised value.** `priority-rule-create`
 *     trimmed and lower-cased `matchValue` before the insert — which is what
 *     the engine needs, since it compares against `normaliseEmail(...)` and a
 *     lower-cased haystack — but `rules.update` wrote whatever it was handed,
 *     so editing a rule to `Ahmet@Firma.com` silently stopped it matching.
 *     Normalisation belongs to the schema both sides parse, so create and
 *     update cannot disagree about it.
 *
 *  5. **A deleted rule is deleted for every reader.** `priority_rules` carries
 *     `deleted_at` (migration 0005), and both server-side readers scope by it:
 *     the plan-limit count in `priority-rule-create` and the rule load in
 *     `_shared/ingest.ts`. The client meanwhile issued a hard `DELETE` and
 *     listed the table with no filter at all — three answers to one question.
 *     One rule, stated here and obeyed by every read and write: a rule is
 *     deleted by stamping `deleted_at`, and a stamped row is not returned.
 */

/** The kind whose target is a category rather than a piece of text. */
export const CATEGORY_RULE_KIND = 'category_low_priority' satisfies PriorityRuleKind

/**
 * The category a `category_low_priority` rule demotes.
 *
 * Bound to the domain enum rather than restated, so the wire cannot fall behind
 * the set of categories the triage pipeline actually assigns.
 */
export const priorityRuleCategory = z.enum(EMAIL_CATEGORIES) satisfies z.ZodType<EmailCategory>

/**
 * A sender address, a domain or a keyword.
 *
 * Trimmed and lower-cased *by the schema*, so the value the client believes it
 * sent, the value the row holds and the value `evaluatePriority` compares are
 * one value. 320 is the address column's width, which is the longest a match
 * value can usefully be.
 */
export const priorityRuleMatchValue = z.string().trim().toLowerCase().min(1).max(320)

// ── priority-rule-create ────────────────────────────────────────────────────

/**
 * A rule to create.
 *
 * Extends `priorityRuleInputSchema` rather than restating it: `kind`, `enabled`
 * and `note` were already right, and a second declaration of them is the thing
 * this module exists to abolish. `matchValue` and `matchCategory` are the two
 * that needed correcting, for the reasons above.
 */
export const priorityRuleCreateRequest = priorityRuleInputSchema
  .extend({
    matchValue: priorityRuleMatchValue,
    matchCategory: priorityRuleCategory.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.kind === CATEGORY_RULE_KIND && value.matchCategory === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['matchCategory'],
        message: 'a category rule needs the category it demotes',
      })
    }
  })

export type PriorityRuleCreateRequest = z.infer<typeof priorityRuleCreateRequest>

/**
 * The stored row, so the screen can show the rule it just added without waiting
 * for a refetch.
 *
 * The row stays permissive — its columns are pinned by the migration and
 * narrowed by `mapPriorityRule` — while the envelope around it is fixed here,
 * because the envelope is what drifts.
 */
export const priorityRuleCreateResponse = z.object({ rule: rowSchema })

export type PriorityRuleCreateResponse = z.infer<typeof priorityRuleCreateResponse>

// ── rules.update ────────────────────────────────────────────────────────────

/**
 * A change to one rule, as the settings screen makes it.
 *
 * Every field is optional because the screen changes one at a time — the toggle
 * sends `enabled` alone — but each one that *is* present obeys exactly the rule
 * the insert obeys. `ruleId` is checked because an id that is not a uuid
 * reaches PostgREST as a `22P02`, which the client maps to
 * `server_unavailable`: a retried "we cannot reach you" for what is simply a
 * bad id.
 */
export const priorityRuleUpdateRequest = z.object({
  ruleId: uuidSchema,
  matchValue: priorityRuleMatchValue.optional(),
  matchCategory: priorityRuleCategory.nullable().optional(),
  enabled: z.boolean().optional(),
  note: z.string().max(200).nullable().optional(),
})

export type PriorityRuleUpdateRequest = z.infer<typeof priorityRuleUpdateRequest>

// ── rules.delete ────────────────────────────────────────────────────────────

/** The rule to retire; the write stamps `deleted_at` rather than removing it. */
export const priorityRuleDeleteRequest = z.object({ ruleId: uuidSchema })

export type PriorityRuleDeleteRequest = z.infer<typeof priorityRuleDeleteRequest>

// ── rules.learnedToggle / rules.learnedDelete ───────────────────────────────

/**
 * Switching off something the assistant taught itself.
 *
 * `learned_preferences` has no `deleted_at`: the user forgetting an inference
 * is not a retention concern, and migration 0011 opens update and delete to the
 * client for exactly this reason — an inference that cannot be revoked is the
 * thing users mean when they say an app "went weird on them".
 */
export const learnedPreferenceToggleRequest = z.object({
  preferenceId: uuidSchema,
  enabled: z.boolean(),
})

export type LearnedPreferenceToggleRequest = z.infer<typeof learnedPreferenceToggleRequest>

export const learnedPreferenceDeleteRequest = z.object({ preferenceId: uuidSchema })

export type LearnedPreferenceDeleteRequest = z.infer<typeof learnedPreferenceDeleteRequest>
