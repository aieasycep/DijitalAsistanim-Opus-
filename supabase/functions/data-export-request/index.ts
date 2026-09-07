import { systemClock } from '../_shared/domain.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'
import { consumeRateLimit } from '../_shared/limits.ts'
import { EXPORTS_BUCKET, signedDownloadUrl, uploadBytes } from '../_shared/storage.ts'

/** Tables included in an export, with the column that scopes them to the user. */
const EXPORTED_TABLES = [
  'profiles',
  'user_preferences',
  'notification_preferences',
  'connected_accounts',
  'email_threads',
  'email_messages',
  'calendar_events',
  'tasks',
  'commitments',
  'reminders',
  'contacts',
  'vip_people',
  'priority_rules',
  'learned_preferences',
  'insights',
  'life_events',
  'follow_ups',
  'briefings',
  'briefing_items',
  'approval_actions',
  'assistant_threads',
  'assistant_messages',
  'captures',
  'subscriptions',
  'referrals',
  'ai_feedback',
] as const

/**
 * Build a data export.
 *
 * `oauth_credentials` is deliberately absent: an export containing a refresh
 * token would hand a mailbox key to anyone who later got hold of the file.
 * `connected_accounts` is included because it holds only which accounts exist,
 * not how to authenticate as them.
 */
serveFunction('data-export-request', async ({ request, origin }) => {
  const user = await requireUser(request)
  await consumeRateLimit(user.id, 'dataExport')

  const now = systemClock.now()
  const client = serviceClient()

  const created = await client
    .from('data_export_requests')
    .insert({ user_id: user.id, status: 'processing' })
    .select('id')
    .single()
  if (created.error) throw dbError(created.error)

  const requestId = created.data.id as string

  try {
    const payload: Record<string, unknown> = {
      exportedAt: now.toISOString(),
      userId: user.id,
      note: 'Bu dosya hesabına ait verilerin dışa aktarımıdır. Sağlayıcı erişim anahtarları (OAuth token) güvenlik nedeniyle dahil edilmez.',
    }

    for (const table of EXPORTED_TABLES) {
      const column = table === 'profiles' ? 'id' : 'user_id'
      const { data, error } = await client.from(table).select('*').eq(column, user.id).limit(5000)
      if (error) throw dbError(error)
      payload[table] = data ?? []
    }

    const path = `${user.id}/export-${now.toISOString().slice(0, 10)}-${requestId}.json`
    const serialised = JSON.stringify(payload, null, 2)
    await uploadBytes(EXPORTS_BUCKET, path, serialised, 'application/json')

    // Short-lived by design: an export link that lived forever would outlast
    // the user's control of wherever they pasted it.
    const expiresAt = new Date(now.getTime() + 7 * 86_400_000).toISOString()

    await client
      .from('data_export_requests')
      .update({
        status: 'ready',
        storage_path: path,
        size_bytes: new TextEncoder().encode(serialised).length,
        ready_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .eq('id', requestId)

    await audit({
      userId: user.id,
      action: 'privacy.export_requested',
      entityType: 'data_export',
      entityId: requestId,
      metadata: { tables: EXPORTED_TABLES.length },
    })

    return jsonResponse(
      {
        requestId,
        status: 'ready',
        downloadUrl: await signedDownloadUrl(EXPORTS_BUCKET, path, 3600),
        expiresAt,
      },
      200,
      origin,
    )
  } catch (error) {
    await client
      .from('data_export_requests')
      .update({ status: 'failed', failure_reason: 'export_build_failed' })
      .eq('id', requestId)
    throw error
  }
})
