import Link from 'next/link'
import { GRANTS_PATH } from '@/components/grants/contract'
import { grantMessages } from '@/lib/messages/grants'

/**
 * A grant id that names nothing.
 *
 * A stale link, a mistyped id, or a row that never existed. All three read the
 * same to an operator and all three have the same remedy, so the page says what
 * happened and offers the list rather than guessing which it was.
 */
export default function GrantNotFound() {
  return (
    <div className="bo-panel mx-auto max-w-md p-6 text-center">
      <h1 className="text-[16px] font-semibold text-ink">{grantMessages.detail.notFoundTitle}</h1>
      <p className="mt-1 text-[13px] text-muted">{grantMessages.detail.notFoundBody}</p>
      <Link
        href={GRANTS_PATH}
        className="mt-4 inline-flex h-8 items-center rounded-md border border-hairline px-4 text-[13px] font-medium text-muted hover:text-ink"
      >
        {grantMessages.detail.backToList}
      </Link>
    </div>
  )
}
