/**
 * Session cookie names, the two session routes, and JWT expiry parsing —
 * shared by `auth.ts` (server components and actions) and `proxy.ts` (edge).
 *
 * It is a separate module for one reason: the proxy must not import `auth.ts`,
 * because that would pull `db.ts` — and with it the service-role key — into the
 * edge bundle. Nothing here touches the database or reads a secret.
 */

export const ACCESS_COOKIE = 'da_bo_at'
export const REFRESH_COOKIE = 'da_bo_rt'

/** Where an operator without a session is sent. */
export const SIGN_IN_PATH = '/giris'
/** Where an operator with a session but no grant is sent. */
export const UNAUTHORIZED_PATH = '/yetkisiz'

/**
 * Routes that render for a visitor holding no session cookie at all. Everything
 * else is redirected to sign-in by the proxy before it reaches a page.
 */
const CREDENTIAL_FREE_PATHS: ReadonlySet<string> = new Set([SIGN_IN_PATH])

export function isCredentialFreePath(pathname: string): boolean {
  return CREDENTIAL_FREE_PATHS.has(pathname)
}

/**
 * Refresh once the access token has under two minutes left, so a request that
 * takes a moment does not arrive at PostgREST with a token that just expired.
 */
export const REFRESH_SKEW_SECONDS = 120

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

/**
 * The `exp` claim of a JWT, in Unix seconds, or null when the token is not a
 * readable JWT.
 *
 * This is a parse, not a verification: the signature is checked by GoTrue when
 * the token is actually used. It exists so the middleware can decide whether a
 * refresh is due without a network round-trip on every request.
 */
export function jwtExpirySeconds(token: string): number | null {
  const parts = token.split('.')
  const payload = parts[1]
  if (parts.length !== 3 || payload === undefined) return null
  try {
    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '=')
    const json = atob(padded)
    const claims: unknown = JSON.parse(json)
    if (typeof claims !== 'object' || claims === null) return null
    const exp = (claims as { exp?: unknown }).exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
  } catch {
    return null
  }
}

/** True when the token is missing, unreadable, or inside the refresh window. */
export function needsRefresh(token: string | undefined, nowSeconds: number): boolean {
  if (!token) return true
  const exp = jwtExpirySeconds(token)
  if (exp === null) return true
  return exp - nowSeconds <= REFRESH_SKEW_SECONDS
}
