import { priorityRuleCreateRequest, type PriorityRuleCreateResponse } from '@da/validation'
import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { loadEntitlements, requireWithinLimit } from '../_shared/limits.ts'

/**
 * Create an explicit priority rule.
 *
 * Explicit rules sit at the top of the priority engine — above security, above
 * everything the model infers — so this is the user's override on the whole
 * ranking. It is also plan-limited, hence the count before the insert.
 *
 * The count and the engine both read the table as "rules that are not deleted",
 * so `deleted_at` is the one deletion this table has; the client retires a rule
 * by stamping it rather than by removing the row.
 *
 * `match_value` is inserted exactly as the contract parsed it: trimming and
 * lower-casing are `priorityRuleMatchValue`'s job, so that an edit through
 * `rules.update` stores the same shape this insert does.
 */
serveFunction('priority-rule-create', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, priorityRuleCreateRequest)
  const now = systemClock.now()
  const client = serviceClient()

  const entitlements = await loadEntitlements(user.id, now)
  const existing = await client
    .from('priority_rules')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('deleted_at', null)
  if (existing.error) throw dbError(existing.error)
  requireWithinLimit(entitlements, 'priorityRules', existing.count ?? 0)

  const { data, error } = await client
    .from('priority_rules')
    .insert({
      user_id: user.id,
      kind: body.kind,
      match_value: body.matchValue,
      match_category: body.matchCategory,
      enabled: body.enabled,
      note: body.note,
    })
    .select('*')
    .single()
  if (error) throw dbError(error)

  const payload: PriorityRuleCreateResponse = { rule: data }
  return jsonResponse(payload, 200, origin)
})
