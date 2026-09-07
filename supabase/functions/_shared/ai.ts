import { AppError } from './domain.ts'
import { fetchWithLimits } from './http.ts'
import { serviceClient } from './db.ts'

/**
 * AI provider abstraction.
 *
 * Two tiers, because cost is a product constraint: a small model handles
 * classification and extraction (the high-volume path), and a capable model
 * handles briefing narrative, meeting prep and the assistant. Which vendor
 * backs each tier is an environment decision — `AI_PROVIDER=anthropic|openai`
 * — so neither the prompts nor the callers know the difference.
 *
 * Every call returns JSON validated against a Zod schema by the caller. A
 * response that fails validation is retried once with the validation error fed
 * back, then abandoned; a malformed extraction is never persisted.
 */

export type ModelTier = 'fast' | 'reasoning'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiRequest {
  tier: ModelTier
  system: string
  messages: AiMessage[]
  /** JSON Schema the model must satisfy. */
  jsonSchema: Record<string, unknown>
  schemaName: string
  maxOutputTokens?: number
  /** Deterministic by default: the same mail must classify the same way twice. */
  temperature?: number
}

export interface AiResponse {
  json: unknown
  model: string
  tokensIn: number
  tokensOut: number
}

export interface AiProvider {
  readonly name: string
  complete(request: AiRequest): Promise<AiResponse>
}

function env(name: string): string | undefined {
  const value = Deno.env.get(name)
  return value && value.trim() !== '' ? value.trim() : undefined
}

// ── Anthropic ────────────────────────────────────────────────────────────────

function anthropicProvider(apiKey: string): AiProvider {
  const models: Record<ModelTier, string> = {
    fast: env('ANTHROPIC_CLASSIFY_MODEL') ?? 'claude-haiku-4-5-20251001',
    reasoning: env('ANTHROPIC_REASONING_MODEL') ?? 'claude-sonnet-5',
  }

  return {
    name: 'anthropic',
    async complete(request) {
      const model = models[request.tier]
      // A forced tool call is Anthropic's structured-output mechanism: the
      // model must emit an argument object matching the schema, which removes
      // the "model wrapped its JSON in prose" failure mode entirely.
      const body = {
        model,
        max_tokens: request.maxOutputTokens ?? 2048,
        temperature: request.temperature ?? 0,
        system: request.system,
        tools: [
          {
            name: request.schemaName,
            description: 'Return the structured result.',
            input_schema: request.jsonSchema,
          },
        ],
        tool_choice: { type: 'tool', name: request.schemaName },
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      }

      const { response, body: text } = await fetchWithLimits(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        },
        { timeoutMs: 60_000, errorCode: 'ai_unavailable' },
      )

      if (response.status === 429) throw new AppError('ai_quota_exceeded')
      if (!response.ok) {
        throw new AppError('ai_unavailable', { detail: `anthropic_${response.status}` })
      }

      const parsed = JSON.parse(text) as {
        content?: Array<{ type: string; input?: unknown }>
        usage?: { input_tokens?: number; output_tokens?: number }
      }
      const toolUse = parsed.content?.find((c) => c.type === 'tool_use')
      if (!toolUse || toolUse.input === undefined) {
        throw new AppError('ai_invalid_output', { detail: 'no_tool_use_block' })
      }

      return {
        json: toolUse.input,
        model,
        tokensIn: parsed.usage?.input_tokens ?? 0,
        tokensOut: parsed.usage?.output_tokens ?? 0,
      }
    },
  }
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

function openAiProvider(apiKey: string): AiProvider {
  const models: Record<ModelTier, string> = {
    fast: env('OPENAI_CLASSIFY_MODEL') ?? 'gpt-4.1-mini',
    reasoning: env('OPENAI_REASONING_MODEL') ?? 'gpt-4.1',
  }

  return {
    name: 'openai',
    async complete(request) {
      const model = models[request.tier]
      const body = {
        model,
        temperature: request.temperature ?? 0,
        max_tokens: request.maxOutputTokens ?? 2048,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName,
            // Strict mode makes the schema a hard constraint rather than a hint.
            strict: true,
            schema: request.jsonSchema,
          },
        },
        messages: [
          { role: 'system', content: request.system },
          ...request.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }

      const { response, body: text } = await fetchWithLimits(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        },
        { timeoutMs: 60_000, errorCode: 'ai_unavailable' },
      )

      if (response.status === 429) throw new AppError('ai_quota_exceeded')
      if (!response.ok) {
        throw new AppError('ai_unavailable', { detail: `openai_${response.status}` })
      }

      const parsed = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const content = parsed.choices?.[0]?.message?.content
      if (!content) throw new AppError('ai_invalid_output', { detail: 'empty_completion' })

      let json: unknown
      try {
        json = JSON.parse(content)
      } catch {
        throw new AppError('ai_invalid_output', { detail: 'not_json' })
      }

      return {
        json,
        model,
        tokensIn: parsed.usage?.prompt_tokens ?? 0,
        tokensOut: parsed.usage?.completion_tokens ?? 0,
      }
    },
  }
}

function buildProvider(name: string): AiProvider | null {
  if (name === 'anthropic') {
    const key = env('ANTHROPIC_API_KEY')
    return key ? anthropicProvider(key) : null
  }
  if (name === 'openai') {
    const key = env('OPENAI_API_KEY')
    return key ? openAiProvider(key) : null
  }
  return null
}

/**
 * The configured provider, or null when no AI key is present.
 *
 * Null is a supported state, not an error: without a key the pipeline still
 * runs its deterministic stages, the feed still ranks by rules and VIPs, and
 * the UI says the AI summary is unavailable rather than crashing.
 */
export function getAiProvider(): AiProvider | null {
  return buildProvider(env('AI_PROVIDER') ?? 'anthropic')
}

export function getFallbackProvider(): AiProvider | null {
  const name = env('AI_FALLBACK_PROVIDER')
  return name ? buildProvider(name) : null
}

export function isAiConfigured(): boolean {
  return getAiProvider() !== null
}

export interface CompleteJsonOptions<T> {
  request: AiRequest
  /** Zod-style parser. */
  parse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown }
  userId: string
  operation: string
}

/**
 * Run a model call and validate it.
 *
 * On a schema mismatch the call is retried once with the failure appended to
 * the conversation, which recovers the common "model omitted a required
 * nullable field" case. A second failure raises `ai_invalid_output` rather
 * than persisting something unvalidated.
 */
export async function completeJson<T>(options: CompleteJsonOptions<T>): Promise<T> {
  const primary = getAiProvider()
  if (!primary) throw new AppError('ai_unavailable', { detail: 'no_provider_configured' })

  const attempt = async (provider: AiProvider, messages: AiMessage[]): Promise<{ value: T; usage: AiResponse }> => {
    const response = await provider.complete({ ...options.request, messages })
    const result = options.parse(response.json)
    if (!result.success) {
      throw new AppError('ai_invalid_output', { detail: 'schema_mismatch' })
    }
    return { value: result.data, usage: response }
  }

  let usedProvider = primary
  let outcome: { value: T; usage: AiResponse }

  try {
    outcome = await attempt(primary, options.request.messages)
  } catch (firstError) {
    const isSchemaProblem =
      firstError instanceof AppError && firstError.code === 'ai_invalid_output'

    if (isSchemaProblem) {
      outcome = await attempt(primary, [
        ...options.request.messages,
        {
          role: 'user',
          content:
            'Önceki yanıt beklenen şemayla eşleşmedi. Şemadaki her alanı, bilinmiyorsa null olarak, eksiksiz döndür.',
        },
      ])
    } else {
      const fallback = getFallbackProvider()
      if (!fallback) throw firstError
      usedProvider = fallback
      outcome = await attempt(fallback, options.request.messages)
    }
  }

  // Usage is recorded as counts only — never the prompt or the completion.
  await recordUsage({
    userId: options.userId,
    model: outcome.usage.model,
    provider: usedProvider.name,
    operation: options.operation,
    tokensIn: outcome.usage.tokensIn,
    tokensOut: outcome.usage.tokensOut,
  })

  return outcome.value
}

interface UsageRecord {
  userId: string
  model: string
  provider: string
  operation: string
  tokensIn: number
  tokensOut: number
}

async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    await serviceClient().from('ai_usage_events').insert({
      user_id: record.userId,
      model: `${record.provider}:${record.model}`,
      operation: record.operation,
      tokens_in: record.tokensIn,
      tokens_out: record.tokensOut,
    })
  } catch {
    // Telemetry must never fail the operation it is measuring.
  }
}

/**
 * The anti-hallucination preamble every prompt inherits.
 *
 * Stated as hard constraints rather than preferences, and paired with the
 * schema's nullable fields so "I could not find it" is always an available and
 * legal answer — a model with no legal way to say "unknown" will invent.
 */
export const GROUNDING_RULES = `KURALLAR — bunlara istisnasız uy:
- Yalnızca sana verilen kaynak metinde açıkça yazan bilgiyi kullan.
- Tarih, saat, tutar, kişi adı, rezervasyon/uçuş/kargo numarası veya toplantı bilgisini ASLA tahmin etme veya üretme.
- Bir bilgi kaynakta yoksa ilgili alanı null bırak. Boş bırakmak, uydurmaktan her zaman doğrudur.
- Bir tarih veya tutar bildiriyorsan, onu okuduğun cümleyi kaynaktan birebir alıntı olarak ilgili "quote" alanına yaz.
- Alıntı, kaynak metinde geçtiği gibi olmalı; yeniden yazma veya özetleme.
- Emin değilsen güven skorunu (confidence) düşük ver.
- Kullanıcının dilinde yaz: Türkçe içerik için Türkçe, İngilizce içerik için İngilizce.`

/** Cost-control ceiling: text handed to the fast tier is truncated to this. */
export const MAX_INPUT_CHARS = 12_000

export function truncateForModel(text: string, maxChars = MAX_INPUT_CHARS): string {
  if (text.length <= maxChars) return text
  // Keep the head and the tail: signatures, deadlines and sign-offs live at the
  // end, so a naive head-only truncation loses exactly the interesting part.
  const head = Math.floor(maxChars * 0.7)
  const tail = maxChars - head - 20
  return `${text.slice(0, head)}\n[…]\n${text.slice(-tail)}`
}
