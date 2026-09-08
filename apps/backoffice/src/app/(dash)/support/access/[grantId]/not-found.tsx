import Link from 'next/link'
import { SUPPORT_ACCESS_PATH } from '@/components/support-access/contract'
import { supportAccessMessages } from '@/lib/messages/support-access'

/**
 * A grant id that resolves to nothing.
 *
 * There is exactly one way for this to be reached in normal operation: a
 * mistyped or stale link. A Support Access grant is never deleted — it is the
 * evidence that somebody was allowed to look, and it has to outlive the
 * looking, which is why `support_access_reveals` carries
 * `on delete restrict` against it. So "not found" here means the id is wrong,
 * not that the record was cleaned up, and the copy says so.
 */
export default function SupportAccessGrantNotFound() {
  return (
    <div className="bo-panel mx-auto max-w-md p-6 text-center">
      <h1 className="text-[16px] font-semibold text-ink">
        {supportAccessMessages.detail.notFound}
      </h1>
      <p className="mt-1 text-[13px] text-muted">{supportAccessMessages.detail.notFoundHint}</p>
      <Link
        href={SUPPORT_ACCESS_PATH}
        className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
      >
        {supportAccessMessages.detail.backToList}
      </Link>
    </div>
  )
}
