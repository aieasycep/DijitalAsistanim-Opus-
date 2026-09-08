'use client'

import { CHECK_FIELDS, CHECK_SCOPE_ALL } from './contract'
import { SubmitButton } from './SubmitButton'

/**
 * "Şimdi ölç" — the button that performs a real measurement.
 *
 * One component for both callers: the toolbar's whole-roster check and the
 * per-row check inside the dependency table. What it posts is a target name
 * from the roster (or `tumu`), the page to come back to, and the session's CSRF
 * token. Nothing here decides anything: the Server Action re-checks the origin,
 * the token, both permissions and the target before a single connection opens.
 *
 * There is no confirmation dialog and no reason field, and that is a considered
 * position rather than an omission. The console demands a written justification
 * for actions that change something a person owns; this one opens an
 * unauthenticated connection to a public endpoint and appends a measurement.
 * Putting a reason field in front of it during an incident would buy nothing
 * and cost the seconds it is meant to save. The audit row is still written, and
 * still names the operator.
 */

export interface CheckFormProps {
  action: (formData: FormData) => void | Promise<void>
  /** A roster target, or `CHECK_SCOPE_ALL` for every one of them. */
  target?: string
  returnTo: string
  csrf: { name: string; value: string }
  label: string
  pendingLabel: string
  variant?: 'primary' | 'quiet'
}

export function CheckForm({
  action,
  target = CHECK_SCOPE_ALL,
  returnTo,
  csrf,
  label,
  pendingLabel,
  variant = 'primary',
}: CheckFormProps) {
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name={csrf.name} value={csrf.value} />
      <input type="hidden" name={CHECK_FIELDS.target} value={target} />
      <input type="hidden" name={CHECK_FIELDS.returnTo} value={returnTo} />
      <SubmitButton label={label} pendingLabel={pendingLabel} variant={variant} />
    </form>
  )
}
