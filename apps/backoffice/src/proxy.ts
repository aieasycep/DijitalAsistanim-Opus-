import { systemClock } from '@da/domain'
import { NextResponse, type NextRequest } from 'next/server'
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE,
  SIGN_IN_PATH,
  isCredentialFreePath,
  needsRefresh,
  sessionCookieOptions,
} from './lib/session-cookies'

/**
 * Two jobs at the edge, neither of which is authorisation.
 *
 * 1. Keep a staff session alive across a working day. A Supabase access token
 *    lasts an hour, and Server Components cannot write cookies, so without this
 *    an operator would be bounced to sign-in every hour mid-investigation. The
 *    proxy layer (Next 16's replacement for `middleware`) can write to the
 *    response, so the refresh happens here: when the access token is missing or
 *    inside its skew window and a refresh token is present, exchange it and
 *    re-issue both cookies.
 *
 * 2. Turn "no credential at all" into a clean 307 to the sign-in page. Without
 *    it Next streams the document shell before `requireStaff()` runs and the
 *    redirect arrives inside the RSC payload with a 200 — correct, but a poor
 *    answer to a health check and a wasted render.
 *
 * Neither is a gate. Presenting a cookie gets you past this file and nothing
 * more: `requireStaff()` still verifies the token against GoTrue and re-reads
 * `staff_members` on every protected request. A refreshed cookie is not a
 * grant, and the absence of one is merely a shortcut, not the check.
 *
 * It deliberately imports nothing from `db.ts`: it uses the anon key (public by
 * design) against GoTrue's token endpoint, so the service-role key never enters
 * the edge bundle.
 */

interface RefreshedSession {
  access_token: string
  refresh_token: string
  expires_at?: number
}

async function refreshSession(
  supabaseUrl: string,
  anonKey: string,
  refreshToken: string,
): Promise<RefreshedSession | null> {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return null
    const session = body as Partial<RefreshedSession>
    if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') {
      return null
    }
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      ...(typeof session.expires_at === 'number' ? { expires_at: session.expires_at } : {}),
    }
  } catch {
    // A refresh that cannot reach GoTrue is not an authorisation decision; let
    // the request through and let requireStaff() decide with the token it has.
    return null
  }
}

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value

  if (!refreshToken && !accessToken) {
    if (isCredentialFreePath(request.nextUrl.pathname)) return NextResponse.next()
    return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url))
  }

  const nowSeconds = Math.floor(systemClock.now().getTime() / 1000)
  if (!refreshToken || !needsRefresh(accessToken, nowSeconds)) {
    return NextResponse.next()
  }

  // Read directly rather than through `env.ts`, which is server-only and pulls
  // in AppError; the fallback name matches what `readEnv()` accepts.
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '')
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return NextResponse.next()

  const session = await refreshSession(supabaseUrl, anonKey, refreshToken)
  if (!session) {
    // The refresh token is spent or revoked. Clear both cookies so the next
    // page render sends the operator to sign-in instead of retrying forever.
    const cleared = NextResponse.next()
    cleared.cookies.set(ACCESS_COOKIE, '', sessionCookieOptions(0))
    cleared.cookies.set(REFRESH_COOKIE, '', sessionCookieOptions(0))
    return cleared
  }

  const lifetime =
    session.expires_at && session.expires_at > nowSeconds
      ? Math.min(session.expires_at - nowSeconds, ACCESS_COOKIE_MAX_AGE)
      : ACCESS_COOKIE_MAX_AGE

  // Mutating `request.cookies` before building the response is what makes the
  // fresh token visible to this very render, rather than the next navigation.
  request.cookies.set(ACCESS_COOKIE, session.access_token)
  request.cookies.set(REFRESH_COOKIE, session.refresh_token)
  const response = NextResponse.next({ request })
  response.cookies.set(ACCESS_COOKIE, session.access_token, sessionCookieOptions(lifetime))
  response.cookies.set(
    REFRESH_COOKIE,
    session.refresh_token,
    sessionCookieOptions(REFRESH_COOKIE_MAX_AGE),
  )
  return response
}

export const config = {
  // Everything except Next's own assets. The sign-in page is included on
  // purpose: an operator returning with a live refresh token should land
  // already signed in rather than typing a password again.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
