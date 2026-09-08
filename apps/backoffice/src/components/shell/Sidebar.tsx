'use client'

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useState } from 'react'
import { messages } from '@/lib/messages'
import { isNavItemActive, type NavGroupId, type NavIcon } from '@/lib/nav'
import { TooltipLabel, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/components/ui/utils'
import { NAV_ICON_COMPONENTS } from './icons.tsx'
import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from './shell-contract.ts'

/**
 * The left rail.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS IN IT IS DECIDED ON THE SERVER
 * ---------------------------------------------------------------------------
 *
 * This component receives a list and renders it. The filtering happened in the
 * layout, against the session's real permission set, and the page behind each
 * link calls `requirePermission()` for itself. Hiding an entry is courtesy;
 * the guard is the guard.
 *
 * ---------------------------------------------------------------------------
 * COLLAPSE, WITHOUT A FLASH
 * ---------------------------------------------------------------------------
 *
 * The collapsed/expanded choice is written to a cookie by the toggle and read
 * by the layout on the next request, so the rail is already the right width in
 * the first painted frame. `localStorage` would mean the server rendering it
 * wide and JavaScript snapping it narrow — a visible jolt on every navigation.
 * The cookie is a display preference and carries nothing about the operator.
 *
 * Collapsed, every entry keeps an accessible name twice over: a tooltip that
 * opens on hover *and* on keyboard focus, and a visually hidden label inside
 * the link itself, so a screen reader is never handed a bare icon.
 */

export interface SidebarItemView {
  readonly href: string
  readonly label: string
  readonly description: string
  readonly icon: NavIcon
}

export interface SidebarGroupView {
  readonly id: NavGroupId
  readonly label: string
  readonly items: readonly SidebarItemView[]
}

export function Sidebar({
  groups,
  initialCollapsed,
}: {
  groups: readonly SidebarGroupView[]
  initialCollapsed: boolean
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  const toggle = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous
      // `SameSite=Lax` so it rides along with ordinary navigations; no `Secure`
      // flag decision here because the value is not a credential and the
      // console is served over TLS in every deployed environment anyway.
      document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; Path=/; Max-Age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`
      return next
    })
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        data-collapsed={collapsed ? 'true' : 'false'}
        className={cn(
          'flex shrink-0 flex-col border-r border-hairline bg-surface',
          'h-dvh sticky top-0',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        <div
          className={cn(
            'flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3',
            collapsed ? 'justify-center px-0' : '',
          )}
        >
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 rounded-md"
            aria-label={`${messages.app.name} ${messages.app.suffix}`}
          >
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-on-primary"
            >
              DA
            </span>
            {collapsed ? null : (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {messages.app.name}
                </span>
                <span className="bo-kicker block">{messages.app.suffix}</span>
              </span>
            )}
          </Link>
        </div>

        <nav aria-label={messages.nav.label} className="bo-scroll min-h-0 flex-1 px-2 py-3">
          {groups.map((group) => (
            <div
              key={group.id}
              className={cn(
                'mb-3 last:mb-0',
                // Collapsed, the heading is hidden but the grouping still has
                // to be visible — a rule between the groups is what replaces
                // the words. `first:` is the group div's own position, so the
                // rail does not open with a stray line.
                collapsed ? 'border-t border-hairline pt-3 first:border-t-0 first:pt-0' : '',
              )}
            >
              {/*
                The heading stays in the DOM when the rail is collapsed, merely
                invisible. Dropping it would leave a screen-reader user with one
                flat list of nineteen links and no sections, which is exactly the
                structure the sidebar exists to provide.
              */}
              <h2 className={cn('bo-kicker px-2.5 pb-1', collapsed ? 'sr-only' : '')}>
                {group.label}
              </h2>

              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink
                      item={item}
                      collapsed={collapsed}
                      active={isNavItemActive(item, pathname)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-hairline p-2">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            className={cn(
              'flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12px] text-muted',
              'transition-colors hover:bg-surface2 hover:text-ink',
              collapsed ? 'justify-center px-0' : '',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-4" />
            )}
            <span className={collapsed ? 'sr-only' : ''}>
              {collapsed ? messages.nav.expand : messages.nav.collapse}
            </span>
          </button>
        </div>
      </aside>
    </TooltipProvider>
  )
}

function SidebarLink({
  item,
  collapsed,
  active,
}: {
  item: SidebarItemView
  collapsed: boolean
  active: boolean
}) {
  const Icon = NAV_ICON_COMPONENTS[item.icon]

  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? undefined : item.description}
      className={cn(
        'flex h-7 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors',
        collapsed ? 'justify-center px-0' : '',
        active
          ? 'bg-primary-soft font-semibold text-primary-on-soft'
          : 'text-muted hover:bg-surface2 hover:text-ink',
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {/*
        Collapsed, the label is hidden from the eye and not from anything else:
        an icon-only link with no accessible name is an unreadable link, and a
        `title` attribute is not a name a screen reader is obliged to announce.
      */}
      <span className={cn('min-w-0 truncate', collapsed ? 'sr-only' : '')}>{item.label}</span>
    </Link>
  )

  // The tooltip is for the sighted mouse user the collapsed rail costs the
  // most: it opens on focus as well as hover, and Radix wires it to the link
  // with `aria-describedby` rather than replacing its name.
  return collapsed ? <TooltipLabel label={item.label}>{link}</TooltipLabel> : link
}
