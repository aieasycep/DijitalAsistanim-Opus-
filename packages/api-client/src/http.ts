import { AppError, ERROR_CODES, type ErrorCode, isAppError, toAppError } from '@da/domain'
import { apiErrorSchema } from '@da/validation'
import { z } from 'zod'
import {
  DEFAULT_TIMEOUT_MS,
  MAX_ATTEMPTS,
  type ApiClientConfig,
  functionUrl,
  resolveFetch,
  retryDelayMs,
  sleep,
} from './config'

/**
 * A schema whose *output* is `T` and whose input is unvalidated JSON. Request
 * schemas (which carry defaults, so their input differs from their output) and
 * response schemas both satisfy it.
 */
export type ResponseSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>

/**
 * A row an edge function already shaped and RLS-scoped. The envelope is
 * validated; the mapper narrows the row itself into a domain entity.
 */
export function rowOf<T>(): ResponseSchema<T> {
  return z
    .record(z.string(), z.unknown())
    .transform((value) => value as unknown as T) as ResponseSchema<T>
}

export const okSchema = z.object({ ok: z.boolean() })

export interface CallOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** Off for calls whose retry could duplicate an external side effect. */
  retry?: boolean
}

export interface Http {
  callFunction<T>(
    name: string,
    body: unknown,
    schema: ResponseSchema<T>,
    options?: CallOptions,
  ): Promise<T>
}

/** Validate an outgoing body before it can reach the network. */
export function parseRequest<T>(schema: ResponseSchema<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new AppError('validation_failed', { detail: issueDetail(result.error) })
  }
  return result.data
}

/** Statuses worth trying again; everything else is a decision, not a hiccup. */
const RETRY_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504])
const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'network_offline',
  'network_timeout',
  'server_unavailable',
  'rate_limited',
])

export function createHttp(config: ApiClientConfig): Http {
  const fetchImpl = resolveFetch(config)
  const defaultTimeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function requestOnce(name: string, body: unknown, options: CallOptions): Promise<unknown> {
    const token = await config.getAccessToken()
    const controller = new AbortController()
    const external = options.signal
    const forwardAbort = (): void => controller.abort()
    if (external) {
      if (external.aborted) controller.abort()
      else external.addEventListener('abort', forwardAbort)
    }
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, options.timeoutMs ?? defaultTimeout)

    try {
      const response = await fetchImpl(functionUrl(config, name), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: config.supabaseAnonKey,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      })
      if (!response.ok) throw await errorFromResponse(response, name)
      if (response.status === 204) return {}
      const text = await response.text()
      if (text.length === 0) return {}
      return decodeJson(text, name)
    } catch (error) {
      throw normalizeTransportError(error, timedOut, name)
    } finally {
      clearTimeout(timer)
      if (external) external.removeEventListener('abort', forwardAbort)
    }
  }

  return {
    async callFunction<T>(
      name: string,
      body: unknown,
      schema: ResponseSchema<T>,
      options: CallOptions = {},
    ): Promise<T> {
      const maxAttempts = options.retry === false ? 1 : MAX_ATTEMPTS
      let lastError = new AppError('unknown', { detail: name })
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (attempt > 0) await sleep(retryDelayMs(attempt))
        try {
          const payload = await requestOnce(name, body, options)
          const parsed = schema.safeParse(payload)
          if (!parsed.success) {
            throw new AppError('ai_invalid_output', {
              detail: `${name}: ${issueDetail(parsed.error)}`,
            })
          }
          return parsed.data
        } catch (error) {
          const appError = toAppError(error, 'unknown')
          const canRetry = appError.retryable && RETRYABLE_CODES.has(appError.code)
          if (!canRetry || attempt === maxAttempts - 1) throw appError
          lastError = appError
        }
      }
      throw lastError
    },
  }
}

function issueDetail(error: z.ZodError): string {
  const first = error.issues[0]
  if (!first) return 'schema mismatch'
  const path = first.path.join('.')
  return path.length > 0 ? `${path}: ${first.message}` : first.message
}

function decodeJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AppError('ai_invalid_output', { detail: `${name}: response was not JSON` })
  }
}

async function errorFromResponse(response: Response, name: string): Promise<AppError> {
  const body = await readBody(response)
  const server = extractServerError(body)
  const status = response.status
  const code = server?.code ?? statusToCode(status)
  return new AppError(code, {
    detail: `${name}: HTTP ${status}`,
    status,
    retryable: RETRY_STATUSES.has(status),
    ...(server?.values ? { values: server.values } : {}),
  })
}

async function readBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text()
    if (text.length === 0) return null
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

interface ServerError {
  code: ErrorCode
  values?: Record<string, string | number>
}

function extractServerError(body: unknown): ServerError | null {
  if (body === null || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  const candidate =
    'error' in record && typeof record['error'] === 'object' ? record['error'] : record
  const parsed = apiErrorSchema.safeParse(candidate)
  if (!parsed.success) return null
  if (!isErrorCode(parsed.data.code)) return null
  return parsed.data.values
    ? { code: parsed.data.code, values: parsed.data.values }
    : { code: parsed.data.code }
}

function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value)
}

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 401:
      return 'unauthorized'
    case 402:
      return 'entitlement_required'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 409:
      return 'sync_conflict'
    case 410:
      return 'approval_expired'
    case 413:
      return 'file_too_large'
    case 415:
      return 'unsupported_file_type'
    case 422:
      return 'validation_failed'
    case 429:
      return 'rate_limited'
    default:
      break
  }
  if (status >= 500) return 'server_unavailable'
  if (status >= 400) return 'validation_failed'
  return 'unknown'
}

/** No raw fetch or Zod error ever escapes this module. */
function normalizeTransportError(error: unknown, timedOut: boolean, name: string): AppError {
  if (isAppError(error)) return error
  const aborted =
    error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
  if (aborted) {
    // A caller-driven abort is a cancellation, not a condition to retry.
    return new AppError('network_timeout', {
      detail: `${name}: aborted`,
      retryable: timedOut,
      cause: error,
    })
  }
  return new AppError('network_offline', { detail: `${name}: request failed`, cause: error })
}
