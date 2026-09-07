import { AppError } from './domain.ts'
import { serviceClient } from './db.ts'

/**
 * Private object storage.
 *
 * Every path is `<userId>/<uuid>-<name>`, and that shape is load-bearing: the
 * storage RLS policy scopes on the first path segment, so a path built any
 * other way would be readable by the wrong user. Paths are therefore built
 * here and nowhere else.
 */

export const CAPTURES_BUCKET = 'captures'
export const EXPORTS_BUCKET = 'exports'

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Types the capture pipeline can actually do something with. Anything else is
 * rejected at the upload-URL step rather than after the user has waited for a
 * transfer to finish.
 */
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
])

const EXTENSION_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
}

function sanitizeFilename(filename: string, mimeType: string): string {
  const base = filename
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  if (base.includes('.')) return base
  const extension = EXTENSION_FOR_MIME[mimeType] ?? 'bin'
  return `${base || 'capture'}.${extension}`
}

export interface UploadTarget {
  uploadUrl: string
  storagePath: string
  expiresIn: number
}

export async function signedUploadUrl(
  userId: string,
  bucket: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
): Promise<UploadTarget> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new AppError('unsupported_file_type', { detail: mimeType })
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new AppError('file_too_large', {
      detail: String(sizeBytes),
      values: { limitMb: Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024)) },
    })
  }

  const storagePath = `${userId}/${crypto.randomUUID()}-${sanitizeFilename(filename, mimeType)}`

  const { data, error } = await serviceClient()
    .storage.from(bucket)
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    throw new AppError('upload_failed', { detail: error?.message?.slice(0, 120) ?? 'no_url' })
  }

  return { uploadUrl: data.signedUrl, storagePath, expiresIn: 3600 }
}

export async function signedDownloadUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 900,
): Promise<string> {
  const { data, error } = await serviceClient()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds)

  if (error || !data) {
    throw new AppError('not_found', { detail: 'signed_url_failed' })
  }
  return data.signedUrl
}

/**
 * Read a stored object as text.
 *
 * PDFs are handed back as raw bytes decoded lossily: a full PDF text layer
 * extractor is not something to reimplement here, so the pipeline treats the
 * result as best-effort and lets the model work with whatever legible text
 * survives. A binary type returns an empty string rather than garbage, so the
 * caller can degrade honestly instead of feeding noise to a model.
 */
export async function downloadToText(
  bucket: string,
  path: string,
  maxBytes = 5 * 1024 * 1024,
): Promise<string> {
  const { data, error } = await serviceClient().storage.from(bucket).download(path)
  if (error || !data) {
    throw new AppError('not_found', { detail: 'object_missing' })
  }

  const buffer = await data.arrayBuffer()
  if (buffer.byteLength > maxBytes) {
    throw new AppError('file_too_large', { detail: String(buffer.byteLength) })
  }

  const bytes = new Uint8Array(buffer)
  const type = data.type || ''

  if (type.startsWith('text/') || type === 'application/json') {
    return new TextDecoder('utf-8').decode(bytes)
  }

  if (type === 'application/pdf') {
    // Extract only the readable text runs from the PDF's content streams.
    // Uncompressed streams yield usable text; compressed ones yield nothing,
    // and returning nothing is the correct outcome there.
    const raw = new TextDecoder('latin1').decode(bytes)
    const runs = [...raw.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)]
      .map((m) => (m[1] ?? '').replace(/\\([()\\])/g, '$1'))
      .filter((s) => s.trim().length > 1)
    return runs.join(' ').replace(/\s+/g, ' ').trim()
  }

  return ''
}

export async function uploadBytes(
  bucket: string,
  path: string,
  body: Uint8Array | string,
  contentType: string,
): Promise<void> {
  const { error } = await serviceClient()
    .storage.from(bucket)
    .upload(path, body, { contentType, upsert: true })
  if (error) throw new AppError('upload_failed', { detail: error.message.slice(0, 120) })
}

/**
 * Remove every object under a user's prefix, paging until the bucket is clear.
 * Used by account deletion, where leaving a single orphan file behind would
 * make the promise untrue.
 */
export async function deleteUserObjects(userId: string, bucket: string): Promise<number> {
  const client = serviceClient()
  let removed = 0

  for (let page = 0; page < 100; page++) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(userId, { limit: 100, offset: 0 })

    if (error) throw new AppError('server_unavailable', { detail: 'storage_list_failed' })
    if (!data || data.length === 0) break

    const paths = data.map((entry) => `${userId}/${entry.name}`)
    const { error: removeError } = await client.storage.from(bucket).remove(paths)
    if (removeError) {
      throw new AppError('server_unavailable', { detail: 'storage_remove_failed' })
    }
    removed += paths.length

    // A short page means the prefix is now empty.
    if (data.length < 100) break
  }

  return removed
}
