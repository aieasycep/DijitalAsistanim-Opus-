import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'
import { EXPORTS_BUCKET, signedDownloadUrl } from '../_shared/storage.ts'

serveFunction('data-export-status', async ({ request, origin }) => {
  const user = await requireUser(request)
  const now = systemClock.now()

  const { data, error } = await serviceClient()
    .from('data_export_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) {
    return jsonResponse(
      { requestId: null, status: 'requested', downloadUrl: null, expiresAt: null },
      200,
      origin,
    )
  }

  const expired = data.expires_at ? new Date(data.expires_at as string) <= now : false
  const status = expired ? 'expired' : (data.status as string)

  // The signed URL is minted fresh on every check rather than stored, so a
  // stale link can never outlive the export's own expiry.
  const downloadUrl =
    status === 'ready' && data.storage_path
      ? await signedDownloadUrl(EXPORTS_BUCKET, data.storage_path as string, 3600)
      : null

  return jsonResponse(
    { requestId: data.id, status, downloadUrl, expiresAt: data.expires_at ?? null },
    200,
    origin,
  )
})
