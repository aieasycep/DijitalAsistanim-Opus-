import type { ReactNode } from 'react'
import type { AdminSession } from '@/lib/auth'
import type { EnvironmentDescriptor } from '@/lib/env'
import { messages } from '@/lib/messages'
import { navGroupsFor } from '@/lib/nav'
import { Sidebar, type SidebarGroupView } from './Sidebar.tsx'
import { Topbar } from './Topbar.tsx'
import type { PaletteNavItem } from './CommandPalette.tsx'
import type { ThemeChoice } from './shell-contract.ts'

/**
 * The frame every signed-in page renders inside.
 *
 * It is composed once, in `app/(dash)/layout.tsx`, rather than by each page.
 * That is not only tidier: a layout is not re-rendered on navigation, so the
 * rail keeps its scroll position, the palette keeps its state, and the health
 * chip is queried once per visit instead of once per click.
 *
 * ---------------------------------------------------------------------------
 * WHAT CROSSES INTO THE BROWSER
 * ---------------------------------------------------------------------------
 *
 * The session does not. The sidebar and the palette receive a list of links
 * this operator may open — already filtered here, against the permission set
 * the session actually holds — plus their own address and role label for the
 * account menu. The permission set itself, the session id, the CSRF token and
 * the absolute expiry stay on the server.
 *
 * The filtering is a convenience, not a control. Every page behind every one of
 * these links calls `requirePermission()` for itself, and would refuse the same
 * route typed into the address bar by an operator who found it some other way.
 *
 * ---------------------------------------------------------------------------
 * THE FOOTER IS A PROMISE, NOT DECORATION
 * ---------------------------------------------------------------------------
 *
 * The line at the bottom of every page says the console cannot read user
 * content. It is on every page because it is true on every page, and because
 * the one place it stops being true — Support Access — is a deliberate,
 * approved, time-limited exception that announces itself loudly when it is in
 * force.
 */

export interface AppShellProps {
  session: AdminSession
  environment: EnvironmentDescriptor
  theme: ThemeChoice
  sidebarCollapsed: boolean
  children: ReactNode
}

/** Where the health chip points: the operations dashboard. */
const HEALTH_HREF = '/ops'

export function AppShell({
  session,
  environment,
  theme,
  sidebarCollapsed,
  children,
}: AppShellProps) {
  const permitted = navGroupsFor(session.permissions)

  const groups: readonly SidebarGroupView[] = permitted.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((item) => ({
      href: item.href,
      label: item.label,
      description: item.description,
      icon: item.icon,
    })),
  }))

  const paletteItems: readonly PaletteNavItem[] = permitted.flatMap((group) =>
    group.items.map((item) => ({
      href: item.href,
      label: item.label,
      description: item.description,
      icon: item.icon,
      group: group.label,
    })),
  )

  return (
    <div className="flex min-h-dvh">
      <a
        href="#bo-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary"
      >
        {messages.nav.skipToContent}
      </a>

      <Sidebar groups={groups} initialCollapsed={sidebarCollapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          environment={environment}
          email={session.identity.email}
          displayName={session.identity.displayName}
          role={session.role}
          permissionCount={session.permissionList.length}
          theme={theme}
          paletteItems={paletteItems}
          healthHref={HEALTH_HREF}
        />

        <main id="bo-main" className="min-w-0 flex-1 p-4">
          {children}
        </main>

        <footer className="border-t border-hairline px-4 py-2 text-[11px] text-faint">
          {messages.app.privacyBanner}
        </footer>
      </div>
    </div>
  )
}
