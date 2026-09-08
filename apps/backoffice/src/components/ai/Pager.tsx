import Link from 'next/link'
import { formatNumber } from '@/lib/format'
import { AI_PARAMS } from './contract'
import { aiMessages } from './messages'

/**
 * Page controls for a server-queried list.
 *
 * Plain links, because the query lives in the URL: a page is a real navigation
 * the server answers with a new `range()`, not a slice of an array already in
 * the browser. An edge — first page, last page — renders as text rather than a
 * disabled-looking link, so nothing on screen invites a press that does
 * nothing.
 */
export function Pager({
  basePath,
  values,
  page,
  pageSize,
  total,
}: {
  basePath: string
  /** Every current parameter, so a page link keeps the window and threshold. */
  values: Readonly<Record<string, string>>
  page: number
  pageSize: number
  total: number
}) {
  if (total === 0) return null

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  function href(target: number): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) {
      if (key !== AI_PARAMS.page && value !== '') params.set(key, value)
    }
    if (target > 1) params.set(AI_PARAMS.page, String(target))
    const query = params.toString()
    return query === '' ? basePath : `${basePath}?${query}`
  }

  const linkClass =
    'h-7 rounded-md border border-hairline px-2.5 text-[12px] font-medium leading-7 text-muted transition-colors hover:border-primary/40 hover:text-ink'
  const edgeClass = 'h-7 px-2.5 text-[12px] leading-7 text-disabled'

  return (
    <nav
      aria-label={aiMessages.pagination.label}
      className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2"
    >
      <p className="text-[12px] text-faint">
        {aiMessages.pagination.range(formatNumber(from), formatNumber(to), formatNumber(total))}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-faint">
          {aiMessages.pagination.page(page, pageCount)}
        </span>
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass} rel="prev">
            {aiMessages.pagination.previous}
          </Link>
        ) : (
          <span className={edgeClass}>{aiMessages.pagination.previous}</span>
        )}
        {page < pageCount ? (
          <Link href={href(page + 1)} className={linkClass} rel="next">
            {aiMessages.pagination.next}
          </Link>
        ) : (
          <span className={edgeClass}>{aiMessages.pagination.next}</span>
        )}
      </div>
    </nav>
  )
}
