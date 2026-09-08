import Link from 'next/link'
import { ADMINS_PATH } from '@/components/admins/contract'
import { adminMessages } from '@/lib/messages/admins'

/**
 * A route segment that is not a uuid, or a uuid `bo_admin_users` has no row
 * for.
 *
 * The two are rendered the same on purpose. Telling a caller which identifiers
 * exist is an enumeration oracle, and there is nothing an operator can do
 * differently in the two cases: the link is stale either way.
 */
export default function AdminNotFound() {
  return (
    <div className="bo-panel mx-auto max-w-lg p-6 text-center">
      <h1 className="text-[16px] font-semibold text-ink">{adminMessages.detail.notFoundTitle}</h1>
      <p className="mt-1 text-[13px] text-muted">{adminMessages.detail.notFoundBody}</p>
      <div className="mt-4">
        <Link
          href={ADMINS_PATH}
          className="inline-flex h-8 items-center rounded-md border border-hairline px-4 text-[13px] font-medium text-muted hover:text-ink"
        >
          {adminMessages.detail.backToList}
        </Link>
      </div>
    </div>
  )
}
