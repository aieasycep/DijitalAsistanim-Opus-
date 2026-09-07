import { feedbackRequestSchema } from '@da/validation'
import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

/**
 * "Not important", "show me more of this", "make this person VIP".
 *
 * The signal is recorded and, for the two that have an immediate meaning, acted
 * on right away — a user who says "not important" expects the item to leave the
 * feed now, not after the next learning pass.
 */
serveFunction('feedback', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, feedbackRequestSchema)
  const now = systemClock.now()
  const client = serviceClient()

  const inserted = await client
    .from('ai_feedback')
    .insert({
      user_id: user.id,
      signal: body.signal,
      entity_type: body.entityType,
      entity_id: body.entityId,
      note: body.note,
    })
    .select('id')
    .single()
  if (inserted.error) throw dbError(inserted.error)

  if (body.signal === 'not_important' && body.entityType === 'email') {
    await client
      .from('email_threads')
      .update({ suppressed_at: now.toISOString(), priority_score: 0 })
      .eq('id', body.entityId)
      .eq('user_id', user.id)
  }

  if (body.signal === 'stop_following' && body.entityType === 'email') {
    await client
      .from('follow_ups')
      .update({ status: 'closed', closed_at: now.toISOString() })
      .eq('thread_id', body.entityId)
      .eq('user_id', user.id)
  }

  if (body.signal === 'mark_vip' && body.entityType === 'contact') {
    const contact = await client
      .from('contacts')
      .update({ is_vip: true, vip_set_at: now.toISOString() })
      .eq('id', body.entityId)
      .eq('user_id', user.id)
      .select('email, name')
      .maybeSingle()

    if (contact.data?.email) {
      await client.from('vip_people').upsert(
        {
          user_id: user.id,
          contact_id: body.entityId,
          email: contact.data.email,
          name: contact.data.name,
          added_at: now.toISOString(),
        },
        { onConflict: 'user_id,email' },
      )
    }
  }

  return jsonResponse({ recorded: true, id: inserted.data.id }, 200, origin)
})
