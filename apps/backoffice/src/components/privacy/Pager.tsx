import Link from 'next/link'
import { privacyMessages } from './messages'

/**
 * The pager under the request queue.
 *
 * At either end of the range the step renders as text rather than as a link
 * back to where you already are — a control that looks pressable and changes
 * nothing is worse than one that is visibly unavailable. It renders nothing at
 * all when there is a single page.
 */

export interface PagerProps {
  page: number
  pageCount: number
  hrefFor: (page: number) => string
}

export function Pager({ page, pageCount, hrefFor }: PagerProps) {
  if (pageCount <= 1) return null

  const status = privacyMessages.queue.pageStatus(page, pageCount)

  return (
    <nav aria-label={status} className="bo-panel flex items-center justify-between px-3 py-2">
      <Step
        href={hrefFor(page - 1)}
        label={privacyMessages.queue.pagePrevious}
        disabled={page <= 1}
      />
      <span className="text-[12px] text-muted">{status}</span>
      <Step
        href={hrefFor(page + 1)}
        label={privacyMessages.queue.pageNext}
        disabled={page >= pageCount}
      />
    </nav>
  )
}

function Step({ href, label, disabled }: { href: string; label: string; disabled: boolean }) {
  if (disabled) return <span className="text-[12px] text-disabled">{label}</span>
  return (
    <Link
      href={href}
      className="rounded-md border border-hairline px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:border-primary/40 hover:text-ink"
    >
      {label}
    </Link>
  )
}
