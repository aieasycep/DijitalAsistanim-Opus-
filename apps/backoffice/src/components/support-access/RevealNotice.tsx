import { EyeOff } from 'lucide-react'
import Link from 'next/link'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { formatMinutesRemainingTr } from '@/lib/redact'
import { userHref } from './contract'

/**
 * What the operator is about to do, said before they can do it.
 *
 * `ConsequenceNotice` warns somebody who is *asking* for access. This warns
 * somebody who *has* it and is one click from spending it, which is a different
 * moment and needs a different sentence: the access is no longer hypothetical,
 * the person whose data it covers is named on the screen, and the clock is
 * already running.
 *
 * It is not collapsible and it is not a tooltip. An operator who has to expand
 * a disclosure to learn that they are reading a stranger's mail will not expand
 * it the second time.
 */
export function RevealNotice({
  subjectLabel,
  subjectUserId,
  minutesRemaining,
}: {
  /** The redacted address, or a short id when the view has no address. */
  subjectLabel: string
  subjectUserId: string
  minutesRemaining: number
}) {
  return (
    <section className="rounded-md border border-critical/40 bg-critical-soft px-4 py-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-critical-text">
        <EyeOff aria-hidden="true" className="size-4" />
        {supportAccessMessages.reveal.noticeTitle}
      </h2>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-critical-text">
        <span className="font-semibold">{subjectLabel}</span>
        <Link href={userHref(subjectUserId)} className="underline underline-offset-2">
          {supportAccessMessages.detail.subjectOpen}
        </Link>
        <span aria-hidden="true">·</span>
        <span>
          {supportAccessMessages.reveal.remaining}: {formatMinutesRemainingTr(minutesRemaining)}
        </span>
      </p>

      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[12px] text-critical-text/90">
        {supportAccessMessages.reveal.notices.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}
