import Link from 'next/link'
import {
  OUTCOME_COPY_TR,
  announcementMessages,
  type AnnouncementOutcome,
} from '@/lib/messages/announcements'

/**
 * What the last action did, in the operator's own language.
 *
 * The outcome travels on the query string as a token from
 * `ANNOUNCEMENT_OUTCOMES` and is rendered from a table in this codebase — no
 * database message and no provider text ever reaches this banner, and an
 * unrecognised token renders nothing rather than being echoed back.
 *
 * `auditMissing` is deliberately as loud as an outright failure. The change did
 * happen; what did not happen is the record of it, and telling an operator "işlem
 * tamam" over a missing trail is the one reassurance this console must never
 * give.
 */

const TONE_CLASS = {
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
} as const

export interface ResultBannerProps {
  outcome: AnnouncementOutcome
  /** Where "kapat" goes: this page without the outcome parameter. */
  dismissHref: string
}

export function ResultBanner({ outcome, dismissHref }: ResultBannerProps) {
  const copy = OUTCOME_COPY_TR[outcome]

  return (
    <div
      role="status"
      className={`mb-4 flex flex-wrap items-start justify-between gap-3 rounded-md px-3 py-2 ${TONE_CLASS[copy.tone]}`}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{copy.title}</p>
        <p className="mt-0.5 max-w-prose text-[12px] opacity-90">{copy.body}</p>
      </div>
      <Link href={dismissHref} className="text-[12px] font-medium underline underline-offset-2">
        {announcementMessages.banner.dismiss}
      </Link>
    </div>
  )
}
