import type { DataExportSnapshot, DataExportStatusResponse } from '@da/validation'
import { systemClock } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, serveFunction } from '../_shared/http.ts'
import { EXPORTS_BUCKET, signedDownloadUrl } from '../_shared/storage.ts'

/**
 * Where the account's most recent data export has got to.
 *
 * An account that has never asked for one answers `export: null`. It used to
 * answer a placeholder row — `{ requestId: null, status: 'requested' }` — which
 * described a request nobody had made and which the client rejected outright,
 * because a request id is a uuid. Absence belongs in the envelope.
 */
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
    const empty: DataExportStatusResponse = { export: null }
    return jsonResponse(empty, 200, origin)
  }

  const expiresAt = (data.expires_at as string | null) ?? null
  const expired = expiresAt ? new Date(expiresAt) <= now : false
  const status: DataExportSnapshot['status'] = expired
    ? 'expired'
    : (data.status as DataExportSnapshot['status'])

  // The signed URL is minted fresh on every check rather than stored, so a
  // stale link can never outlive the export's own expiry.
  const downloadUrl =
    status === 'ready' && data.storage_path
      ? await signedDownloadUrl(EXPORTS_BUCKET, data.storage_path as string, 3600)
      : null

  const payload: DataExportStatusResponse = {
    export: { requestId: data.id as string, status, downloadUrl, expiresAt },
  }

  return jsonResponse(payload, 200, origin)
})
