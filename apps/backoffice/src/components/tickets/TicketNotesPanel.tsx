import type { Clock } from '@da/domain'
import type { ReactNode } from 'react'
import { Badge, Card, CardEmpty, CardError } from '@/components/ui'
import type { SupportNoteTableRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { noteVisibilityLabels, ticketMessages } from '@/lib/messages/tickets'
import type { TicketAdmin, TicketNotes } from '@/lib/queries/tickets'
import { adminLabel } from './presentation'

/**
 * The note thread: what the team said to itself, and what it said to the user.
 *
 * The distinction is the panel's whole point. `support_notes.is_internal` is
 * what makes "the thread of what the user was told is reconstructable without
 * storing their reply" true, and a timeline that rendered both kinds alike
 * would destroy exactly that. So a user-visible note is marked, tinted and
 * announced; an internal one is plain.
 *
 * Notes are staff-authored text rendered as text — React escapes it, and there
 * is no HTML path — so a note quoting a user cannot become markup.
 */

export interface TicketNotesPanelProps {
  notes: TicketNotes | null
  /** From `messages.errors`, never a raw exception string. */
  error: string | null
  /** `admin_users.id` → the staff row, for the author line. */
  authors: ReadonlyMap<string, TicketAdmin>
  /** Rendered under the thread: the add-note form, when the operator may write. */
  composer?: ReactNode
  clock: Clock
}

export function TicketNotesPanel({
  notes,
  error,
  authors,
  composer,
  clock,
}: TicketNotesPanelProps) {
  return (
    <Card
      title={ticketMessages.detail.sectionNotes}
      description={ticketMessages.detail.sectionNotesDescription}
      action={
        notes === null || notes.total === 0 ? null : (
          <span className="text-[11px] text-faint">
            {notes.truncated
              ? ticketMessages.detail.notesTruncated(notes.notes.length, notes.total)
              : ticketMessages.detail.notesCount(notes.total)}
          </span>
        )
      }
    >
      {error !== null ? (
        <CardError message={error} hint={ticketMessages.queue.errorHint} />
      ) : notes === null || notes.notes.length === 0 ? (
        <CardEmpty message={ticketMessages.detail.notesEmpty} />
      ) : (
        <ol className="flex flex-col gap-2">
          {notes.notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              author={authors.get(note.admin_user_id)}
              clock={clock}
            />
          ))}
        </ol>
      )}

      {composer === undefined ? null : (
        <div className="mt-4 border-t border-hairline pt-4">{composer}</div>
      )}
    </Card>
  )
}

function NoteItem({
  note,
  author,
  clock,
}: {
  note: SupportNoteTableRow
  author: TicketAdmin | undefined
  clock: Clock
}) {
  return (
    <li
      className={[
        'rounded-md border px-3 py-2',
        note.is_internal ? 'border-hairline bg-surface' : 'border-primary/30 bg-primary-soft/40',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] font-semibold text-ink">{adminLabel(author)}</span>
        <Badge tone={note.is_internal ? 'neutral' : 'primary'}>
          {note.is_internal ? noteVisibilityLabels.internal : noteVisibilityLabels.user}
        </Badge>
        <span className="ml-auto text-[11px] text-faint" title={formatDateTime(note.created_at)}>
          {formatRelative(note.created_at, clock)}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{note.body}</p>
    </li>
  )
}
