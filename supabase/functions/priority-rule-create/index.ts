import { priorityRuleInputSchema } from '@da/validation'
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
 */
serveFunction('priority-rule-create', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, priorityRuleInputSchema)
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
      match_value: body.matchValue.trim().toLowerCase(),
      match_category: body.matchCategory,
      enabled: body.enabled,
      note: body.note,
    })
    .select('*')
    .single()
  if (error) throw dbError(error)

  return jsonResponse({ rule: data }, 200, origin)
})
