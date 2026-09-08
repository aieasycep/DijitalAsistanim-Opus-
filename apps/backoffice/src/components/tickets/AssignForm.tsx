'use client'

import { useId, useState } from 'react'
import { Field, Select, Textarea, fieldControlProps } from '@/components/ui'
import { messages } from '@/lib/messages'
import { ticketMessages } from '@/lib/messages/tickets'
import { CSRF_FIELD_NAME } from '@/lib/session-cookies'
import { ASSIGNEE_NONE, TICKET_FIELDS, TICKET_REASON_MAX, TICKET_REASON_MIN } from './contract'
import { TicketSubmitButton } from './SubmitButton'

/**
 * Handing a ticket to somebody.
 *
 * A `<select>` rather than one button per colleague: the roster grows, and a
 * dialog per person would be a wall of identical buttons. The choice and the
 * reason are posted together in one form, so there is no state to lose between
 * picking a name and explaining why.
 *
 * The list contains only admins who actually hold `support.ticket.write` — the
 * Server Action re-checks that against `bo_admin_permissions` before it writes,
 * because a rendered option is a rendering decision and not an authorisation.
 *
 * The submit button stays disabled until the reason is long enough. That is a
 * courtesy, not a control: the action applies the same floor server-side and
 * refuses anything shorter whatever the button looked like.
 */

export interface AssignableAdminOption {
  adminUserId: string
  label: string
  /** The operator themselves, so the option can say "Bana ata". */
  isSelf: boolean
}

export interface AssignFormProps {
  action: (formData: FormData) => void | Promise<void>
  ticketId: string
  returnTo: string
  csrfToken: string
  /** Who the ticket is on now, or null. */
  currentAssigneeId: string | null
  currentAssigneeLabel: string | null
  options: readonly AssignableAdminOption[]
}

export function AssignForm({
  action,
  ticketId,
  returnTo,
  csrfToken,
  currentAssigneeId,
  currentAssigneeLabel,
  options,
}: AssignFormProps) {
  const baseId = useId()
  const assigneeId = `${baseId}-assignee`
  const reasonId = `${baseId}-reason`

  const [assignee, setAssignee] = useState(currentAssigneeId ?? ASSIGNEE_NONE)
  const [reason, setReason] = useState('')

  const trimmed = reason.trim()
  const reasonError =
    trimmed.length === 0
      ? null
      : trimmed.length < TICKET_REASON_MIN
        ? messages.confirm.reasonTooShort(TICKET_REASON_MIN)
        : trimmed.length > TICKET_REASON_MAX
          ? messages.confirm.reasonTooLong(TICKET_REASON_MAX)
          : null

  const changed = assignee !== (currentAssigneeId ?? ASSIGNEE_NONE)
  const ready =
    changed &&
    reasonError === null &&
    trimmed.length >= TICKET_REASON_MIN &&
    trimmed.length <= TICKET_REASON_MAX

  if (options.length === 0 && currentAssigneeId === null) {
    return <p className="text-[12px] text-faint">{ticketMessages.actions.assignEmpty}</p>
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
      <input type="hidden" name={TICKET_FIELDS.ticketId} value={ticketId} />
      <input type="hidden" name={TICKET_FIELDS.returnTo} value={returnTo} />

      {currentAssigneeLabel === null ? null : (
        <p className="text-[12px] text-muted">
          {ticketMessages.actions.assignCurrent(currentAssigneeLabel)}
        </p>
      )}

      <Field htmlFor={assigneeId} label={ticketMessages.actions.assignLabel} required>
        <Select
          id={assigneeId}
          name={TICKET_FIELDS.assignee}
          value={assignee}
          onChange={(event) => {
            setAssignee(event.target.value)
          }}
          {...fieldControlProps(assigneeId)}
        >
          <option value={ASSIGNEE_NONE}>{ticketMessages.actions.assignNone}</option>
          {options.map((option) => (
            <option key={option.adminUserId} value={option.adminUserId}>
              {option.isSelf
                ? `${option.label} — ${ticketMessages.actions.assignSelf}`
                : option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        htmlFor={reasonId}
        label={ticketMessages.actions.reasonLabel}
        description={messages.confirm.reasonDescription}
        error={reasonError}
        required
        meta={messages.confirm.reasonRemaining(Math.max(0, TICKET_REASON_MAX - reason.length))}
      >
        <Textarea
          id={reasonId}
          name={TICKET_FIELDS.reason}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
          }}
          maxLength={TICKET_REASON_MAX}
          placeholder={ticketMessages.actions.reasonPlaceholder}
          required
          {...fieldControlProps(reasonId, { description: true, error: reasonError })}
        />
      </Field>

      <p className="text-[11px] text-faint">{messages.confirm.auditNote}</p>

      <div className="flex justify-end">
        <TicketSubmitButton
          label={ticketMessages.actions.assignSubmit}
          pendingLabel={ticketMessages.actions.assignPending}
          disabled={!ready}
        />
      </div>
    </form>
  )
}
