import { AppError, isAppError } from '@da/domain'
import { QueryClient } from '@tanstack/react-query'
import { reportError } from './error-reporting'

/**
 * Query client configuration.
 *
 * The retry policy is the interesting part: an `AppError` already knows whether
 * it is worth retrying, so there is no second, contradictory guess here. A 401
 * or a validation failure fails immediately; a timeout or a 503 gets three
 * attempts with backoff.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Briefings and feeds are regenerated server-side on a schedule, so a
        // one-minute window keeps navigation instant without showing yesterday.
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        retry: (failureCount, error) => {
          if (isAppError(error) && !error.retryable) return false
          return failureCount < 2
        },
        retryDelay: (attempt) => Math.min(8_000, 2 ** attempt * 500),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // Mutations are user-initiated writes; a silent retry could double-send.
        // Idempotency keys make the explicit retry path safe instead.
        retry: false,
        onError: (error) => {
          reportError(error, {
            scope: 'mutation',
            extra: isAppError(error) ? { code: error.code } : {},
          })
        },
      },
    },
  })
}

/**
 * Turn any thrown value into the localised message key the UI should render.
 * Screens call this instead of touching `error.message`, which is how a raw
 * provider string is prevented from ever reaching the screen.
 */
export function errorMessageKey(error: unknown): string {
  if (isAppError(error)) return error.messageKey
  return new AppError('unknown').messageKey
}

export function errorValues(error: unknown): Record<string, string | number> | undefined {
  return isAppError(error) ? error.values : undefined
}

export function isRetryable(error: unknown): boolean {
  return isAppError(error) ? error.retryable : true
}
