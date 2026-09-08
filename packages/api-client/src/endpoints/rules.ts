import type { EmailCategory, LearnedPreference, PriorityRule, PriorityRuleKind } from '@da/domain'
import {
  learnedPreferenceDeleteRequest,
  learnedPreferenceToggleRequest,
  priorityRuleCreateRequest,
  priorityRuleCreateResponse,
  priorityRuleDeleteRequest,
  priorityRuleUpdateRequest,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapLearnedPreference, mapPriorityRule } from '../mappers'
import type { Filter } from '../supabase'
import type { EndpointContext, LearnedPreferenceRow, PriorityRuleRow } from '../types'

/**
 * A row the function already selected and RLS already scoped.
 *
 * The contract pins the envelope around it and leaves the row itself
 * permissive — adding a column must not require a contract change — so the
 * mapper is what narrows a row into a domain entity.
 */
function rowOf<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

/**
 * A retired rule is not a rule.
 *
 * `_shared/ingest.ts` loads the engine's rules with this clause and
 * `priority-rule-create` counts the plan limit with it, so a list without it
 * showed the user a rule that ranked nothing and counted against a limit the
 * server measured differently. `deleted_at` is a query concern rather than a
 * row concern — `PriorityRule` has no `deletedAt` — which is why it lives here
 * and not in the mapper.
 */
const LIVING: Filter = { column: 'deleted_at', op: 'is', value: null }

export interface PriorityRuleInput {
  kind: PriorityRuleKind
  /** A sender address, a domain, or a keyword; normalised by the contract. */
  matchValue: string
  /** Required for `category_low_priority`, ignored by every other kind. */
  matchCategory?: EmailCategory | null
  enabled?: boolean
  note?: string | null
}

export interface PriorityRulePatch {
  matchValue?: string
  matchCategory?: EmailCategory | null
  enabled?: boolean
  note?: string | null
}

export interface RulesApi {
  list(): Promise<PriorityRule[]>
  create(input: PriorityRuleInput): Promise<PriorityRule>
  update(ruleId: string, patch: PriorityRulePatch): Promise<PriorityRule>
  delete(ruleId: string): Promise<void>
  learnedList(): Promise<LearnedPreference[]>
  /** The user can switch off anything the assistant taught itself. */
  learnedToggle(preferenceId: string, enabled: boolean): Promise<LearnedPreference>
  learnedDelete(preferenceId: string): Promise<void>
}

export function createRulesApi(ctx: EndpointContext): RulesApi {
  return {
    async list() {
      const rows = await ctx.db.selectMany<PriorityRuleRow>('priority_rules', {
        filters: [LIVING],
        order: { column: 'created_at', ascending: false },
      })
      return rows.map(mapPriorityRule)
    },

    async create(input) {
      const request = parseRequest(priorityRuleCreateRequest, {
        kind: input.kind,
        matchValue: input.matchValue,
        matchCategory: input.matchCategory ?? null,
        enabled: input.enabled ?? true,
        note: input.note ?? null,
      })
      const result = await ctx.http.callFunction(
        'priority-rule-create',
        request,
        priorityRuleCreateResponse,
        {
          retry: false,
        },
      )
      return mapPriorityRule(rowOf<PriorityRuleRow>(result.rule))
    },

    async update(ruleId, patch) {
      const request = parseRequest(priorityRuleUpdateRequest, { ruleId, ...patch })
      const values: Record<string, unknown> = {
        updated_at: ctx.config.clock.now().toISOString(),
      }
      if (request.matchValue !== undefined) values['match_value'] = request.matchValue
      if (request.matchCategory !== undefined) values['match_category'] = request.matchCategory
      if (request.enabled !== undefined) values['enabled'] = request.enabled
      if (request.note !== undefined) values['note'] = request.note
      const row = await ctx.db.updateOne<PriorityRuleRow>('priority_rules', request.ruleId, values)
      return mapPriorityRule(row)
    },

    /**
     * Retire a rule.
     *
     * A stamp rather than a `DELETE`, because `deleted_at` is what the plan
     * count and the priority engine already read; removing the row outright
     * left the column meaningless and the two mechanisms in disagreement.
     */
    async delete(ruleId) {
      const request = parseRequest(priorityRuleDeleteRequest, { ruleId })
      const now = ctx.config.clock.now().toISOString()
      await ctx.db.updateOne<PriorityRuleRow>('priority_rules', request.ruleId, {
        deleted_at: now,
        updated_at: now,
      })
    },

    async learnedList() {
      const rows = await ctx.db.selectMany<LearnedPreferenceRow>('learned_preferences', {
        order: { column: 'strength', ascending: false },
      })
      return rows.map(mapLearnedPreference)
    },

    async learnedToggle(preferenceId, enabled) {
      const request = parseRequest(learnedPreferenceToggleRequest, { preferenceId, enabled })
      const row = await ctx.db.updateOne<LearnedPreferenceRow>(
        'learned_preferences',
        request.preferenceId,
        { enabled: request.enabled, updated_at: ctx.config.clock.now().toISOString() },
      )
      return mapLearnedPreference(row)
    },

    /** No `deleted_at` here: forgetting an inference removes it. */
    async learnedDelete(preferenceId) {
      const request = parseRequest(learnedPreferenceDeleteRequest, { preferenceId })
      await ctx.db.deleteOne('learned_preferences', request.preferenceId)
    },
  }
}
