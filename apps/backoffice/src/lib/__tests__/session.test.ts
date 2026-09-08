import { fixedClock } from '@da/domain'
import { describe, expect, it } from 'vitest'
import {
  ACCESS_COOKIE,
  ADMIN_SESSION_ABSOLUTE_SECONDS,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_IDLE_INTERVAL,
  ADMIN_SESSION_IDLE_SECONDS,
  CSRF_FIELD_NAME,
  REFRESH_COOKIE,
  SESSION_TOKEN_BYTES,
  SIGN_IN_PATH,
  UNAUTHORIZED_PATH,
  clientIpFromHeaders,
  constantTimeEqual,
  deriveCsrfToken,
  evaluateSessionWindow,
  isCredentialFreePath,
  isCsrfTokenShape,
  isSameOrigin,
  isSessionLive,
  jwtClaims,
  jwtExpirySeconds,
  needsRefresh,
  newSessionToken,
  sessionCookieMaxAge,
  sessionCookieOptions,
  sessionTokenHashBytea,
  sha256Bytea,
  sha256Hex,
  slideIdleDeadline,
} from '../session-cookies.ts'

/**
 * Session mechanics: expiry, cookies, CSRF and claim reading.
 *
 * Expiry is enforced by `admin_touch_session()` in Postgres — these tests cover
 * the rules the application applies alongside it: which of the four states a
 * stored session is in, how far the idle deadline may slide, how long the
 * cookie should live, and that the CSRF token is bound to the session token
 * without revealing it.
 */

const NOW = new Date('2026-09-08T10:00:00.000Z')
const clock = fixedClock(NOW)

function at(offsetSeconds: number): Date {
  return new Date(NOW.getTime() + offsetSeconds * 1000)
}

describe('routes and cookie names', () => {
  it('uses English route segments', () => {
    expect(SIGN_IN_PATH).toBe('/sign-in')
    expect(UNAUTHORIZED_PATH).toBe('/forbidden')
    expect(SIGN_IN_PATH).toMatch(/^\/[a-z-]+$/)
    expect(UNAUTHORIZED_PATH).toMatch(/^\/[a-z-]+$/)
  })

  it('lets only the sign-in page render without a credential', () => {
    expect(isCredentialFreePath(SIGN_IN_PATH)).toBe(true)
    expect(isCredentialFreePath(UNAUTHORIZED_PATH)).toBe(false)
    expect(isCredentialFreePath('/')).toBe(false)
    expect(isCredentialFreePath('/users')).toBe(false)
  })

  it('keeps the three cookie names distinct', () => {
    expect(new Set([ADMIN_SESSION_COOKIE, ACCESS_COOKIE, REFRESH_COOKIE]).size).toBe(3)
  })
})

describe('cookie options', () => {
  it('is always httpOnly, lax and path-scoped to the whole console', () => {
    const options = sessionCookieOptions(3600)
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('lax')
    expect(options.path).toBe('/')
    expect(options.maxAge).toBe(3600)
  })

  it('caps the cookie at the idle window and never outlives the absolute one', () => {
    // Fresh session: the absolute window is longer, so the idle window wins.
    expect(sessionCookieMaxAge(NOW, at(ADMIN_SESSION_ABSOLUTE_SECONDS))).toBe(
      ADMIN_SESSION_IDLE_SECONDS,
    )
    // Near the end of the day: what remains of the absolute window wins.
    expect(sessionCookieMaxAge(NOW, at(600))).toBe(600)
    // Past it: nothing.
    expect(sessionCookieMaxAge(NOW, at(-1))).toBe(0)
  })

  it('states the idle window to Postgres in the same number of seconds', () => {
    expect(ADMIN_SESSION_IDLE_INTERVAL).toBe(`${ADMIN_SESSION_IDLE_SECONDS} seconds`)
    expect(ADMIN_SESSION_ABSOLUTE_SECONDS).toBeGreaterThan(ADMIN_SESSION_IDLE_SECONDS)
  })
})

describe('evaluateSessionWindow — expiry, server-side', () => {
  const live = {
    expiresAt: at(ADMIN_SESSION_IDLE_SECONDS),
    absoluteExpiresAt: at(ADMIN_SESSION_ABSOLUTE_SECONDS),
    revokedAt: null,
  }

  it('is live inside both deadlines', () => {
    expect(evaluateSessionWindow(live, NOW)).toBe('live')
    expect(isSessionLive(live, NOW)).toBe(true)
  })

  it('is idle_expired once the idle deadline has passed', () => {
    const later = at(ADMIN_SESSION_IDLE_SECONDS + 1)
    expect(evaluateSessionWindow(live, later)).toBe('idle_expired')
    expect(isSessionLive(live, later)).toBe(false)
  })

  it('treats the deadline itself as expired, never as one last request', () => {
    expect(evaluateSessionWindow(live, at(ADMIN_SESSION_IDLE_SECONDS))).toBe('idle_expired')
  })

  it('is absolute_expired once the hard cap has passed, however active', () => {
    const stillSliding = {
      expiresAt: at(ADMIN_SESSION_ABSOLUTE_SECONDS + 3600),
      absoluteExpiresAt: at(ADMIN_SESSION_ABSOLUTE_SECONDS),
      revokedAt: null,
    }
    expect(evaluateSessionWindow(stillSliding, at(ADMIN_SESSION_ABSOLUTE_SECONDS + 1))).toBe(
      'absolute_expired',
    )
  })

  it('reports revoked ahead of expired, because they are different facts', () => {
    const revoked = { ...live, revokedAt: at(-60) }
    expect(evaluateSessionWindow(revoked, NOW)).toBe('revoked')
    expect(evaluateSessionWindow(revoked, at(ADMIN_SESSION_ABSOLUTE_SECONDS + 1))).toBe('revoked')
  })

  it('slides the idle deadline but never past the absolute one', () => {
    const absolute = at(ADMIN_SESSION_ABSOLUTE_SECONDS)
    expect(slideIdleDeadline(clock.now(), absolute).toISOString()).toBe(
      at(ADMIN_SESSION_IDLE_SECONDS).toISOString(),
    )
    // Ten minutes before the hard cap, a two-hour slide is clamped to ten.
    const nearEnd = at(ADMIN_SESSION_ABSOLUTE_SECONDS - 600)
    expect(slideIdleDeadline(nearEnd, absolute).toISOString()).toBe(absolute.toISOString())
  })
})

describe('tokens', () => {
  it('mints 256 bits of randomness, base64url, and never repeats', () => {
    const tokens = new Set<string>()
    for (let i = 0; i < 200; i += 1) tokens.add(newSessionToken())
    expect(tokens.size).toBe(200)
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
      // 32 bytes, base64 without padding.
      expect(token).toHaveLength(Math.ceil((SESSION_TOKEN_BYTES * 8) / 6))
    }
  })

  it('hashes to 64 lowercase hex — the shape the limiter column demands', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256Hex('')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('renders a bytea literal Postgres accepts', async () => {
    const literal = await sha256Bytea('abc')
    expect(literal).toBe('\\xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sessionTokenHashBytea('abc')).toBe(literal)
    // 32 raw bytes, matching `octet_length(token_hash) = 32`.
    expect((literal.length - 2) / 2).toBe(32)
  })
})

describe('CSRF', () => {
  it('derives a token from the session token, one way', async () => {
    const token = newSessionToken()
    const csrf = await deriveCsrfToken(token)
    expect(isCsrfTokenShape(csrf)).toBe(true)
    expect(csrf).not.toContain(token)
    // Stable for the same session, different for another.
    expect(await deriveCsrfToken(token)).toBe(csrf)
    expect(await deriveCsrfToken(newSessionToken())).not.toBe(csrf)
    // Not the same as the stored session hash, so leaking one is not the other.
    expect(csrf).not.toBe(await sha256Hex(token))
  })

  it('refuses anything that is not a 64-hex token', () => {
    expect(isCsrfTokenShape('')).toBe(false)
    expect(isCsrfTokenShape(null)).toBe(false)
    expect(isCsrfTokenShape('a'.repeat(63))).toBe(false)
    expect(isCsrfTokenShape('A'.repeat(64))).toBe(false)
    expect(isCsrfTokenShape('a'.repeat(64))).toBe(true)
  })

  it('names the field a form must post', () => {
    expect(CSRF_FIELD_NAME).toBe('_csrf')
  })

  it('compares without short-circuiting on the first differing character', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'ab')).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
  })

  it('accepts only a same-origin action, and refuses a missing Origin', () => {
    expect(isSameOrigin('https://ops.example.com', 'ops.example.com')).toBe(true)
    expect(isSameOrigin('https://ops.example.com:443', 'ops.example.com:443')).toBe(true)
    expect(isSameOrigin('https://evil.example.com', 'ops.example.com')).toBe(false)
    expect(isSameOrigin('https://ops.example.com', 'ops.example.com:3100')).toBe(false)
    expect(isSameOrigin(null, 'ops.example.com')).toBe(false)
    expect(isSameOrigin('null', 'ops.example.com')).toBe(false)
    expect(isSameOrigin('https://ops.example.com', null)).toBe(false)
    expect(isSameOrigin('not a url', 'ops.example.com')).toBe(false)
  })
})

describe('client address', () => {
  it('takes the first hop of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' })
    expect(clientIpFromHeaders(headers)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip, then to null', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
    expect(clientIpFromHeaders(new Headers())).toBeNull()
    expect(clientIpFromHeaders(new Headers({ 'x-forwarded-for': '   ' }))).toBeNull()
  })
})

describe('JWT claims', () => {
  function token(claims: Record<string, unknown>): string {
    const encode = (value: unknown): string =>
      Buffer.from(JSON.stringify(value))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    return `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`
  }

  it('reads subject, email, expiry and assurance level', () => {
    const claims = jwtClaims(
      token({
        sub: '3f2a1c44-0000-4000-8000-000000000001',
        email: 'ops@example.com',
        exp: 1_800_000_000,
        aal: 'aal2',
        amr: [{ method: 'password' }, { method: 'totp' }],
      }),
    )
    expect(claims.subject).toBe('3f2a1c44-0000-4000-8000-000000000001')
    expect(claims.email).toBe('ops@example.com')
    expect(claims.expiresAt).toBe(1_800_000_000)
    expect(claims.assuranceLevel).toBe('aal2')
    expect(claims.methods).toEqual(['password', 'totp'])
  })

  it('reads an amr array of plain strings too', () => {
    expect(jwtClaims(token({ amr: ['password'] })).methods).toEqual(['password'])
  })

  it('returns nulls rather than throwing for an unreadable token', () => {
    for (const bad of ['', 'not.a.jwt', 'a.b', 'a.b.c.d']) {
      const claims = jwtClaims(bad)
      expect(claims.subject).toBeNull()
      expect(claims.expiresAt).toBeNull()
      expect(claims.methods).toEqual([])
    }
    expect(jwtExpirySeconds('nonsense')).toBeNull()
  })

  it('asks for a refresh before the token actually expires', () => {
    const exp = 1_800_000_000
    const jwt = token({ exp })
    expect(needsRefresh(jwt, exp - 3600)).toBe(false)
    expect(needsRefresh(jwt, exp - 60)).toBe(true)
    expect(needsRefresh(jwt, exp + 10)).toBe(true)
    expect(needsRefresh(undefined, exp - 3600)).toBe(true)
  })
})
