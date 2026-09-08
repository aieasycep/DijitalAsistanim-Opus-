import type { ReactNode } from 'react'
import { signOutAction } from '@/app/session-actions'
import { roleSatisfies, type StaffSession } from '@/lib/auth'
import type { StaffRole } from '@/lib/db'
import { messages } from '@/lib/messages'
import { Badge, roleTone } from './ui/Badge'
import { NavLink } from './NavLink'

/**
 * The frame every signed-in page renders inside: a sidebar of destinations, a
 * header naming the operator, and the privacy statement the whole tool is built
 * to keep.
 *
 * Navigation is filtered by role rather than rendered-and-disabled. A link an
 * operator cannot follow is a dead control, and `requireStaff()` would bounce
 * them to the unauthorised page anyway — so the entry simply is not there.
 */

interface NavItem {
  href: string
  label: string
  minimumRole: StaffRole
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: messages.nav.overview, minimumRole: 'support' },
  { href: '/kullanicilar', label: messages.nav.users, minimumRole: 'support' },
  { href: '/baglantilar', label: messages.nav.accounts, minimumRole: 'support' },
  { href: '/senkronizasyon', label: messages.nav.sync, minimumRole: 'ops' },
  { href: '/onaylar', label: messages.nav.approvals, minimumRole: 'ops' },
  { href: '/maliyet', label: messages.nav.spend, minimumRole: 'ops' },
  { href: '/gizlilik', label: messages.nav.privacy, minimumRole: 'support' },
  { href: '/davetler', label: messages.nav.referrals, minimumRole: 'ops' },
  { href: '/denetim', label: messages.nav.audit, minimumRole: 'ops' },
  { href: '/ekip', label: messages.nav.staff, minimumRole: 'admin' },
]

/**
 * The destinations this operator may open. Exported so a page can check the
 * same list the sidebar uses, and so other agents adding a section have one
 * place to register it.
 */
export function navItemsFor(role: StaffRole): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => roleSatisfies(role, item.minimumRole))
}

export function NavShell({ session, children }: { session: StaffSession; children: ReactNode }) {
  const items = navItemsFor(session.role)

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#bo-icerik"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary"
      >
        {messages.nav.skipToContent}
      </a>

      <aside className="shrink-0 border-b border-hairline bg-surface lg:min-h-dvh lg:w-56 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-4 py-3">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-on-primary"
          >
            DA
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold text-ink">{messages.app.name}</div>
            <div className="bo-kicker">{messages.app.suffix}</div>
          </div>
        </div>

        <nav aria-label={messages.app.tagline} className="px-2 pb-3">
          <ul className="flex flex-wrap gap-0.5 lg:flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} />
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-surface px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="bo-kicker">{messages.nav.signedInAs}</span>
            <span className="truncate text-[12px] text-ink">{session.email ?? session.userId}</span>
            <Badge tone={roleTone(session.role)}>{messages.roles[session.role]}</Badge>
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className="h-7 rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted transition-colors hover:border-critical/40 hover:text-critical-text"
            >
              {messages.nav.signOut}
            </button>
          </form>
        </header>

        <main id="bo-icerik" className="min-w-0 flex-1 p-4">
          {children}
        </main>

        <footer className="border-t border-hairline px-4 py-2 text-[11px] text-faint">
          {messages.app.privacyBanner}
        </footer>
      </div>
    </div>
  )
}
