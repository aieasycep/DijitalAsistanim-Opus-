'use client'

import { useId, useState } from 'react'
import { Field, Textarea, fieldControlProps } from '@/components/ui'
import { CSRF_FIELD_NAME } from '@/lib/session-cookies'
import { noteVisibilityLabels, ticketMessages } from '@/lib/messages/tickets'
import {
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  NOTE_VISIBILITIES,
  TICKET_FIELDS,
  type NoteVisibility,
} from './contract'
import { TicketSubmitButton } from './SubmitButton'

/**
 * Adding a note to a ticket.
 *
 * The one action here that does not ask for a separate justification, because
 * the note *is* the justification: it goes into `support_notes` where the next
 * operator reads it, and the audit row records which kind of note was added,
 * how long it was and by whom — never its text, since a note written to a user
 * can quote the user.
 *
 * The visibility choice is a radio pair rather than a checkbox because the two
 * options have genuinely different consequences and neither is a safe default
 * to leave un-read: an internal note stays in the team, and a user-visible one
 * starts this ticket's time-to-first-response clock. The form says so, and it
 * says it louder when the ticket has not been answered yet.
 *
 * The client-side length check is a courtesy. The Server Action re-checks the
 * permission, the CSRF token and the note itself, because a disabled button
 * stops nobody who can post a form.
 */

export interface AddNoteFormProps {
  action: (formData: FormData) => void | Promise<void>
  ticketId: string
  returnTo: string
  csrfToken: string
  /** True when no user-visible note exists yet, so the choice is consequential. */
  firstResponsePending: boolean
}

export function AddNoteForm({
  action,
  ticketId,
  returnTo,
  csrfToken,
  firstResponsePending,
}: AddNoteFormProps) {
  const baseId = useId()
  const bodyId = `${baseId}-body`
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>('internal')

  const trimmed = body.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < NOTE_MIN_LENGTH
  const error = tooShort ? ticketMessages.actions.noteTooShort(NOTE_MIN_LENGTH) : null
  const ready = trimmed.length >= NOTE_MIN_LENGTH && trimmed.length <= NOTE_MAX_LENGTH

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
      <input type="hidden" name={TICKET_FIELDS.ticketId} value={ticketId} />
      <input type="hidden" name={TICKET_FIELDS.returnTo} value={returnTo} />

      <Field
        htmlFor={bodyId}
        label={ticketMessages.actions.noteLabel}
        description={ticketMessages.actions.noteDescription}
        error={error}
        required
        meta={ticketMessages.actions.noteRemaining(Math.max(0, NOTE_MAX_LENGTH - body.length))}
      >
        <Textarea
          id={bodyId}
          name={TICKET_FIELDS.noteBody}
          value={body}
          onChange={(event) => {
            setBody(event.target.value)
          }}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={ticketMessages.actions.notePlaceholder}
          required
          {...fieldControlProps(bodyId, { description: true, error })}
        />
      </Field>

      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="bo-kicker mb-1">{ticketMessages.actions.noteVisibilityLabel}</legend>
        {NOTE_VISIBILITIES.map((option) => (
          <label key={option} className="flex items-center gap-1.5 text-[12px] text-ink">
            <input
              type="radio"
              name={TICKET_FIELDS.noteVisibility}
              value={option}
              checked={visibility === option}
              onChange={() => {
                setVisibility(option)
              }}
              className="size-3.5 accent-primary"
            />
            {noteVisibilityLabels[option]}
          </label>
        ))}
      </fieldset>

      {firstResponsePending && visibility === 'user' ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
          {ticketMessages.actions.noteFirstResponseWarning}
        </p>
      ) : null}

      <div className="flex justify-end">
        <TicketSubmitButton
          label={ticketMessages.actions.noteSubmit}
          pendingLabel={ticketMessages.actions.notePending}
          disabled={!ready}
        />
      </div>
    </form>
  )
}
