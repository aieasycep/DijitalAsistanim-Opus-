import {
  assertUrlAllowed,
  captureCreateAnalysis,
  captureCreateRequest,
  FETCH_TIMEOUT_MS,
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  verifyQuotes,
  type CaptureCreateResponse,
  type CaptureExtractionRecord,
} from '@da/validation'
import { AppError, systemClock, verifyDateAgainstSource } from '../_shared/domain.ts'
import { completeJson, isAiConfigured, truncateForModel } from '../_shared/ai.ts'
import { audit } from '../_shared/audit.ts'
import { dbError, loadUserContext, requireUser, serviceClient } from '../_shared/db.ts'
import { fetchWithLimits, jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { checkAiBudget, consumeRateLimit, loadEntitlements } from '../_shared/limits.ts'
import { captureSystem } from '../_shared/prompts.ts'
import { CAPTURES_BUCKET, downloadToText } from '../_shared/storage.ts'

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
    'amountQuote',
    'reference',
    'referenceQuote',
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
    dateQuote: {
      type: ['string', 'null'],
      maxLength: 600,
      description:
        'startsAt hangi cümleden okunduysa o cümle, içerikte birebir geçtiği hâliyle. startsAt doluysa zorunlu.',
    },
    location: { type: ['string', 'null'], maxLength: 200 },
    people: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 120 } },
    amount: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['value', 'currency'],
      properties: { value: { type: 'number' }, currency: { type: 'string' } },
      description: 'Yalnızca içerikte yazan tutar. Hesaplama yapma, para birimini uydurma.',
    },
    amountQuote: {
      type: ['string', 'null'],
      maxLength: 600,
      description:
        'Tutarın okunduğu satır, içerikte birebir geçtiği hâliyle. amount doluysa zorunlu; alıntı veremiyorsan amount null olsun.',
    },
    reference: {
      type: ['string', 'null'],
      maxLength: 80,
      description: 'Kargo takip numarası, PNR, rezervasyon kodu. Yalnızca içerikte yazıyorsa.',
    },
    referenceQuote: {
      type: ['string', 'null'],
      maxLength: 600,
      description:
        'Referansın okunduğu satır, içerikte birebir geçtiği hâliyle. reference doluysa zorunlu; alıntı veremiyorsan reference null olsun.',
    },
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
 * Nothing factual leaves this function unchecked. A date is re-derived from
 * the source with the deterministic extractor, so a capture never puts a
 * meeting in the calendar on a day the poster did not name; an amount and a
 * booking or tracking reference each have to be quoted from the text the model
 * was shown, and `verifyQuotes` looks the quote up before the claim is stored.
 * A claim that fails either check is dropped — the summary survives, the
 * invented total does not.
 */
serveFunction('capture-create', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, captureCreateRequest)
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

  /**
   * A capture we could not read is still a capture.
   *
   * This used to answer with a hand-built `{ id, status, failureReason }`
   * stub, which the client mapped into a `Capture` with no `kind`, no
   * `userId` and no timestamps — the screen then rendered its badge as
   * `capture.kind.undefined`. The row it just wrote is the answer, on this
   * path exactly as on the successful one.
   */
  const fail = async (reason: string): Promise<Response> => {
    const failed = await client
      .from('captures')
      .update({ status: 'failed', failure_reason: reason })
      .eq('id', captureId)
      .eq('user_id', user.id)
      .select('*')
      .single()
    if (failed.error) throw dbError(failed.error)
    const payload: CaptureCreateResponse = { capture: failed.data }
    return jsonResponse(payload, 200, origin)
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

    // The model reads a bounded slice of a long capture, and a quote can only
    // be checked against what the model was actually given: verifying against
    // the untruncated text would accept a "quote" from a passage it never saw.
    const modelText = truncateForModel(sourceText)

    const analysis = await completeJson({
      userId: user.id,
      operation: 'capture_analyze',
      parse: (value) => captureCreateAnalysis.safeParse(value),
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
        messages: [{ role: 'user', content: modelText }],
        maxOutputTokens: 1200,
      },
    })

    // Each factual claim is checked against the sentence the model says it
    // came from. A claim with no quote, or with a quote that is not in the
    // capture, is dropped: the summary survives, the invented total does not.
    const unquoted = new Set(
      verifyQuotes(modelText, [
        { field: 'date', quote: analysis.dateQuote },
        { field: 'amount', quote: analysis.amountQuote },
        { field: 'reference', quote: analysis.referenceQuote },
      ]).map((violation) => violation.field),
    )

    // The date carries a second, independent check: the deterministic
    // extractor has to find the same instant in the text, so a correctly
    // quoted sentence still cannot smuggle in a day the source does not name.
    const dateVerified =
      analysis.startsAt !== null &&
      analysis.dateQuote !== null &&
      !unquoted.has('date') &&
      verifyDateAgainstSource(analysis.startsAt, modelText, now, profile.timeZone) !== null

    const amountVerified =
      analysis.amount !== null && analysis.amountQuote !== null && !unquoted.has('amount')

    const referenceVerified =
      analysis.reference !== null && analysis.referenceQuote !== null && !unquoted.has('reference')

    const extracted: CaptureExtractionRecord = {
      title: analysis.title,
      summary: analysis.summary,
      startsAt: dateVerified ? analysis.startsAt : null,
      endsAt: dateVerified ? analysis.endsAt : null,
      dateQuote: dateVerified ? analysis.dateQuote : null,
      location: analysis.location,
      people: analysis.people,
      amount: amountVerified ? analysis.amount : null,
      amountQuote: amountVerified ? analysis.amountQuote : null,
      reference: referenceVerified ? analysis.reference : null,
      referenceQuote: referenceVerified ? analysis.referenceQuote : null,
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
      metadata: {
        kind: body.kind,
        intent: analysis.intent,
        hasDate: dateVerified,
        // Which claims the model produced and could not support. Flags only —
        // the audit trail never carries the capture's contents.
        droppedDate: analysis.startsAt !== null && !dateVerified,
        droppedAmount: analysis.amount !== null && !amountVerified,
        droppedReference: analysis.reference !== null && !referenceVerified,
      },
    })

    const payload: CaptureCreateResponse = { capture: data }
    return jsonResponse(payload, 200, origin)
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
