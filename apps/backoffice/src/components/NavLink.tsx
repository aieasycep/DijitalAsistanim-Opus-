'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * A sidebar link that knows whether it is the current page.
 *
 * The only client component in the shell, and only because `usePathname` needs
 * to be. Keeping it separate stops the whole navigation — and the session
 * object it renders — from being pushed into the client bundle.
 */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'block rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-primary-soft font-semibold text-primary-on-soft'
          : 'text-muted hover:bg-surface2 hover:text-ink',
      ].join(' ')}
    >
      {label}
    </Link>
  )
}
