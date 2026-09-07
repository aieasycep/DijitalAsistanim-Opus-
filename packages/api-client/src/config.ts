import { AppError, type Clock } from '@da/domain'

/**
 * Everything the gateway needs to reach the backend. The app owns session
 * storage, so the client asks for a token per request instead of caching one.
 */
export interface ApiClientConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  getAccessToken: () => Promise<string | null>
  clock: Clock
  mode: 'live' | 'demo'
  /** Injectable for tests and for runtimes without a global `fetch`. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export const DEFAULT_TIMEOUT_MS = 20_000
/** One initial call plus at most two retries. */
export const MAX_ATTEMPTS = 3
export const RETRY_BASE_DELAY_MS = 400
export const RETRY_MAX_DELAY_MS = 4_000

export function resolveFetch(config: ApiClientConfig): typeof fetch {
  if (config.fetchImpl) return config.fetchImpl
  const globalFetch = globalThis.fetch
  if (typeof globalFetch !== 'function') {
    throw new AppError('unknown', { detail: 'no fetch implementation available' })
  }
  return globalFetch.bind(globalThis)
}

export function functionUrl(config: ApiClientConfig, name: string): string {
  return `${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`
}

/** Exponential backoff; `attempt` is 1 for the first retry. */
export function retryDelayMs(attempt: number): number {
  const exponential = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1)
  return Math.min(RETRY_MAX_DELAY_MS, exponential)
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
