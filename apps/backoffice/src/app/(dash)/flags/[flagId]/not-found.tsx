import Link from 'next/link'
import { FLAGS_PATH } from '@/components/flags'
import { flagMessages } from '@/lib/messages/flags'

/**
 * A flag id that resolves to nothing.
 *
 * Two ways to get here in normal operation: a mistyped or stale link, and a
 * flag another operator removed while this one had the page open. Unlike a
 * Support Access grant, a feature flag *can* be deleted — its audit rows
 * survive it, keyed by the id — so the copy does not claim the id must be
 * wrong.
 */
export default function FlagNotFound() {
  return (
    <div className="bo-panel mx-auto max-w-md p-6 text-center">
      <h1 className="text-[16px] font-semibold text-ink">{flagMessages.detail.notFound}</h1>
      <p className="mt-1 text-[13px] text-muted">{flagMessages.detail.notFoundHint}</p>
      <Link
        href={FLAGS_PATH}
        className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
      >
        {flagMessages.detail.backToList}
      </Link>
    </div>
  )
}
