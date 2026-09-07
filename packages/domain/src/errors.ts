/**
 * The application's error vocabulary.
 *
 * Every failure the user can hit maps to one of these codes, and each code has
 * exactly one i18n message. That is what keeps a raw provider stack trace from
 * ever reaching the screen: the UI renders `errors.<code>`, never `err.message`.
 */

export const ERROR_CODES = [
  'network_offline',
  'network_timeout',
  'server_unavailable',
  'rate_limited',
  'unauthorized',
  'forbidden',
  'not_found',
  'validation_failed',

  'oauth_failed',
  'oauth_denied',
  'oauth_expired',
  'oauth_scope_missing',
  'oauth_revoked',

  'provider_unavailable',
  'mail_provider_unavailable',
  'calendar_provider_unavailable',
  'sync_delayed',
  'sync_conflict',

  'ai_unavailable',
  'ai_invalid_output',
  'ai_quota_exceeded',

  'capture_failed',
  'upload_failed',
  'file_too_large',
  'unsupported_file_type',
  'url_not_allowed',

  'approval_expired',
  'approval_already_executed',
  'approval_illegal_edit',
  'approval_execution_failed',

  'subscription_error',
  'entitlement_required',
  'plan_limit_reached',

  'referral_invalid',
  'referral_self',
  'referral_already_used',
  'referral_not_eligible',

  'export_failed',
  'permission_denied',
  'unknown',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export interface AppErrorOptions {
  /** Machine-readable detail for logs; never rendered to the user. */
  detail?: string
  cause?: unknown
  /** Whether the caller should offer a retry affordance. */
  retryable?: boolean
  /** Values interpolated into the localised message. */
  values?: Record<string, string | number>
  /** HTTP status to respond with when this surfaces from an edge function. */
  status?: number
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly detail?: string
  readonly retryable: boolean
  readonly values?: Record<string, string | number>
  readonly status: number

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.detail ?? code, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'AppError'
    this.code = code
    if (options.detail !== undefined) this.detail = options.detail
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE.has(code)
    if (options.values !== undefined) this.values = options.values
    this.status = options.status ?? DEFAULT_STATUS[code] ?? 500
  }

  /** The i18n key the UI renders. */
  get messageKey(): string {
    return `errors.${this.code}`
  }

  /** Safe wire shape — no cause, no stack, no provider detail. */
  toJSON(): { code: ErrorCode; retryable: boolean; values?: Record<string, string | number> } {
    return {
      code: this.code,
      retryable: this.retryable,
      ...(this.values ? { values: this.values } : {}),
    }
  }
}

const DEFAULT_RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'network_offline',
  'network_timeout',
  'server_unavailable',
  'rate_limited',
  'provider_unavailable',
  'mail_provider_unavailable',
  'calendar_provider_unavailable',
  'sync_delayed',
  'ai_unavailable',
  'upload_failed',
  'approval_execution_failed',
])

const DEFAULT_STATUS: Partial<Record<ErrorCode, number>> = {
  unauthorized: 401,
  forbidden: 403,
  permission_denied: 403,
  entitlement_required: 402,
  not_found: 404,
  validation_failed: 422,
  ai_invalid_output: 422,
  approval_illegal_edit: 422,
  rate_limited: 429,
  plan_limit_reached: 429,
  ai_quota_exceeded: 429,
  server_unavailable: 503,
  provider_unavailable: 503,
  mail_provider_unavailable: 503,
  calendar_provider_unavailable: 503,
  ai_unavailable: 503,
  url_not_allowed: 400,
  file_too_large: 413,
  unsupported_file_type: 415,
  sync_conflict: 409,
  approval_already_executed: 409,
  approval_expired: 410,
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/**
 * Coerce anything thrown into an `AppError`. Unknown throwables collapse to
 * `unknown` with their text kept only in `detail`, which is logged but never
 * displayed.
 */
export function toAppError(value: unknown, fallback: ErrorCode = 'unknown'): AppError {
  if (isAppError(value)) return value
  if (value instanceof Error) {
    return new AppError(fallback, { detail: value.message, cause: value })
  }
  return new AppError(fallback, { detail: typeof value === 'string' ? value : undefined })
}
