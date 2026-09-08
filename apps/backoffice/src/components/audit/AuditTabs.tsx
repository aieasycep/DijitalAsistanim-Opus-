import Link from 'next/link'
import { AUDIT_ACTIONS_PATH, AUDIT_PATH } from './contract'
import { crossPageHref, type ParamValues } from './href'
import { auditMessages } from './messages'

/**
 * The two views of the same range: the rows, and the distribution of the rows.
 *
 * The range and the filters travel across the switch — an operator who has
 * narrowed to a fortnight and a single user does not want to re-enter it to see
 * the shape of what they narrowed to. The paging cursor does not travel,
 * because it names a row in a result set the other page does not have.
 */

export interface AuditTabsProps {
  current: typeof AUDIT_PATH | typeof AUDIT_ACTIONS_PATH
  params: ParamValues
}

const TABS = [
  { href: AUDIT_PATH, label: auditMessages.tabs.log },
  { href: AUDIT_ACTIONS_PATH, label: auditMessages.tabs.breakdown },
] as const

export function AuditTabs({ current, params }: AuditTabsProps) {
  return (
    <nav aria-label={auditMessages.tabs.label}>
      <ul className="inline-flex rounded-md border border-hairline bg-surface2/60 p-0.5">
        {TABS.map((tab) => {
          const active = tab.href === current
          return (
            <li key={tab.href}>
              <Link
                href={crossPageHref(params, tab.href)}
                aria-current={active ? 'page' : undefined}
                className={[
                  'block rounded px-2.5 py-1 text-[12px] font-medium transition-colors',
                  active
                    ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]'
                    : 'text-muted hover:text-ink',
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
