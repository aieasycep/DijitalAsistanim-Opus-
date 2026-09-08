import Link from 'next/link'
import { userMessages } from '@/components/users/messages'

/**
 * A user id that resolves to nothing.
 *
 * Two very different situations land here — a mistyped id, and an account that
 * has been fully deleted — and the copy names both, because "not found" alone
 * would send an operator hunting for a record that was correctly destroyed.
 */
export default function UserNotFound() {
  return (
    <div className="p-4">
      <div className="bo-panel mx-auto max-w-md p-6 text-center">
        <h1 className="text-[16px] font-semibold text-ink">{userMessages.detail.notFoundTitle}</h1>
        <p className="mt-1 text-[13px] text-muted">{userMessages.detail.notFoundBody}</p>
        <Link
          href="/users"
          className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
        >
          {userMessages.detail.notFoundAction}
        </Link>
      </div>
    </div>
  )
}
