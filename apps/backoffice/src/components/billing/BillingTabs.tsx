import Link from 'next/link'
import {
  BILLING_PATH,
  BILLING_RECONCILIATION_PATH,
  BILLING_REFERRALS_PATH,
  type BillingReturnPath,
} from './contract'
import { billingMessages } from './messages'

/**
 * Sub-navigation for the three billing pages.
 *
 * The active tab is passed in by the page that renders it rather than read from
 * `usePathname`, so this stays a Server Component and costs the browser
 * nothing: each page already knows, statically, which one it is.
 *
 * Every tab is a real link to a real route. A tab for a page that does not
 * exist would be the same dead control as a disabled button.
 */

interface Tab {
  href: BillingReturnPath
  label: string
}

const TABS: readonly Tab[] = [
  { href: BILLING_PATH, label: billingMessages.area.tabs.subscriptions },
  { href: BILLING_RECONCILIATION_PATH, label: billingMessages.area.tabs.reconciliation },
  { href: BILLING_REFERRALS_PATH, label: billingMessages.area.tabs.referrals },
]

export function BillingTabs({ current }: { current: BillingReturnPath }) {
  return (
    <nav aria-label={billingMessages.area.tabs.label}>
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
