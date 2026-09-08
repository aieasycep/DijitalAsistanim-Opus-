import Link from 'next/link'
import type { AuditCursor } from './contract'
import { firstPageHref, pageHref, type ParamValues } from './href'
import { auditMessages } from './messages'

/**
 * The pager under the trail.
 *
 * It has no page numbers because there are none: a keyset pager knows the row
 * it stopped at, not how many rows came before it. That is the trade — and for
 * an append-only table it is the right one, because a page number over a table
 * being written to is a number that means something different on every click.
 *
 * What it does show is the exact total behind the filters, taken from a real
 * `count(*)`, so an operator still knows the size of what they are walking. If
 * that count failed on its own, the pager says so rather than printing a figure
 * it does not have.
 *
 * A step that would go nowhere renders as text, not as a link: a control that
 * looks pressable and changes nothing is worse than one that is visibly
 * unavailable.
 */

export interface KeysetPagerProps {
  params: ParamValues
  shown: number
  /** Exact total behind the filters, or null when that count failed. */
  total: number | null
  hasNewer: boolean
  hasOlder: boolean
  newerCursor: AuditCursor | null
  olderCursor: AuditCursor | null
  /** True when a cursor is active. */
  paged: boolean
}

export function KeysetPager({
  params,
  shown,
  total,
  hasNewer,
  hasOlder,
  newerCursor,
  olderCursor,
  paged,
}: KeysetPagerProps) {
  const position =
    total === null
      ? `${auditMessages.pager.countUnavailable} · ${auditMessages.pager.shownOnly(shown)}`
      : auditMessages.pager.position(shown, total)

  return (
    <nav
      aria-label={auditMessages.pager.label}
      className="bo-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <Step
          href={hasNewer && newerCursor !== null ? pageHref(params, newerCursor, 'geri') : null}
          label={auditMessages.pager.newer}
        />
        <Step
          href={hasOlder && olderCursor !== null ? pageHref(params, olderCursor, 'ileri') : null}
          label={auditMessages.pager.older}
        />
        {/* Only when there is somewhere newer to go: paging back until the
            trail runs out lands on the newest page already, and a link to the
            page you are looking at is a dead control. */}
        {paged && hasNewer ? (
          <Link
            href={firstPageHref(params)}
            className="text-[12px] font-medium text-primary-on-soft underline-offset-2 hover:underline"
          >
            {auditMessages.pager.first}
          </Link>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span>{position}</span>
        <span className="hidden text-faint lg:inline">·</span>
        <span className="hidden text-[11px] text-faint lg:inline">
          {auditMessages.pager.keysetNote}
        </span>
      </div>
    </nav>
  )
}

function Step({ href, label }: { href: string | null; label: string }) {
  if (href === null) {
    return (
      <span aria-disabled="true" className="px-2.5 py-1 text-[12px] text-disabled">
        {label}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-hairline px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:border-primary/40 hover:text-ink"
    >
      {label}
    </Link>
  )
}
