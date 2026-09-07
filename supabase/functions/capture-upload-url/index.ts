import { captureUploadUrlRequestSchema } from '@da/validation'
import { requireUser } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { consumeRateLimit } from '../_shared/limits.ts'
import { CAPTURES_BUCKET, signedUploadUrl } from '../_shared/storage.ts'

serveFunction('capture-upload-url', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, captureUploadUrlRequestSchema)
  await consumeRateLimit(user.id, 'captureUpload')

  const target = await signedUploadUrl(
    user.id,
    CAPTURES_BUCKET,
    body.filename,
    body.mimeType,
    body.sizeBytes,
  )

  return jsonResponse(target, 200, origin)
})
