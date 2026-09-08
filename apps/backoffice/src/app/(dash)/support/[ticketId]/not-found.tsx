import Link from 'next/link'
import { SUPPORT_PATH } from '@/components/tickets/contract'
import { ticketMessages } from '@/lib/messages/tickets'

/**
 * A ticket id that resolves to nothing.
 *
 * Two situations land here — a mistyped or truncated link, and a ticket whose
 * user was deleted along with everything keyed to them — and the copy names
 * both, because "bulunamadı" alone sends an operator hunting for a record that
 * was correctly destroyed.
 */
export default function TicketNotFound() {
  return (
    <div className="p-4">
      <div className="bo-panel mx-auto max-w-md p-6 text-center">
        <h1 className="text-[16px] font-semibold text-ink">
          {ticketMessages.detail.notFoundTitle}
        </h1>
        <p className="mt-1 text-[13px] text-muted">{ticketMessages.detail.notFoundBody}</p>
        <Link
          href={SUPPORT_PATH}
          className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
        >
          {ticketMessages.detail.notFoundAction}
        </Link>
      </div>
    </div>
  )
}
