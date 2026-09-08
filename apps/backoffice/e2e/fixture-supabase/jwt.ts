import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * HS256, by hand, because the console parses the token it is given.
 *
 * `session-cookies.ts` splits the access token on `.`, base64url-decodes the
 * middle segment and reads `sub`, `email`, `exp`, `aal` and `amr` out of it —
 * and `signInAdmin()` refuses outright when `sub` is missing. A fixture that
 * handed back an opaque string would therefore fail at the first branch of the
 * sign-in flow, and a fixture that handed back an unsigned payload would prove
 * nothing about the shape GoTrue actually issues. So the tokens here are real
 * HS256 JWTs signed with a secret generated for this run, and `/auth/v1/user`
 * verifies the signature rather than trusting the payload.
 */

export interface AccessTokenClaims {
  readonly sub: string
  readonly email: string
  readonly aal: 'aal1' | 'aal2'
  readonly amr: readonly { method: string; timestamp: number }[]
  readonly exp: number
  readonly iat: number
  readonly iss: string
  readonly aud: string
  readonly role: string
  readonly session_id: string
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(input: string): Buffer {
  const normalised = input.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalised.padEnd(Math.ceil(normalised.length / 4) * 4, '='), 'base64')
}

function signature(secret: string, signingInput: string): string {
  return base64url(createHmac('sha256', secret).update(signingInput).digest())
}

export function signAccessToken(secret: string, claims: AccessTokenClaims): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = base64url(Buffer.from(JSON.stringify(claims)))
  const signingInput = `${header}.${payload}`
  return `${signingInput}.${signature(secret, signingInput)}`
}

/** The claims, or null for anything that is not a token this server signed. */
export function verifyAccessToken(secret: string, token: string): AccessTokenClaims | null {
  const parts = token.split('.')
  const [header, payload, presented] = parts
  if (parts.length !== 3 || header === undefined || payload === undefined) return null
  if (presented === undefined) return null

  const expected = signature(secret, `${header}.${payload}`)
  const a = Buffer.from(expected)
  const b = Buffer.from(presented)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const claims: unknown = JSON.parse(fromBase64url(payload).toString('utf8'))
    if (typeof claims !== 'object' || claims === null) return null
    const typed = claims as AccessTokenClaims
    // An expired token is not a valid one, and the console's own refresh path at
    // the edge depends on that being true rather than merely stated.
    if (typeof typed.exp !== 'number' || typed.exp * 1000 <= Date.now()) return null
    return typed
  } catch {
    return null
  }
}
