import type { ReactNode } from 'react'
import { formatDateTime } from '@/lib/format'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { SCOPE_LABELS_TR } from '@/lib/redact'
import { FactList } from './Facts'
import type { RevealPayload } from './reveal'

/**
 * The only component in this console that renders a user's own words.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS ALLOWED TO
 * ---------------------------------------------------------------------------
 *
 * Everything it draws arrived from one `sa_reveal_*` call, which proved six
 * things before it returned a row and wrote a `support_access_reveals` row in
 * the same statement. There is no other way for content to reach this file: it
 * takes a `RevealPayload` and nothing else, and a `RevealPayload` is only ever
 * produced by `revealAction`.
 *
 * ---------------------------------------------------------------------------
 * IT SHOWS WHAT THE RECORD SAYS, NOT A SUMMARY OF IT
 * ---------------------------------------------------------------------------
 *
 * No truncation, no ellipsis, no "…devamı". An operator who has spent a reveal
 * has already paid the whole price of it — the log row exists, the audit row
 * exists, the count went up — so hiding half the record afterwards would cost
 * the user their privacy and the operator their answer at the same time, and
 * would push them into spending a second reveal to see the rest.
 *
 * The one thing it will not do is guess. A null column renders as an em dash
 * rather than as an empty string, because on a screen about somebody's mail
 * "no subject" and "we did not read the subject" are not the same claim.
 */
export function RevealedRecord({ payload }: { payload: RevealPayload }) {
  const fields = supportAccessMessages.reveal.fields

  switch (payload.scope) {
    case 'identity':
      return (
        <RecordList
          scope={payload.scope}
          rows={payload.rows}
          keyOf={(row) => row.user_id}
          render={(row) => (
            <FactList
              items={[
                { term: fields.identity.displayName, value: row.display_name },
                { term: fields.identity.email, value: row.email },
                { term: fields.identity.givenName, value: row.given_name },
                { term: fields.identity.locale, value: row.locale },
                { term: fields.identity.timeZone, value: row.time_zone },
                { term: fields.identity.createdAt, value: instant(row.created_at) },
              ]}
            />
          )}
        />
      )

    case 'email_subject':
      return (
        <RecordList
          scope={payload.scope}
          rows={payload.rows}
          keyOf={(row) => row.thread_id}
          render={(row) => (
            <FactList
              items={[
                { term: fields.emailSubject.subject, value: row.subject },
                { term: fields.emailSubject.summary, value: <Prose text={row.summary} /> },
                { term: fields.emailSubject.category, value: row.category },
                { term: fields.emailSubject.importance, value: row.importance },
                { term: fields.emailSubject.messageCount, value: count(row.message_count) },
                { term: fields.emailSubject.lastMessageAt, value: instant(row.last_message_at) },
              ]}
            />
          )}
        />
      )

    case 'email_body':
      return (
        <RecordList
          scope={payload.scope}
          rows={payload.rows}
          keyOf={(row) => row.message_id}
          render={(row) => (
            <FactList
              items={[
                {
                  term: fields.emailMessage.from,
                  value: joinAddresses([row.from_name, row.from_email]),
                },
                { term: fields.emailMessage.to, value: joinAddresses(row.to_emails ?? []) },
                { term: fields.emailMessage.subject, value: row.subject },
                { term: fields.emailMessage.sentAt, value: instant(row.sent_at) },
                { term: fields.emailMessage.thread, value: <Token value={row.thread_id} /> },
                { term: fields.emailMessage.snippet, value: <Prose text={row.snippet} /> },
                {
                  term: fields.emailMessage.body,
                  value: <Prose text={row.body_text} />,
                  wide: true,
                },
              ]}
            />
          )}
        />
      )

    case 'calendar_detail':
      return (
        <RecordList
          scope={payload.scope}
          rows={payload.rows}
          keyOf={(row) => row.event_id}
          render={(row) => (
            <FactList
              items={[
                { term: fields.calendar.title, value: row.title },
                { term: fields.calendar.startsAt, value: instant(row.starts_at) },
                { term: fields.calendar.endsAt, value: instant(row.ends_at) },
                { term: fields.calendar.location, value: row.location },
                { term: fields.calendar.organizer, value: row.organizer_email },
                { term: fields.calendar.description, value: <Prose text={row.description} /> },
              ]}
            />
          )}
        />
      )

    case 'assistant_conversation':
      return (
        <RecordList
          scope={payload.scope}
          rows={payload.rows}
          keyOf={(row) => row.message_id}
          render={(row) => (
            <FactList
              items={[
                { term: fields.assistant.role, value: row.role },
                { term: fields.assistant.createdAt, value: instant(row.created_at) },
                { term: fields.assistant.model, value: row.model },
                { term: fields.assistant.content, value: <Prose text={row.content} />, wide: true },
              ]}
            />
          )}
        />
      )

    case 'capture_content':
      return (
        <RecordList
          scope={payload.scope}
          rows={payload.rows}
          keyOf={(row) => row.capture_id}
          render={(row) => (
            <FactList
              items={[
                { term: fields.capture.kind, value: row.kind },
                { term: fields.capture.status, value: row.status },
                { term: fields.capture.createdAt, value: instant(row.created_at) },
                { term: fields.capture.sourceUrl, value: <Token value={row.source_url} /> },
                { term: fields.capture.storagePath, value: <Token value={row.storage_path} /> },
                { term: fields.capture.rawText, value: <Prose text={row.raw_text} />, wide: true },
                {
                  term: fields.capture.extracted,
                  value: <Document value={row.extracted} />,
                  wide: true,
                },
              ]}
            />
          )}
        />
      )

    case 'approval_payload':
      return (
        <RecordList
          scope={payload.scope}
          rows={payload.rows}
          keyOf={(row) => row.approval_id}
          render={(row) => (
            <FactList
              items={[
                { term: fields.approval.type, value: row.type },
                { term: fields.approval.status, value: row.status },
                { term: fields.approval.createdAt, value: instant(row.created_at) },
                { term: fields.approval.what, value: <Prose text={row.what} /> },
                { term: fields.approval.why, value: <Prose text={row.why} /> },
                {
                  term: fields.approval.payload,
                  value: <Document value={row.payload} />,
                  wide: true,
                },
                {
                  term: fields.approval.originalPayload,
                  value: <Document value={row.original_payload} />,
                  wide: true,
                },
              ]}
            />
          )}
        />
      )

    case 'notification_content':
      return (
        <RecordList
          scope={payload.scope}
          rows={payload.rows}
          keyOf={(row) => row.delivery_id}
          render={(row) => (
            <FactList
              items={[
                { term: fields.notification.category, value: row.category },
                { term: fields.notification.title, value: row.title },
                { term: fields.notification.body, value: <Prose text={row.body} />, wide: true },
                { term: fields.notification.scheduledFor, value: instant(row.scheduled_for) },
                { term: fields.notification.sentAt, value: instant(row.sent_at) },
                { term: fields.notification.failedAt, value: instant(row.failed_at) },
              ]}
            />
          )}
        />
      )
  }
}

/**
 * One block per record, numbered.
 *
 * A reveal can open one record or two hundred, and the count matters: it is the
 * number the log wrote against the operator's name. So the list is ordered and
 * says how many rather than letting a long scroll imply it.
 */
function RecordList<Row>({
  scope,
  rows,
  keyOf,
  render,
}: {
  scope: RevealPayload['scope']
  rows: readonly Row[]
  keyOf: (row: Row) => string
  render: (row: Row) => ReactNode
}) {
  if (rows.length === 0) {
    return (
      <p role="status" className="text-[12px] text-muted">
        {supportAccessMessages.reveal.resultEmpty}
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row, index) => (
        <li key={keyOf(row)} className="rounded-md border border-hairline bg-surface2/40 p-3">
          <p className="bo-kicker mb-1.5">
            {SCOPE_LABELS_TR[scope]} · {index + 1}/{rows.length}
          </p>
          {render(row)}
        </li>
      ))}
    </ol>
  )
}

/** Free text exactly as the user wrote it: every line, every break. */
function Prose({ text }: { text: string | null }) {
  if (text === null || text.trim() === '') return null
  return (
    <span className="block max-h-[32rem] overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
      {text}
    </span>
  )
}

/**
 * A structured column — an extracted field set, an approval's payload.
 *
 * Rendered as JSON rather than flattened into prose: this is what the assistant
 * will act on, and an operator debugging "why will this not execute" needs the
 * document, not a paraphrase of it.
 */
function Document({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-hairline bg-surface px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap text-ink">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/** An identifier, a path or a URL. Rendered, never followed. */
function Token({ value }: { value: string | null }) {
  if (value === null || value === '') return null
  return <span className="font-mono text-[11px] break-all text-ink">{value}</span>
}

function instant(value: string | null): string | null {
  return value === null ? null : formatDateTime(value)
}

function count(value: number | null): string | null {
  return value === null ? null : String(value)
}

function joinAddresses(parts: readonly (string | null)[]): string | null {
  const present = parts.filter((part): part is string => part !== null && part.trim() !== '')
  return present.length === 0 ? null : present.join(' · ')
}
