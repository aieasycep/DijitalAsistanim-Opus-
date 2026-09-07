import { AppError } from '@da/domain'
import { File, UploadType } from 'expo-file-system'

/** Storage refuses anything larger; the picker can still hand us one. */
export const MAX_CAPTURE_BYTES = 20 * 1024 * 1024

/**
 * Upload a picked file to a signed storage URL.
 *
 * The upload streams from disk rather than reading the file into JS memory,
 * which matters for a 15 MB PDF on a low-end device — and the signed URL means
 * the bytes never pass through an endpoint of ours.
 */
export async function uploadCaptureFile(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
): Promise<void> {
  const file = new File(fileUri)
  if (!file.exists) {
    throw new AppError('upload_failed', { detail: 'picked file no longer exists' })
  }

  const size = file.size ?? 0
  if (size > MAX_CAPTURE_BYTES) {
    throw new AppError('file_too_large', { detail: `${size} bytes` })
  }

  const result = await file.upload(uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'content-type': mimeType },
  })

  // A completed request with a non-2xx status resolves rather than throwing.
  if (result.status < 200 || result.status >= 300) {
    throw new AppError('upload_failed', { detail: `storage responded ${result.status}` })
  }
}
