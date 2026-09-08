import { captureUploadUrlRequest, type CaptureUploadUrlResponse } from '@da/validation'
import { requireUser } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { consumeRateLimit } from '../_shared/limits.ts'
import { CAPTURES_BUCKET, signedUploadUrl } from '../_shared/storage.ts'

/**
 * Where to put the bytes of a capture.
 *
 * The path is built inside `signedUploadUrl` and scoped to the caller, so the
 * app uploads straight to storage and only ever sends the path back here — no
 * endpoint has to be trusted with the file itself.
 */
serveFunction('capture-upload-url', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, captureUploadUrlRequest)
  await consumeRateLimit(user.id, 'captureUpload')

  const payload: CaptureUploadUrlResponse = await signedUploadUrl(
    user.id,
    CAPTURES_BUCKET,
    body.filename,
    body.mimeType,
    body.sizeBytes,
  )

  return jsonResponse(payload, 200, origin)
})
