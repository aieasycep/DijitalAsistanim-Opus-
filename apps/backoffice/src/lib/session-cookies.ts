/**
 * Session cookies, session-window arithmetic, JWT claim reading and the CSRF
 * token — the mechanical half of the authorization layer.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE MODULE
 * ---------------------------------------------------------------------------
 *
 * Two constraints meet here.
 *
 *   1. `proxy.ts` runs at the edge and imports this file. It must therefore
 *      never reach `auth.ts` or `db.ts`, because that would pull the
 *      service-role key into the edge bundle. Nothing in this module touches
 *      the database, reads a secret, or imports anything at all.
 *
 *   2. Session expiry, CSRF derivation and claim parsing are decisions, and
 *      decisions have to be testable. Keeping them here — pure, synchronous
 *      where possible, dependent only on Web Crypto — is what lets
 *      `__tests__/session.test.ts` prove that an expired session is refused
 *      without standing up a request context.
 *
 * The only platform APIs used are `crypto.getRandomValues`, `crypto.subtle` and
 * `atob`, all three of which exist in the Node runtime, the Edge runtime and
 * Vitest.
 */

// ===========================================================================
// 1. Names and routes
// ===========================================================================

/**
 * The admin console session. An opaque random token; only its SHA-256 is stored
 * in `admin_sessions.token_hash`, so a database dump cannot be replayed.
 *
 * This cookie — not the Supabase access token — is what authorises a request.
 * `admin_touch_session()` validates and slides it server-side on every render.
 */
export const ADMIN_SESSION_COOKIE = 'da_bo_sid'

/**
 * The Supabase (GoTrue) tokens.
 *
 * They authenticate the *person* at sign-in and nothing after it: authorization
 * is `ADMIN_SESSION_COOKIE` plus `admin_users`. They are still kept because
 * (a) `proxy.ts` uses their presence to send a credential-free visitor to the
 * sign-in page without rendering, and (b) signing out revokes the GoTrue
 * session upstream as well as ending the console session.
 */
export const ACCESS_COOKIE = 'da_bo_at'
export const REFRESH_COOKIE = 'da_bo_rt'

/**
 * Where an operator without a session is sent.
 *
 * Route segments are English throughout the console — the previous mix of
 * Turkish and English URLs was a defect. The interface language is Turkish; the
 * URL space is not part of the interface language.
 */
export const SIGN_IN_PATH = '/sign-in'
/** Where an operator with a session but no grant for this page is sent. */
export const UNAUTHORIZED_PATH = '/forbidden'

/**
 * The query keys `refuse()` appends and the 403 page reads.
 *
 * Constants rather than literals because they were not always the same two
 * strings: the page read `neden` and `gerekli` while the redirect wrote
 * `reason` and `needed`, so every denial arrived unexplained and nothing —
 * not the type checker, not a test — could see it. Two files agreeing on a
 * string is not something to leave to memory.
 */
export const DENIAL_REASON_PARAM = 'reason'
export const DENIAL_NEEDED_PARAM = 'needed'

/**
 * Routes that render for a visitor holding no session cookie at all. Everything
 * else is redirected to sign-in by the proxy before it reaches a page.
 */
const CREDENTIAL_FREE_PATHS: ReadonlySet<string> = new Set([SIGN_IN_PATH])

export function isCredentialFreePath(pathname: string): boolean {
  return CREDENTIAL_FREE_PATHS.has(pathname)
}

// ===========================================================================
// 2. Cookie options
// ===========================================================================

export interface SessionCookieOptions {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: '/'
  maxAge: number
}

/**
 * `secure` is off only on plain-HTTP localhost, where the browser would drop a
 * secure cookie and sign-in would silently fail during development.
 *
 * `sameSite: 'lax'` rather than `'strict'`: an operator following a link to a
 * ticket from their mail client must arrive signed in, and `lax` still refuses
 * to send the cookie on a cross-site POST, which is the case CSRF cares about.
 * `httpOnly` is not negotiable — no script ever reads a session token.
 */
export function sessionCookieOptions(maxAgeSeconds: number): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

/** Access cookie lifetime, capped so a stale token cannot linger for days. */
export const ACCESS_COOKIE_MAX_AGE = 60 * 60
/** Refresh cookie lifetime: one working week. */
export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

// ===========================================================================
// 3. The console session window
//
// Two deadlines, both enforced in Postgres by `admin_touch_session()`. The
// constants live here because the cookie's `maxAge` has to agree with them, and
// because a reviewer should be able to read the whole session policy in one
// place.
// ===========================================================================

/**
 * Idle window. Every authorised request slides `expires_at` forward by this
 * much — but never past the absolute deadline.
 */
export const ADMIN_SESSION_IDLE_SECONDS = 2 * 60 * 60

/**
 * Absolute window, fixed at issue. A console session cannot outlive a working
 * day however busy the operator is: re-authenticating once a day is the cost of
 * a tool that can disable accounts.
 */
export const ADMIN_SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60

/**
 * The idle window as a Postgres interval literal, for `admin_touch_session()`.
 * Derived from the same constant so the cookie and the database cannot disagree.
 */
export const ADMIN_SESSION_IDLE_INTERVAL = `${ADMIN_SESSION_IDLE_SECONDS} seconds`

/** The state of a stored session, as decided from its timestamps. */
export type SessionWindowState = 'live' | 'revoked' | 'idle_expired' | 'absolute_expired'

export interface SessionWindow {
  readonly expiresAt: Date
  readonly absoluteExpiresAt: Date
  readonly revokedAt: Date | null
}

/**
 * Which of the four states a session is in at `now`.
 *
 * The order is the answer: a revoked session reports `revoked` even if it has
 * also expired, because "somebody logged you out" and "you were away too long"
 * are different facts and the audit trail should not confuse them.
 *
 * This function is the mirror of the `where` clause in `admin_touch_session()`.
 * The database remains the authority — this exists so a session already loaded
 * can be re-checked without a second round trip, and so the rule can be tested.
 */
export function evaluateSessionWindow(window: SessionWindow, now: Date): SessionWindowState {
  if (window.revokedAt !== null) return 'revoked'
  const instant = now.getTime()
  if (window.absoluteExpiresAt.getTime() <= instant) return 'absolute_expired'
  if (window.expiresAt.getTime() <= instant) return 'idle_expired'
  return 'live'
}

export function isSessionLive(window: SessionWindow, now: Date): boolean {
  return evaluateSessionWindow(window, now) === 'live'
}

/**
 * The idle deadline after a request at `now`: the idle window, clamped to the
 * absolute deadline. Mirrors `least(now() + p_idle_window, absolute_expires_at)`.
 */
export function slideIdleDeadline(
  now: Date,
  absoluteExpiresAt: Date,
  idleSeconds: number = ADMIN_SESSION_IDLE_SECONDS,
): Date {
  const slid = now.getTime() + idleSeconds * 1000
  return new Date(Math.min(slid, absoluteExpiresAt.getTime()))
}

/**
 * How long the browser should keep the session cookie: whatever is left of the
 * absolute window, capped at the idle window and floored at zero.
 *
 * The cookie is deliberately the *shorter* of the two lifetimes. Expiry is
 * enforced server-side regardless; a cookie that outlives the session it names
 * only produces requests that are refused.
 */
export function sessionCookieMaxAge(now: Date, absoluteExpiresAt: Date): number {
  const remaining = Math.floor((absoluteExpiresAt.getTime() - now.getTime()) / 1000)
  if (remaining <= 0) return 0
  return Math.min(remaining, ADMIN_SESSION_IDLE_SECONDS)
}

// ===========================================================================
// 4. Tokens and hashing
// ===========================================================================

/** 32 bytes, matching the `octet_length(token_hash) = 32` check in 0019. */
export const SESSION_TOKEN_BYTES = 32

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

/**
 * A fresh opaque session token: 256 bits from the platform CSPRNG, base64url so
 * it survives a cookie value unescaped.
 *
 * This value is handed to the browser once and never stored anywhere. What goes
 * into `admin_sessions.token_hash` is `sessionTokenHashBytea()` of it.
 */
export function newSessionToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

/** Lowercase hex SHA-256. The shape `admin_rate_limits.subject_key` demands. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return toHex(new Uint8Array(digest))
}

/**
 * SHA-256 in the `\x…` literal Postgres accepts for a `bytea` argument, which
 * is how a hash crosses PostgREST without a client-side encoding library.
 */
export async function sha256Bytea(input: string): Promise<string> {
  return `\\x${await sha256Hex(input)}`
}

/** What `admin_sessions.token_hash` stores, and what `admin_touch_session` takes. */
export async function sessionTokenHashBytea(token: string): Promise<string> {
  return sha256Bytea(token)
}

/**
 * Compare two strings without leaking their common prefix through timing.
 *
 * Length is compared first and returned early, which does leak length — that is
 * fine here: both operands are fixed-length hex or base64url digests, so the
 * length is public.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

// ===========================================================================
// 5. CSRF
//
// Next validates the Origin of a Server Action against the host, which stops
// the classic cross-site form post. That check is a property of the framework;
// this is a property of the application, and the two fail independently.
//
// The token is a synchronizer token bound to the session: `sha256(token + ':csrf')`.
// It is unguessable to anyone who does not hold the session cookie, and knowing
// it does not yield the session token, because SHA-256 does not run backwards.
// No extra secret, no extra cookie, no extra table.
// ===========================================================================

/** The hidden input every mutating form must carry. */
export const CSRF_FIELD_NAME = '_csrf'

export async function deriveCsrfToken(sessionToken: string): Promise<string> {
  return sha256Hex(`${sessionToken}:csrf`)
}

const CSRF_TOKEN_RE = /^[a-f0-9]{64}$/

export function isCsrfTokenShape(value: unknown): value is string {
  return typeof value === 'string' && CSRF_TOKEN_RE.test(value)
}

/**
 * Is this request same-origin?
 *
 * `origin` is the `Origin` header, `host` the `Host` (or `X-Forwarded-Host`)
 * header. A missing `Origin` is refused rather than allowed: every browser
 * sends it on a POST, so its absence means either a non-browser client or a
 * deliberately stripped header, and neither should be moving money or disabling
 * accounts.
 */
export function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (origin === null || origin === '' || host === null || host === '') return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  // `URL.host` drops the scheme's default port; a `Host` header may or may not
  // carry it. Both spellings of the same origin must compare equal, and every
  // other pair must not.
  if (url.host === host) return true
  const defaultPort = url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : null
  return defaultPort !== null && host === `${url.hostname}:${defaultPort}`
}

// ===========================================================================
// 6. Client address
//
// Used only as a rate-limit bucket and, hashed, as `admin_sessions.ip_hash`.
// The raw value never reaches a column: 0019 constrains `ip_hash` to 64 hex
// characters precisely so an address cannot be stored here by accident.
// ===========================================================================

/**
 * The caller's address from the proxy headers, or null.
 *
 * `x-forwarded-for` is a list appended to by each hop; the first entry is the
 * client as the *nearest trusted proxy* saw it. It is spoofable by a client
 * talking to an untrusted edge, which is why this is used for bucketing and
 * never for authorization.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded !== null && forwarded.trim() !== '') {
    const first = forwarded.split(',')[0]?.trim()
    if (first !== undefined && first !== '') return first
  }
  const real = headers.get('x-real-ip')
  if (real !== null && real.trim() !== '') return real.trim()
  return null
}

// ===========================================================================
// 7. JWT claims
//
// A parse, not a verification: the signature is checked by GoTrue when the
// token is presented to it. These claims are used for exactly two things — the
// proxy deciding whether a refresh is due, and sign-in reading the subject and
// the assurance level of a token it has just received from GoTrue over TLS.
// Nothing here authorises anything.
// ===========================================================================

export interface JwtClaims {
  /** `sub` — the GoTrue user id. */
  readonly subject: string | null
  readonly email: string | null
  /** `exp`, in Unix seconds. */
  readonly expiresAt: number | null
  /** `aal` — `aal1` for password only, `aal2` once a second factor is verified. */
  readonly assuranceLevel: string | null
  /** `amr` — the methods used, e.g. `password`, `totp`. */
  readonly methods: readonly string[]
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  const payload = parts[1]
  if (parts.length !== 3 || payload === undefined) return null
  try {
    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '=')
    const claims: unknown = JSON.parse(atob(padded))
    if (typeof claims !== 'object' || claims === null) return null
    return claims as Record<string, unknown>
  } catch {
    return null
  }
}

/** Every claim the console reads, or an all-null record for an unreadable token. */
export function jwtClaims(token: string): JwtClaims {
  const claims = decodeJwtPayload(token)
  if (claims === null) {
    return { subject: null, email: null, expiresAt: null, assuranceLevel: null, methods: [] }
  }
  const amr = claims['amr']
  const methods: string[] = []
  if (Array.isArray(amr)) {
    for (const entry of amr) {
      if (typeof entry === 'string') methods.push(entry)
      else if (typeof entry === 'object' && entry !== null) {
        const method = (entry as { method?: unknown }).method
        if (typeof method === 'string') methods.push(method)
      }
    }
  }
  const exp = claims['exp']
  const sub = claims['sub']
  const email = claims['email']
  const aal = claims['aal']
  return {
    subject: typeof sub === 'string' && sub !== '' ? sub : null,
    email: typeof email === 'string' && email !== '' ? email : null,
    expiresAt: typeof exp === 'number' && Number.isFinite(exp) ? exp : null,
    assuranceLevel: typeof aal === 'string' && aal !== '' ? aal : null,
    methods,
  }
}

/**
 * The `exp` claim of a JWT, in Unix seconds, or null when the token is not a
 * readable JWT. Kept as its own export because `proxy.ts` uses it directly.
 */
export function jwtExpirySeconds(token: string): number | null {
  return jwtClaims(token).expiresAt
}

/**
 * Refresh once the access token has under two minutes left, so a request that
 * takes a moment does not arrive at GoTrue with a token that just expired.
 */
export const REFRESH_SKEW_SECONDS = 120

/** True when the token is missing, unreadable, or inside the refresh window. */
export function needsRefresh(token: string | undefined, nowSeconds: number): boolean {
  if (!token) return true
  const exp = jwtExpirySeconds(token)
  if (exp === null) return true
  return exp - nowSeconds <= REFRESH_SKEW_SECONDS
}
