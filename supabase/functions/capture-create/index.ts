import { assertUrlAllowed, captureAnalysisSchema, createCaptureRequestSchema } from '@da/validation'
import { AppError, systemClock, verifyDateAgainstSource } from '../_shared/domain.ts'
import { completeJson, isAiConfigured, truncateForModel } from '../_shared/ai.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { fetchWithLimits, jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { checkAiBudget, consumeRateLimit, loadEntitlements } from '../_shared/limits.ts'
import { captureSystem } from '../_shared/prompts.ts'
import { CAPTURES_BUCKET, downloadToText } from '../_shared/storage.ts'
import { MAX_REDIRECTS, MAX_RESPONSE_BYTES, FETCH_TIMEOUT_MS } from '@da/validation'

const CAPTURE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'intent',
    'title',
    'summary',
    'startsAt',
    'endsAt',
    'dateQuote',
    'location',
    'people',
    'amount',
    'reference',
    'keyPoints',
    'suggestedActions',
    'confidence',
  ],
  properties: {
    intent: {
      type: 'string',
      enum: [
        'event',
        'task',
        'deadline',
        'person',
        'note',
        'payment',
        'reservation',
        'travel',
        'product_info',
      ],
    },
    title: { type: 'string', maxLength: 200 },
    summary: { type: 'string', maxLength: 800 },
    startsAt: { type: ['string', 'null'] },
    endsAt: { type: ['string', 'null'] },
    dateQuote: { type: ['string', 'null'], maxLength: 600 },
    location: { type: ['string', 'null'], maxLength: 200 },
    people: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 120 } },
    amount: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['value', 'currency'],
      properties: { value: { type: 'number' }, currency: { type: 'string' } },
    },
    reference: { type: ['string', 'null'], maxLength: 80 },
    keyPoints: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 240 } },
    suggestedActions: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'label', 'params'],
        properties: {
          kind: {
            type: 'string',
            enum: [
              'open_source',
              'draft_reply',
              'create_task',
              'add_to_calendar',
              'set_reminder',
              'prepare_meeting',
              'mark_done',
              'track_shipment',
              'open_person',
              'dismiss',
            ],
          },
          label: { type: 'string', maxLength: 60 },
          params: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
}

/**
 * Fetch a user-supplied URL safely.
 *
 * The SSRF guard runs before the first request *and* after every redirect: a
 * public URL that 302s to the cloud metadata endpoint is the entire attack, and
 * checking only the original would miss it. Redirects are followed manually for
 * exactly that reason.
 */
async function fetchLinkText(rawUrl: string): Promise<string> {
  let current = rawUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertUrlAllowed(current)

    const { response, body } = await fetchWithLimits(
      current,
      {
        redirect: 'manual',
        headers: {
          accept: 'text/html,text/plain;q=0.9',
          'user-agent': 'DijitalAsistan/1.0 (+https://dijitalasistan.app)',
        },
      },
      { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_RESPONSE_BYTES, errorCode: 'capture_failed' },
    )

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new AppError('capture_failed', { detail: 'redirect_without_location' })
      current = new URL(location, current).toString()
      continue
    }

    if (!response.ok) {
      throw new AppError('capture_failed', { detail: `http_${response.status}` })
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new AppError('unsupported_file_type', { detail: contentType.slice(0, 60) })
    }

    return stripHtml(body)
  }

  throw new AppError('capture_failed', { detail: 'too_many_redirects' })
}

function stripHtml(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  const description =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? ''

  const text = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return [title, description, text].filter(Boolean).join('\n\n')
}

/**
 * Universal Capture: take something the user grabbed and work out what it is.
 *
 * Every extracted date is re-derived from the source text with the
 * deterministic extractor and dropped when it cannot be found, so a capture
 * never puts a meeting in the calendar on a day the poster did not name.
 */
serveFunction('capture-create', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, createCaptureRequestSchema)
  const now = systemClock.now()
  const profile = await loadUserContext(user.id)
  const client = serviceClient()

  await consumeRateLimit(user.id, 'captureAnalyze')
  const entitlements = await loadEntitlements(user.id, now)

  const created = await client
    .from('captures')
    .insert({
      user_id: user.id,
      kind: body.kind,
      status: 'analyzing',
      storage_path: body.storagePath,
      source_url: body.sourceUrl,
      raw_text: body.rawText,
      mime_type: body.mimeType,
      size_bytes: body.sizeBytes,
    })
    .select('id')
    .single()
  if (created.error) throw dbError(created.error)

  const captureId = created.data.id as string

  const fail = async (reason: string): Promise<Response> => {
    await client
      .from('captures')
      .update({ status: 'failed', failure_reason: reason })
      .eq('id', captureId)
      .eq('user_id', user.id)
    return jsonResponse(
      { capture: { id: captureId, status: 'failed', failureReason: reason } },
      200,
      origin,
    )
  }

  try {
    let sourceText = ''

    switch (body.kind) {
      case 'text':
        sourceText = body.rawText ?? ''
        break
      case 'link': {
        if (!body.sourceUrl) return await fail('missing_url')
        sourceText = await fetchLinkText(body.sourceUrl)
        break
      }
      case 'pdf':
      case 'file': {
        if (!body.storagePath) return await fail('missing_file')
        sourceText = await downloadToText(CAPTURES_BUCKET, body.storagePath)
        break
      }
      case 'photo':
      case 'camera':
        // Reading a photo needs a vision-capable model. Rather than guess at
        // the contents, the capture is stored and the user is told plainly.
        if (!isAiConfigured()) return await fail('ai_not_configured')
        sourceText = body.rawText ?? ''
        if (!sourceText.trim()) return await fail('image_analysis_unavailable')
        break
    }

    if (!sourceText.trim()) return await fail('no_readable_content')
    if (!isAiConfigured()) return await fail('ai_not_configured')

    await checkAiBudget(user.id, entitlements, now)

    const analysis = await completeJson({
      userId: user.id,
      operation: 'capture_analyze',
      parse: (value) => captureAnalysisSchema.safeParse(value),
      request: {
        tier: 'fast',
        schemaName: 'capture_analysis',
        jsonSchema: CAPTURE_JSON_SCHEMA,
        system: captureSystem({
          locale: profile.locale,
          nowIso: now.toISOString(),
          timeZone: profile.timeZone,
          kind: body.kind,
        }),
        messages: [{ role: 'user', content: truncateForModel(sourceText) }],
        maxOutputTokens: 1200,
      },
    })

    // Verify the dates independently; an unverifiable one is dropped rather
    // than surfaced as an event the user might approve.
    let startsAt = analysis.startsAt
    let endsAt = analysis.endsAt
    if (startsAt && !verifyDateAgainstSource(startsAt, sourceText, now, profile.timeZone)) {
      startsAt = null
      endsAt = null
    }

    const extracted = {
      title: analysis.title,
      summary: analysis.summary,
      startsAt,
      endsAt,
      location: analysis.location,
      people: analysis.people,
      amount: analysis.amount,
      reference: analysis.reference,
      keyPoints: analysis.keyPoints,
      confidence: analysis.confidence,
      suggestedActions: analysis.suggestedActions,
    }

    const { data, error } = await client
      .from('captures')
      .update({
        status: 'ready',
        detected_intent: analysis.intent,
        extracted,
        raw_text: sourceText.slice(0, 20_000),
        analyzed_at: now.toISOString(),
      })
      .eq('id', captureId)
      .eq('user_id', user.id)
      .select('*')
      .single()
    if (error) throw dbError(error)

    await audit({
      userId: user.id,
      action: 'capture.analyzed',
      entityType: 'capture',
      entityId: captureId,
      metadata: { kind: body.kind, intent: analysis.intent, hasDate: startsAt !== null },
    })

    return jsonResponse({ capture: data }, 200, origin)
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'capture_failed'
    await client
      .from('captures')
      .update({ status: 'failed', failure_reason: code })
      .eq('id', captureId)
      .eq('user_id', user.id)
    throw error
  }
})
