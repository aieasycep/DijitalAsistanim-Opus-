import { ShieldAlert } from 'lucide-react'
import { supportAccessMessages } from '@/lib/messages/support-access'

/**
 * The panel above the request form.
 *
 * It is the most important thing on the page and it is deliberately not a
 * tooltip, not a collapsed disclosure and not a line of small grey text. An
 * operator is about to ask for the ability to read a specific person's mail,
 * calendar or conversations with their assistant, and they should read what
 * that means before they read the form.
 *
 * Every sentence here is true of the mechanism as built, not aspirational:
 * the scope list is the `support_access_scope` enum, the window ceiling is a
 * check constraint, per-view logging is a trigger on `support_access_reveals`,
 * and the grant belongs to one admin because `sa_assert_grant()` compares the
 * caller against `admin_user_id` on every single reveal.
 */
export function ConsequenceNotice() {
  return (
    <section className="rounded-md border border-warning/40 bg-warning-soft px-4 py-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-warning-text">
        <ShieldAlert aria-hidden="true" className="size-4" />
        {supportAccessMessages.request.consequenceTitle}
      </h2>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[12px] text-warning-text/90">
        {supportAccessMessages.request.consequences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-warning/30 pt-2 text-[12px] font-medium text-warning-text">
        {supportAccessMessages.request.consequenceClosing}
      </p>
    </section>
  )
}
