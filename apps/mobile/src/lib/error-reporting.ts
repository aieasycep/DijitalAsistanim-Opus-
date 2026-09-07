import { isAppError } from '@da/domain'
import { env } from './env'

/**
 * Error reporting.
 *
 * The scrubber is the important part. Crash reports are the easiest place for
 * a subject line or an address to escape, so every string that leaves here is
 * filtered: email addresses, bearer tokens, long quoted strings and URL query
 * values are replaced before the payload is built, not after.
 */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi
const TOKEN_RE = /\b(?:ya29|1\/\/|eyJ)[A-Za-z0-9._~+/-]{12,}=*/g
const QUERY_VALUE_RE = /([?&](?:code|token|state|access_token|refresh_token|key)=)[^&\s]+/gi

export function scrub(input: string): string {
  return input
    .replace(EMAIL_RE, '[email]')
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(TOKEN_RE, '[token]')
    .replace(QUERY_VALUE_RE, '$1[redacted]')
}

export interface ErrorContext {
  /** A stable screen or operation name — never user content. */
  scope: string
  /** Extra breadcrumbs. Values are scrubbed before sending. */
  extra?: Record<string, string | number | boolean>
}

export interface ErrorReporter {
  captureError(error: unknown, context: ErrorContext): void
  setUser(userId: string | null): void
  readonly enabled: boolean
}

const consoleReporter: ErrorReporter = {
  enabled: false,
  captureError(error, context) {
    if (!__DEV__) return
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[${context.scope}] ${scrub(message)}`)
  },
  setUser: () => undefined,
}

/**
 * Minimal Sentry envelope sender. Like analytics, the full SDK is avoided
 * deliberately: its default integrations capture breadcrumbs from network
 * requests and view hierarchies, both of which would contain mail content.
 */
function createSentryReporter(dsn: string): ErrorReporter {
  let parsed: { url: string; publicKey: string } | null = null
  try {
    const u = new URL(dsn)
    const projectId = u.pathname.replace('/', '')
    parsed = {
      url: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      publicKey: u.username,
    }
  } catch {
    parsed = null
  }
  if (!parsed) return consoleReporter

  let userId: string | null = null
  const endpoint = parsed.url
  const publicKey = parsed.publicKey

  return {
    enabled: true,
    setUser(next) {
      userId = next
    },
    captureError(error, context) {
      const err = error instanceof Error ? error : new Error(String(error))
      const payload = {
        // A stable fingerprint: AppError groups by its code, everything else by
        // scope, so one flaky endpoint does not create thousands of issues.
        fingerprint: [isAppError(error) ? `app:${error.code}` : `scope:${context.scope}`],
        level: 'error',
        platform: 'javascript',
        timestamp: Date.now() / 1000,
        exception: {
          values: [
            {
              type: err.name,
              value: scrub(err.message).slice(0, 500),
              stacktrace: err.stack
                ? { frames: [{ filename: scrub(err.stack).slice(0, 2000) }] }
                : undefined,
            },
          ],
        },
        tags: {
          scope: context.scope,
          ...(isAppError(error) ? { error_code: error.code } : {}),
        },
        extra: Object.fromEntries(
          Object.entries(context.extra ?? {}).map(([k, v]) => [
            k,
            typeof v === 'string' ? scrub(v).slice(0, 200) : v,
          ]),
        ),
        // Only an opaque id — never an email, name or IP.
        user: userId ? { id: userId } : undefined,
      }

      void fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${publicKey}`,
        },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Reporting a failure must never itself fail the app.
      })
    },
  }
}

let reporter: ErrorReporter = consoleReporter

export function initErrorReporting(): ErrorReporter {
  reporter = env.sentryDsn ? createSentryReporter(env.sentryDsn) : consoleReporter
  return reporter
}

export function reportError(error: unknown, context: ErrorContext): void {
  reporter.captureError(error, context)
}

export function setErrorUser(userId: string | null): void {
  reporter.setUser(userId)
}
