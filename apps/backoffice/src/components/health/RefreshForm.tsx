'use client'

import { REFRESH_FIELDS } from './contract'
import { SubmitButton } from './SubmitButton'

/**
 * "Yenile" — re-reads every query on this page and comes back to the same URL.
 *
 * Deliberately separate from "Şimdi ölç", and the difference matters on this
 * page more than anywhere else: this button re-reads what has already been
 * measured, that one measures. Merging them would mean an operator refreshing
 * the screen quietly generated seven outbound requests every time they wanted
 * to see whether a cron probe had landed.
 */
export function RefreshForm({
  action,
  returnTo,
  csrf,
  label,
  pendingLabel,
}: {
  action: (formData: FormData) => void | Promise<void>
  returnTo: string
  csrf: { name: string; value: string }
  label: string
  pendingLabel: string
}) {
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name={csrf.name} value={csrf.value} />
      <input type="hidden" name={REFRESH_FIELDS.returnTo} value={returnTo} />
      <SubmitButton label={label} pendingLabel={pendingLabel} variant="quiet" />
    </form>
  )
}
