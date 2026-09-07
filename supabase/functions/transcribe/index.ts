import { transcribeRequestSchema } from '@da/validation'
import { AppError } from '../_shared/domain.ts'
import { requireUser } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { consumeRateLimit } from '../_shared/limits.ts'

/**
 * Speech to text for the voice assistant.
 *
 * The audio is forwarded and discarded — never written to storage, never
 * logged. Without an STT provider this returns `ai_unavailable` and the client
 * hides the microphone rather than offering a button that cannot work.
 */
serveFunction('transcribe', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, transcribeRequestSchema)
  await consumeRateLimit(user.id, 'transcribe')

  const provider = Deno.env.get('STT_PROVIDER')?.trim()
  const apiKey = Deno.env.get('STT_API_KEY')?.trim()
  if (!provider || !apiKey) {
    throw new AppError('ai_unavailable', { detail: 'stt_not_configured' })
  }

  const binary = atob(body.audioBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const extension = body.mimeType.includes('wav')
    ? 'wav'
    : body.mimeType.includes('mp4') || body.mimeType.includes('m4a')
      ? 'm4a'
      : 'webm'

  const form = new FormData()
  form.append('file', new Blob([bytes], { type: body.mimeType }), `audio.${extension}`)
  form.append('model', Deno.env.get('STT_MODEL')?.trim() ?? 'whisper-1')
  form.append('language', body.locale)

  const endpoint =
    Deno.env.get('STT_URL')?.trim() ?? 'https://api.openai.com/v1/audio/transcriptions'

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  })

  if (!response.ok) {
    throw new AppError('ai_unavailable', { detail: `stt_${response.status}` })
  }

  const parsed = (await response.json()) as { text?: string }
  return jsonResponse({ text: parsed.text ?? '', provider, confidence: null }, 200, origin)
})
