import { systemClock } from '../_shared/domain.ts'
import { serviceClient } from '../_shared/db.ts'
import { timingSafeEqual } from '../_shared/crypto.ts'
import { corsHeaders, jsonResponse, serveFunction } from '../_shared/http.ts'

/**
 * Microsoft Graph change notifications.
 *
 * Graph validates a new subscription by calling the endpoint with a
 * `validationToken` query parameter and requiring it echoed back as plain text
 * within ten seconds — so that handshake is answered before anything else runs.
 */
serveFunction('webhook-microsoft', async ({ request, origin }) => {
  const url = new URL(request.url)
  const validationToken = url.searchParams.get('validationToken')
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { 'content-type': 'text/plain', ...corsHeaders(origin) },
    })
  }

  const expected = Deno.env.get('MICROSOFT_WEBHOOK_SECRET')?.trim()

  let notifications: Array<{ clientState?: string; subscriptionId?: string; resource?: string }> = []
  try {
    const body = (await request.json()) as { value?: typeof notifications }
    notifications = body.value ?? []
  } catch {
    return jsonResponse({ accepted: 0 }, 202, origin)
  }

  const client = serviceClient()
  const now = systemClock.now()
  let accepted = 0

  for (const notification of notifications) {
    // The clientState is the shared secret Graph echoes back; a mismatch means
    // the delivery did not come from a subscription we created.
    if (expected && !timingSafeEqual(notification.clientState ?? '', expected)) continue

    // The subscription's resource path carries the mailbox; map it to an
    // account by the stored cursor rather than trusting the path itself.
    const state = await client
      .from('sync_states')
      .select('connected_account_id')
      .eq('resource', 'mail')
      .not('cursor', 'is', null)
      .limit(50)

    for (const row of state.data ?? []) {
      await client
        .from('sync_states')
        .update({ next_run_at: now.toISOString() })
        .eq('connected_account_id', row.connected_account_id as string)
        .eq('resource', 'mail')
    }
    accepted++
  }

  return jsonResponse({ accepted }, 202, origin)
})
