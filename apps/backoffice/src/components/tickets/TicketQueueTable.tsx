import type { Clock } from '@da/domain'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  Badge,
  DataTable,
  Mono,
  type Column,
  type TableLocation,
  type TableSort,
} from '@/components/ui'
import { formatDateTime, formatRelative } from '@/lib/format'
import {
  ticketCategoryLabels,
  ticketChannelLabels,
  ticketMessages,
  ticketPriorityLabels,
  ticketStatusLabels,
} from '@/lib/messages/tickets'
import {
  ageMinutes,
  isOverdue,
  responseMinutes,
  type TicketAdmin,
  type TicketListRow,
  type TicketSubject,
} from '@/lib/queries/tickets'
import { TICKET_PAGE_SIZES, isActiveStatus, ticketPath } from './contract'
import {
  adminLabel,
  firstResponseDisplay,
  formatMinutes,
  priorityTone,
  statusTone,
} from './presentation'

/**
 * The queue, as a table.
 *
 * Server-rendered on top of the shared `DataTable`, so sorting, paging and
 * column visibility are links the server answers rather than work the browser
 * does on rows it should never have been handed. Every column that offers a
 * sort names a real `support_tickets` column; the two derived columns — age and
 * time to first response — are ordered through the timestamps they are computed
 * from, and their headers say so.
 *
 * Two rows are highlighted, and only for reasons an operator has to act on: a
 * ticket past its termin is critical, an unanswered critical-priority ticket is
 * a warning. A tone that meant "look at this" for any other reason would make
 * the two that matter invisible.
 *
 * Nothing in here can render mail. `TicketListRow` is a `Pick` over the columns
 * the query selected, and neither `body` nor `resolution_note` is among them.
 */

export interface TicketQueueTableProps {
  rows: readonly TicketListRow[]
  /** `admin_users.id` → the staff row, for the assignee column. */
  admins: ReadonlyMap<string, TicketAdmin>
  /** `auth.users.id` → the redacted address, for the user column. */
  subjects: ReadonlyMap<string, TicketSubject>
  total: number
  page: number
  pageSize: number
  sort: TableSort | null
  /** Columns the operator has hidden, from the URL; null means they have not chosen. */
  hiddenColumns: readonly string[] | null
  location: TableLocation
  /** From `messages.errors`, never a raw exception string. */
  error: string | null
  filtered: boolean
  emptyAction?: ReactNode
  clock: Clock
}

export function TicketQueueTable({
  rows,
  admins,
  subjects,
  total,
  page,
  pageSize,
  sort,
  hiddenColumns,
  location,
  error,
  filtered,
  emptyAction,
  clock,
}: TicketQueueTableProps) {
  const columns: readonly Column<TicketListRow>[] = [
    {
      key: 'reference',
      header: ticketMessages.columns.reference,
      sortKey: 'reference',
      hideable: false,
      width: 'w-32',
      cell: (row) => (
        <Link
          href={ticketPath(row.id)}
          className="font-mono text-[12px] font-medium text-primary-on-soft hover:underline"
        >
          {row.reference}
        </Link>
      ),
    },
    {
      key: 'subject',
      header: ticketMessages.columns.subject,
      hideable: false,
      cell: (row) => (
        <span className="block max-w-[28rem] truncate text-[13px] text-ink" title={row.subject}>
          {row.subject}
        </span>
      ),
    },
    {
      key: 'status',
      header: ticketMessages.columns.status,
      sortKey: 'status',
      width: 'w-36',
      cell: (row) => (
        <Badge tone={statusTone[row.status]} dot>
          {ticketStatusLabels[row.status]}
        </Badge>
      ),
    },
    {
      key: 'priority',
      header: ticketMessages.columns.priority,
      sortKey: 'priority',
      width: 'w-28',
      cell: (row) => (
        <Badge tone={priorityTone[row.priority]}>{ticketPriorityLabels[row.priority]}</Badge>
      ),
    },
    {
      key: 'category',
      header: ticketMessages.columns.category,
      sortKey: 'category',
      secondary: true,
      width: 'w-32',
      cell: (row) => (
        <span className="text-[12px] text-muted">{ticketCategoryLabels[row.category]}</span>
      ),
    },
    {
      key: 'channel',
      header: ticketMessages.columns.channel,
      secondary: true,
      defaultHidden: true,
      width: 'w-28',
      cell: (row) => (
        <span className="text-[12px] text-muted">{ticketChannelLabels[row.channel]}</span>
      ),
    },
    {
      key: 'assignee',
      header: ticketMessages.columns.assignee,
      width: 'w-40',
      cell: (row) =>
        row.assigned_admin_user_id === null ? (
          <Badge tone="warning">{ticketMessages.values.unassigned}</Badge>
        ) : (
          <span className="text-[12px] text-ink">
            {adminLabel(admins.get(row.assigned_admin_user_id))}
          </span>
        ),
    },
    {
      key: 'subjectUser',
      header: ticketMessages.columns.subjectUser,
      secondary: true,
      width: 'w-48',
      cell: (row) => renderSubject(row.subject_user_id, subjects),
    },
    {
      key: 'age',
      header: ticketMessages.columns.age,
      title: ticketMessages.columnHints.age,
      // Age is `now - created_at`, so ordering by the opening time orders by
      // age exactly — the arrow on this header sorts the timestamp it is
      // derived from, which is what the tooltip on the cell shows.
      sortKey: 'created_at',
      align: 'right',
      width: 'w-28',
      cell: (row) => (
        <span
          className="tabular-nums text-[12px] text-muted"
          title={formatDateTime(row.created_at)}
        >
          {formatMinutes(ageMinutes(row.created_at, clock))}
        </span>
      ),
    },
    {
      key: 'firstResponse',
      header: ticketMessages.columns.firstResponse,
      title: ticketMessages.columnHints.firstResponse,
      sortKey: 'first_response_at',
      align: 'right',
      width: 'w-44',
      cell: (row) => {
        const display = firstResponseDisplay({
          minutes: responseMinutes(row.created_at, row.first_response_at),
          ageMinutes: ageMinutes(row.created_at, clock),
          isActive: isActiveStatus(row.status),
        })
        return display.tone === 'neutral' ? (
          <span className="tabular-nums text-[12px] text-muted">{display.label}</span>
        ) : (
          <Badge tone={display.tone}>{display.label}</Badge>
        )
      },
    },
    {
      key: 'due',
      header: ticketMessages.columns.due,
      title: ticketMessages.columnHints.due,
      sortKey: 'due_at',
      secondary: true,
      align: 'right',
      width: 'w-40',
      cell: (row) =>
        row.due_at === null ? null : isOverdue(row, clock) ? (
          <Badge tone="critical" title={formatDateTime(row.due_at)}>
            {`${ticketMessages.values.overdue} · ${formatRelative(row.due_at, clock)}`}
          </Badge>
        ) : (
          <span className="tabular-nums text-[12px] text-muted" title={formatDateTime(row.due_at)}>
            {formatRelative(row.due_at, clock)}
          </span>
        ),
    },
    {
      key: 'updated',
      header: ticketMessages.columns.updated,
      sortKey: 'updated_at',
      secondary: true,
      defaultHidden: true,
      align: 'right',
      width: 'w-36',
      cell: (row) => (
        <span
          className="tabular-nums text-[12px] text-muted"
          title={formatDateTime(row.updated_at)}
        >
          {formatRelative(row.updated_at, clock)}
        </span>
      ),
    },
  ]

  return (
    <DataTable<TicketListRow>
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      caption={ticketMessages.queue.caption}
      error={error}
      errorHint={ticketMessages.queue.errorHint}
      emptyMessage={filtered ? ticketMessages.queue.emptyFiltered : ticketMessages.queue.empty}
      {...(filtered ? { emptyHint: ticketMessages.queue.emptyHint } : {})}
      {...(emptyAction === undefined ? {} : { emptyAction })}
      filtered={filtered}
      location={location}
      sorting={{ current: sort }}
      pagination={{
        page,
        pageSize,
        total,
        pageSizeParam: 'size',
        pageSizeOptions: TICKET_PAGE_SIZES,
      }}
      columnVisibility={{ hidden: hiddenColumns }}
      rowTone={(row) => rowToneFor(row, clock)}
      // Only claimed while it is true: once an operator picks a sort, the
      // default order is no longer what they are looking at.
      {...(sort === null
        ? {
            toolbar: (
              <span className="text-[11px] text-faint">{ticketMessages.queue.defaultOrder}</span>
            ),
          }
        : {})}
    />
  )
}

/**
 * The two states worth colouring a row for.
 *
 * Past its termin is the one that costs money; an unanswered critical is the
 * one that becomes that. Everything else stays plain, so the highlights keep
 * meaning something.
 */
function rowToneFor(row: TicketListRow, clock: Clock): 'default' | 'critical' | 'warning' {
  if (isOverdue(row, clock)) return 'critical'
  if (row.priority === 'critical' && row.first_response_at === null) return 'warning'
  return 'default'
}

/**
 * The user a ticket is about: an id and a mask, linked to their own page.
 *
 * `support_tickets` stores no address, so the mask is joined in from `bo_users`
 * at render time. A ticket with no user — a store review, an internal note —
 * says so rather than showing an empty cell.
 */
function renderSubject(
  userId: string | null,
  subjects: ReadonlyMap<string, TicketSubject>,
): ReactNode {
  if (userId === null) {
    return <span className="text-[12px] text-faint">{ticketMessages.values.noSubjectUser}</span>
  }
  const subject = subjects.get(userId)
  const label = subject?.emailRedacted ?? null
  return (
    <Link href={`/users/${userId}`} className="text-[12px] text-primary-on-soft hover:underline">
      {label === null ? <Mono>{userId.slice(0, 8)}</Mono> : label}
    </Link>
  )
}
