import type { Clock } from '@da/domain'
import Link from 'next/link'
import { Badge, Card, Mono } from '@/components/ui'
import type { SupportTicketTableRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import {
  ticketCategoryLabels,
  ticketChannelLabels,
  ticketMessages,
  ticketPriorityLabels,
  ticketStatusLabels,
} from '@/lib/messages/tickets'
import { ageMinutes, isOverdue, responseMinutes, type TicketAdmin } from '@/lib/queries/tickets'
import type { TicketSubject } from '@/lib/queries/tickets'
import { isActiveStatus } from './contract'
import { DetailList, type DetailItem } from './DetailList'
import {
  adminLabel,
  firstResponseDisplay,
  formatMinutes,
  priorityTone,
  statusTone,
} from './presentation'

/**
 * The ticket's own facts, and the text the user actually sent.
 *
 * The body is rendered because it *is* the ticket: it is what a person typed
 * into the support form in order to be helped, and a queue that hides it is a
 * queue nobody can work. It is not mail, not a calendar entry and not an
 * assistant conversation — none of which this screen can reach at all — and the
 * page says so beneath it.
 *
 * `white-space: pre-wrap` and no HTML: the body is rendered as text by React,
 * so nothing a user typed is ever interpreted as markup.
 */

export interface TicketSummaryPanelProps {
  ticket: SupportTicketTableRow
  assignee: TicketAdmin | undefined
  openedBy: TicketAdmin | undefined
  subject: TicketSubject | undefined
  clock: Clock
}

export function TicketSummaryPanel({
  ticket,
  assignee,
  openedBy,
  subject,
  clock,
}: TicketSummaryPanelProps) {
  const age = ageMinutes(ticket.created_at, clock)
  const response = firstResponseDisplay({
    minutes: responseMinutes(ticket.created_at, ticket.first_response_at),
    ageMinutes: age,
    isActive: isActiveStatus(ticket.status),
  })
  const overdue = isOverdue(ticket, clock)

  const items: readonly DetailItem[] = [
    {
      label: ticketMessages.columns.status,
      value: (
        <Badge tone={statusTone[ticket.status]} dot>
          {ticketStatusLabels[ticket.status]}
        </Badge>
      ),
    },
    {
      label: ticketMessages.columns.priority,
      value: (
        <Badge tone={priorityTone[ticket.priority]}>{ticketPriorityLabels[ticket.priority]}</Badge>
      ),
    },
    {
      label: ticketMessages.columns.category,
      value: ticketCategoryLabels[ticket.category],
    },
    {
      label: ticketMessages.detail.channel,
      value: ticketChannelLabels[ticket.channel],
    },
    {
      label: ticketMessages.columns.assignee,
      value:
        ticket.assigned_admin_user_id === null ? (
          <Badge tone="warning">{ticketMessages.values.unassigned}</Badge>
        ) : (
          adminLabel(assignee)
        ),
    },
    {
      label: ticketMessages.columns.subjectUser,
      value:
        ticket.subject_user_id === null ? (
          ticketMessages.values.noSubjectUser
        ) : (
          <Link
            href={`/users/${ticket.subject_user_id}`}
            className="text-primary-on-soft hover:underline"
          >
            {subject?.emailRedacted ?? <Mono>{ticket.subject_user_id}</Mono>}
          </Link>
        ),
    },
    {
      label: ticketMessages.detail.createdAt,
      value: `${formatDateTime(ticket.created_at)} · ${formatMinutes(age)}`,
    },
    {
      label: ticketMessages.detail.firstResponseAt,
      value:
        ticket.first_response_at === null ? (
          <Badge tone={response.tone}>{response.label}</Badge>
        ) : (
          `${formatDateTime(ticket.first_response_at)} · ${response.label}`
        ),
    },
    {
      label: ticketMessages.detail.dueAt,
      value:
        ticket.due_at === null ? (
          ticketMessages.values.noDueDate
        ) : overdue ? (
          <Badge tone="critical" title={formatDateTime(ticket.due_at)}>
            {`${ticketMessages.values.overdue} · ${formatRelative(ticket.due_at, clock)}`}
          </Badge>
        ) : (
          formatDateTime(ticket.due_at)
        ),
    },
    {
      label: ticketMessages.detail.updatedAt,
      value: formatDateTime(ticket.updated_at),
    },
    {
      label: ticketMessages.detail.resolvedAt,
      value: ticket.resolved_at === null ? null : formatDateTime(ticket.resolved_at),
    },
    {
      label: ticketMessages.detail.closedAt,
      value: ticket.closed_at === null ? null : formatDateTime(ticket.closed_at),
    },
    {
      label: ticketMessages.detail.openedBy,
      value:
        ticket.opened_by_admin_user_id === null
          ? ticketMessages.detail.openedBySystem
          : adminLabel(openedBy),
    },
    {
      label: ticketMessages.detail.externalRef,
      value: ticket.external_ref === null ? null : <Mono>{ticket.external_ref}</Mono>,
    },
  ]

  return (
    <Card title={ticketMessages.detail.sectionSummary}>
      <DetailList items={items} />
    </Card>
  )
}

export function TicketBodyPanel({ ticket }: { ticket: SupportTicketTableRow }) {
  const body = ticket.body === null ? '' : ticket.body.trim()

  return (
    <Card
      title={ticketMessages.detail.sectionBody}
      description={ticketMessages.detail.sectionBodyDescription}
    >
      {body === '' ? (
        <p className="text-[13px] text-faint">{ticketMessages.detail.bodyEmpty}</p>
      ) : (
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{body}</p>
      )}

      {ticket.resolution_note === null ? null : (
        <div className="mt-4 rounded-md bg-surface2 px-3 py-2">
          <p className="bo-kicker">{ticketMessages.detail.resolutionHeading}</p>
          <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
            {ticket.resolution_note}
          </p>
          {ticket.resolved_at === null ? (
            <p className="mt-1 text-[11px] text-warning-text">
              {ticketMessages.detail.reopenedNote}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  )
}
