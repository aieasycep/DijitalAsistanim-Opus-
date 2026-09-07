import { systemClock } from '../_shared/domain.ts'
import { serviceClient } from '../_shared/db.ts'
import { timingSafeEqual } from '../_shared/crypto.ts'
import { corsHeaders, serveFunction } from '../_shared/http.ts'

/**
 * Gmail push, delivered via Google Pub/Sub.
 *
 * Pub/Sub retries anything slow or non-2xx, so this does the minimum: verify,
 * map the mailbox to an account, mark that account's sync as due, and
 * acknowledge. The actual sync runs on the next scheduler tick.
 *
 * Without a Pub/Sub topic configured this endpoint is simply never called and
 * the app falls back to polling, which is a slower but complete path.
 */
serveFunction('webhook-gmail', async ({ request, origin }) => {
  const expected = Deno.env.get('GOOGLE_PUBSUB_VERIFICATION_TOKEN')?.trim()
  if (expected) {
    const provided = new URL(request.url).searchParams.get('token') ?? ''
    if (!timingSafeEqual(provided, expected)) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
  }

  let emailAddress: string | null = null
  try {
    const body = (await request.json()) as { message?: { data?: string } }
    if (body.message?.data) {
      const decoded = JSON.parse(atob(body.message.data)) as { emailAddress?: string }
      emailAddress = decoded.emailAddress?.toLowerCase() ?? null
    }
  } catch {
    // A malformed delivery is acknowledged rather than retried forever.
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (emailAddress) {
    const client = serviceClient()
    const account = await client
      .from('connected_accounts')
      .select('id, user_id')
      .eq('provider', 'google')
      .eq('email', emailAddress)
      .eq('status', 'connected')
      .maybeSingle()

    if (account.data) {
      await client
        .from('sync_states')
        .update({ next_run_at: systemClock.now().toISOString() })
        .eq('connected_account_id', account.data.id as string)
        .eq('resource', 'mail')
    }
  }

  return new Response(null, { status: 204, headers: corsHeaders(origin) })
})
