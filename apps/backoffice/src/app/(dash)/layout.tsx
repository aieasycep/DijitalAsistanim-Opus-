import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  AppShell,
  SIDEBAR_COOKIE,
  THEME_COOKIE,
  parseSidebarCollapsed,
  parseTheme,
} from '@/components/shell'
import { SIGN_IN_PATH, readAdminSession } from '@/lib/auth'
import { describeEnvironment } from '@/lib/env'

/**
 * The signed-in frame.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT THE GUARD
 * ---------------------------------------------------------------------------
 *
 * It resolves the session because it needs one to draw the rail — which links
 * exist, whose name is in the corner. It redirects a visitor without one
 * because rendering the chrome of a console to somebody who is not signed in is
 * pointless.
 *
 * It is not what protects the pages. A Next.js layout does not re-run for every
 * nested render path, and treating one as an authorization boundary is a known
 * way to ship a hole. Every page inside calls `requirePermission()` with the
 * permission it needs, and refuses on its own — this file could be deleted and
 * nothing would become reachable.
 *
 * `readAdminSession()` is memoised per request with React's `cache`, so the
 * layout and the page below it share one `admin_touch_session()` round trip
 * rather than making two.
 */

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [result, store] = await Promise.all([readAdminSession(), cookies()])

  if (result.kind === 'unavailable') {
    // An outage is not a signed-out operator. Let the error boundary say so
    // rather than looping them through a sign-in form that cannot work either.
    throw new Error(`admin session unavailable: ${result.code}`)
  }
  if (result.kind !== 'admin') {
    redirect(
      `${SIGN_IN_PATH}?reason=${result.kind === 'no_session' ? 'no_session' : 'session_expired'}`,
    )
  }

  return (
    <AppShell
      session={result.session}
      environment={describeEnvironment()}
      theme={parseTheme(store.get(THEME_COOKIE)?.value)}
      sidebarCollapsed={parseSidebarCollapsed(store.get(SIDEBAR_COOKIE)?.value)}
    >
      {children}
    </AppShell>
  )
}
