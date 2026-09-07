import { AppError, type ErrorCode, toAppError } from './domain.ts'

/**
 * The request/response envelope every edge function shares.
 *
 * Two things it guarantees:
 *   - a handler can throw an `AppError` and the client receives a stable code
 *     with the right HTTP status, never a stack trace or a provider message;
 *   - an unexpected throw becomes a generic 500 with the detail logged
 *     server-side only, so an upstream error string cannot leak to the app.
 */

const ALLOWED_HEADERS = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
  'x-idempotency-key',
].join(', ')

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    // The mobile app sends no Origin; the marketing site and the local dev
    // server do. Echoing the origin keeps credentials working without a
    // wildcard, which browsers reject alongside Authorization.
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function jsonResponse(
  body: unknown,
  status = 200,
  origin: string | null = null,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Every response is user-specific; a shared cache must never keep one.
      'cache-control': 'no-store',
      ...corsHeaders(origin),
      ...extraHeaders,
    },
  })
}

export function errorResponse(error: AppError, origin: string | null = null): Response {
  return jsonResponse({ error: error.toJSON() }, error.status, origin)
}

export interface HandlerContext {
  request: Request
  origin: string | null
  /** Correlates every log line and audit row for one request. */
  requestId: string
}

export type Handler = (context: HandlerContext) => Promise<Response>

/**
 * Wrap a handler with CORS preflight, error translation and request logging.
 * Log lines carry the request id and the error code — never a body, an address
 * or a token.
 */
export function serveFunction(name: string, handler: Handler): void {
  Deno.serve(async (request) => {
    const origin = request.headers.get('origin')
    const requestId = crypto.randomUUID()

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const startedAt = Date.now()
    try {
      const response = await handler({ request, origin, requestId })
      console.log(
        JSON.stringify({
          fn: name,
          requestId,
          status: response.status,
          ms: Date.now() - startedAt,
        }),
      )
      return response
    } catch (error) {
      const appError = toAppError(error)
      console.error(
        JSON.stringify({
          fn: name,
          requestId,
          status: appError.status,
          code: appError.code,
          // `detail` is our own message, never an upstream body.
          detail: appError.detail ?? null,
          ms: Date.now() - startedAt,
        }),
      )
      return errorResponse(appError, origin)
    }
  })
}

/** Parse and validate a JSON body with a Zod schema, or fail with 422. */
export async function parseBody<T>(
  request: Request,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown } },
): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new AppError('validation_failed', { detail: 'body_not_json' })
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new AppError('validation_failed', { detail: 'schema_mismatch' })
  }
  return result.data
}

/**
 * Fetch with a timeout and a bounded response size.
 *
 * Every outbound call to a provider goes through this: without a timeout a
 * hung upstream holds an edge invocation open until it is killed, and without
 * a size cap a large attachment can exhaust the function's memory.
 */
export async function fetchWithLimits(
  url: string,
  init: RequestInit,
  options: { timeoutMs?: number; maxBytes?: number; errorCode?: ErrorCode } = {},
): Promise<{ response: Response; body: string }> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...init, signal: controller.signal })

    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > maxBytes) {
      throw new AppError('file_too_large', { detail: `content_length:${declared}` })
    }

    const reader = response.body?.getReader()
    if (!reader) return { response, body: '' }

    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel()
        throw new AppError('file_too_large', { detail: `streamed:${received}` })
      }
      chunks.push(value)
    }

    const merged = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }

    return { response, body: new TextDecoder().decode(merged) }
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AppError('network_timeout', { detail: `timeout:${timeoutMs}ms` })
    }
    throw new AppError(options.errorCode ?? 'provider_unavailable', {
      detail: error instanceof Error ? error.message.slice(0, 200) : 'fetch_failed',
      cause: error,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Retry an idempotent operation with exponential backoff, honouring a
 * `Retry-After` header when the provider sends one. Only rate limits and
 * transient upstream failures are retried; a 4xx is returned to the caller.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3
  const baseDelay = options.baseDelayMs ?? 500
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const appError = toAppError(error)
      if (!appError.retryable || attempt === attempts - 1) throw appError
      await new Promise((resolve) => setTimeout(resolve, baseDelay * 2 ** attempt))
    }
  }

  throw toAppError(lastError)
}
