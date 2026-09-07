import { z } from 'zod'
import { isoInstantSchema } from '@da/validation'
import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'

const requestSchema = z.object({
  text: z.string().min(3).max(500),
  direction: z.enum(['user_owes', 'other_owes']),
  personName: z.string().max(120).nullable().default(null),
  dueAt: isoInstantSchema.nullable().default(null),
  /** The sentence this came from. For a typed note, the note itself. */
  quote: z.string().min(1).max(600),
  sourceType: z
    .enum(['email', 'calendar_event', 'capture', 'notification', 'user_input'])
    .default('user_input'),
  sourceId: z.string().max(100).nullable().default(null),
})

/**
 * Record a commitment the user entered themselves.
 *
 * This has no effect outside the app, so it takes effect immediately — the
 * approval requirement covers external side effects, not the user writing down
 * their own promise.
 */
serveFunction('commitment-create', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, requestSchema)
  const now = systemClock.now()

  const { data, error } = await serviceClient()
    .from('commitments')
    .upsert(
      {
        user_id: user.id,
        text: body.text,
        direction: body.direction,
        person_name: body.personName,
        due_at: body.dueAt,
        status: 'open',
        source_type: body.sourceType,
        source_id: body.sourceId ?? `user:${now.getTime()}`,
        source_quote: body.quote,
        confidence: 1,
        confirmed_by_user: true,
      },
      { onConflict: 'user_id,source_type,source_id,md5(source_quote)', ignoreDuplicates: false },
    )
    .select('*')
    .single()

  if (error) throw dbError(error)
  return jsonResponse({ commitment: data }, 200, origin)
})
