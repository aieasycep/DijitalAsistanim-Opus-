import Link from 'next/link'
import { AI_CEILING_PATH, AI_PATH, AI_QUALITY_PATH, type AiReturnPath } from './contract'
import { aiMessages } from './messages'

/**
 * Sub-navigation for the three AI pages.
 *
 * The active tab is passed in by the page rather than read from
 * `usePathname`, so this stays a Server Component and costs the browser
 * nothing: each page already knows, statically, which one it is. Every tab is a
 * link to a route that exists — a tab pointing at an unbuilt page is the same
 * dead control as a disabled button.
 */

interface Tab {
  href: AiReturnPath
  label: string
}

const TABS: readonly Tab[] = [
  { href: AI_PATH, label: aiMessages.area.tabs.spend },
  { href: AI_QUALITY_PATH, label: aiMessages.area.tabs.quality },
  { href: AI_CEILING_PATH, label: aiMessages.area.tabs.ceiling },
]

export function AiTabs({ current }: { current: AiReturnPath }) {
  return (
    <nav aria-label={aiMessages.area.tabs.label}>
      <ul className="flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const active = tab.href === current
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors',
                  active
                    ? 'bg-primary-soft text-primary-on-soft'
                    : 'border border-hairline text-muted hover:border-primary/40 hover:text-ink',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
