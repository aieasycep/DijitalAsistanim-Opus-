import Link from 'next/link'
import { ANNOUNCEMENTS_PATH } from '@/components/announcements/contract'
import { announcementMessages } from '@/lib/messages/announcements'

/**
 * An announcement id that resolves to nothing.
 *
 * Two situations land here — a link copied short of its last characters, and a
 * record that was removed — and the copy names both, because "bulunamadı" alone
 * sends an operator hunting for something that may never have existed.
 */
export default function AnnouncementNotFound() {
  return (
    <div className="p-4">
      <div className="bo-panel mx-auto max-w-md p-6 text-center">
        <h1 className="text-[16px] font-semibold text-ink">
          {announcementMessages.detail.notFoundTitle}
        </h1>
        <p className="mt-1 text-[13px] text-muted">{announcementMessages.detail.notFoundBody}</p>
        <Link
          href={ANNOUNCEMENTS_PATH}
          className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
        >
          {announcementMessages.detail.notFoundAction}
        </Link>
      </div>
    </div>
  )
}
