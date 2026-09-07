import type { EmailCategory, LearnedPreference, PriorityRule, PriorityRuleKind } from '@da/domain'
import { priorityRuleInputSchema } from '@da/validation'
import { z } from 'zod'
import { parseRequest, rowOf } from '../http'
import { mapLearnedPreference, mapPriorityRule } from '../mappers'
import type { EndpointContext, LearnedPreferenceRow, PriorityRuleRow } from '../types'

const ruleEnvelopeSchema = z.object({ rule: rowOf<PriorityRuleRow>() })

export interface PriorityRuleInput {
  kind: PriorityRuleKind
  matchValue: string
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
        order: { column: 'created_at', ascending: false },
      })
      return rows.map(mapPriorityRule)
    },

    async create(input) {
      const request = parseRequest(priorityRuleInputSchema, {
        kind: input.kind,
        matchValue: input.matchValue,
        matchCategory: input.matchCategory ?? null,
        enabled: input.enabled ?? true,
        note: input.note ?? null,
      })
      const result = await ctx.http.callFunction(
        'priority-rule-create',
        request,
        ruleEnvelopeSchema,
        {
          retry: false,
        },
      )
      return mapPriorityRule(result.rule)
    },

    async update(ruleId, patch) {
      const values: Record<string, unknown> = {}
      if (patch.matchValue !== undefined) values['match_value'] = patch.matchValue
      if (patch.matchCategory !== undefined) values['match_category'] = patch.matchCategory
      if (patch.enabled !== undefined) values['enabled'] = patch.enabled
      if (patch.note !== undefined) values['note'] = patch.note
      values['updated_at'] = ctx.config.clock.now().toISOString()
      const row = await ctx.db.updateOne<PriorityRuleRow>('priority_rules', ruleId, values)
      return mapPriorityRule(row)
    },

    async delete(ruleId) {
      await ctx.db.deleteOne('priority_rules', ruleId)
    },

    async learnedList() {
      const rows = await ctx.db.selectMany<LearnedPreferenceRow>('learned_preferences', {
        order: { column: 'strength', ascending: false },
      })
      return rows.map(mapLearnedPreference)
    },

    async learnedToggle(preferenceId, enabled) {
      const row = await ctx.db.updateOne<LearnedPreferenceRow>(
        'learned_preferences',
        preferenceId,
        { enabled, updated_at: ctx.config.clock.now().toISOString() },
      )
      return mapLearnedPreference(row)
    },

    async learnedDelete(preferenceId) {
      await ctx.db.deleteOne('learned_preferences', preferenceId)
    },
  }
}
