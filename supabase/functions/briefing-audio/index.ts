import { briefingAudioRequestSchema } from '@da/validation'
import { AppError } from '../_shared/domain.ts'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { CAPTURES_BUCKET, signedDownloadUrl, uploadBytes } from '../_shared/storage.ts'

/**
 * Audio for a briefing.
 *
 * Two tiers by design. With a TTS provider configured the narrative is
 * synthesised server-side and cached. Without one, the text is returned and the
 * device speaks it with the platform's own synthesiser — so "listen to your
 * briefing" works on a deployment with no speech credentials at all.
 */
serveFunction('briefing-audio', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, briefingAudioRequestSchema)
  const client = serviceClient()

  const briefing = await client
    .from('briefings')
    .select('id, narrative, headline, audio_url, audio_provider, duration_seconds')
    .eq('id', body.briefingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (briefing.error) throw dbError(briefing.error)
  if (!briefing.data) throw new AppError('not_found', { detail: 'briefing_missing' })

  const narrative = (briefing.data.narrative as string | null) ?? ''
  if (!narrative) throw new AppError('not_found', { detail: 'briefing_not_ready' })

  const spoken = `${briefing.data.headline ?? ''}\n\n${narrative}`.trim()
  const provider = Deno.env.get('TTS_PROVIDER')?.trim()
  const apiKey = Deno.env.get('TTS_API_KEY')?.trim()

  if (!provider || !apiKey) {
    return jsonResponse(
      {
        audioUrl: null,
        provider: null,
        ssmlOrText: spoken,
        durationSeconds: (briefing.data.duration_seconds as number | null) ?? null,
      },
      200,
      origin,
    )
  }

  // A cached rendering is reused: synthesis is billed per character and the
  // narrative does not change once the briefing is ready.
  const storedPath = briefing.data.audio_url as string | null
  if (storedPath) {
    return jsonResponse(
      {
        audioUrl: await signedDownloadUrl(CAPTURES_BUCKET, storedPath, 3600),
        provider: briefing.data.audio_provider as string | null,
        ssmlOrText: spoken,
        durationSeconds: (briefing.data.duration_seconds as number | null) ?? null,
      },
      200,
      origin,
    )
  }

  try {
    const voice = body.voice ?? Deno.env.get('TTS_VOICE_ID')?.trim() ?? 'alloy'
    const model = Deno.env.get('TTS_MODEL')?.trim() ?? 'tts-1'
    const endpoint =
      Deno.env.get('TTS_URL')?.trim() ?? 'https://api.openai.com/v1/audio/speech'

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        voice,
        input: spoken.slice(0, 4000),
        speed: body.speed,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(45_000),
    })

    if (!response.ok) throw new AppError('provider_unavailable', { detail: `tts_${response.status}` })

    const audio = new Uint8Array(await response.arrayBuffer())
    const path = `${user.id}/briefing-${body.briefingId}.mp3`
    await uploadBytes(CAPTURES_BUCKET, path, audio, 'audio/mpeg')

    await client
      .from('briefings')
      .update({ audio_url: path, audio_provider: provider })
      .eq('id', body.briefingId)
      .eq('user_id', user.id)

    return jsonResponse(
      {
        audioUrl: await signedDownloadUrl(CAPTURES_BUCKET, path, 3600),
        provider,
        ssmlOrText: spoken,
        durationSeconds: (briefing.data.duration_seconds as number | null) ?? null,
      },
      200,
      origin,
    )
  } catch {
    // Synthesis failed; the device can still speak it, so the feature degrades
    // rather than erroring.
    return jsonResponse(
      {
        audioUrl: null,
        provider: null,
        ssmlOrText: spoken,
        durationSeconds: (briefing.data.duration_seconds as number | null) ?? null,
      },
      200,
      origin,
    )
  }
})
