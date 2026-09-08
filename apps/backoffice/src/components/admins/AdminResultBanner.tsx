import Link from 'next/link'
import type { BadgeTone } from '@/components/ui/Badge'
import { adminMessages, adminOutcomeMessages } from '@/lib/messages/admins'
import { ROLE_LABELS_TR } from '@/lib/permissions'
import { isAdminOutcome, isRole } from './contract'
import { outcomeTone } from './presentation'

/**
 * What the last action did, said in the operator's own language.
 *
 * The only things that cross the URL are a token from `ADMIN_OUTCOMES` and, at
 * most, a role name — this codebase's own vocabulary, re-checked here rather
 * than trusted, so nothing a database or a form wrote can reach this banner. An
 * unrecognised token renders nothing at all rather than an empty box.
 *
 * `disabled`, `sessionsRevoked` and `inviteRevoked` read as warnings even
 * though they succeeded: they worked, and they still mean somebody's access is
 * gone. `auditMissing` is critical, because the change happened and the record
 * of it did not — the one outcome on this screen that needs a human to write
 * something down elsewhere.
 */

const TONE_CLASS: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-surface2 text-muted',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
  info: 'bg-info-soft text-info-text',
  primary: 'bg-primary-soft text-primary-on-soft',
}

export function AdminResultBanner({
  outcome,
  subject,
  dismissHref,
}: {
  /** The raw `?result=` value. */
  outcome: string
  /** The raw `?kim=` value, or an empty string. */
  subject: string
  /** Where "kapat" goes: this page without the result parameters. */
  dismissHref: string
}) {
  if (!isAdminOutcome(outcome)) return null

  const copy = adminOutcomeMessages[outcome]
  const tone = outcomeTone(outcome)
  // The one thing an action ever puts in `?kim=` is a role token. It is
  // narrowed against `ADMIN_ROLES` and rendered as its Turkish label — so the
  // sentence reads "Operasyon" rather than "operations", and a hand-edited URL
  // cannot put a sentence of somebody else's choosing inside a banner that
  // otherwise says only what this console did.
  const subjectLabel = isRole(subject) ? ROLE_LABELS_TR[subject] : null

  return (
    <div
      role="status"
      className={`flex flex-wrap items-start justify-between gap-3 rounded-md px-3 py-2.5 ${TONE_CLASS[tone]}`}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">
          {copy.title}
          {subjectLabel === null ? null : <span className="ml-1.5 opacity-80">{subjectLabel}</span>}
        </p>
        <p className="mt-0.5 max-w-prose text-[12px] opacity-90">{copy.body}</p>
      </div>
      <Link
        href={dismissHref}
        className="shrink-0 text-[12px] font-medium underline underline-offset-2"
      >
        {adminMessages.banner.dismiss}
      </Link>
    </div>
  )
}
