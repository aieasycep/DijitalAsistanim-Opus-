import type { Clock } from '@da/domain'
import { DataTable, Mono, Num, type Column, type TableLocation } from '@/components/ui'
import type { BoSupportAccessRevealRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { SCOPE_LABELS_TR, shortId } from '@/lib/redact'
import { REVEALS_PAGE_SIZE, REVEAL_PAGE_PARAM } from './contract'

/**
 * One row per individual view, which is the whole point of this table.
 *
 * `support_access_reveals` is written by the `sa_reveal_*` functions in the same
 * statement that returns the data, and a row that does not match a live grant is
 * refused outright by `support_access_reveals_verify_grant()`. So this is not a
 * best-effort log an application remembered to append to — it is a record the
 * database will not let a reveal happen without.
 *
 * What it shows is which record was opened: a scope, an entity type, an
 * identifier. `bo_identifier()` collapses anything that is not token shaped, so
 * a subject line cannot reach this screen even if one were ever written into the
 * column. The reveal log is not a second copy of the mailbox.
 */
export function RevealLogTable({
  rows,
  total,
  page,
  location,
  clock,
  error,
}: {
  rows: readonly BoSupportAccessRevealRow[]
  /** Exact count from Postgres. */
  total: number
  page: number
  location: TableLocation
  clock: Clock
  error: string | null
}) {
  const columns: readonly Column<BoSupportAccessRevealRow>[] = [
    {
      key: 'revealed_at',
      header: supportAccessMessages.reveals.columns.revealedAt,
      width: 'w-36',
      hideable: false,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="whitespace-nowrap text-[12px] text-ink">
            {formatDateTime(row.revealed_at)}
          </span>
          <span className="text-[11px] text-faint">{formatRelative(row.revealed_at, clock)}</span>
        </span>
      ),
    },
    {
      key: 'scope',
      header: supportAccessMessages.reveals.columns.scope,
      width: 'w-52',
      cell: (row) => <span className="text-[12px]">{SCOPE_LABELS_TR[row.scope]}</span>,
    },
    {
      key: 'entity_type',
      header: supportAccessMessages.reveals.columns.entityType,
      width: 'w-40',
      cell: (row) => (row.entity_type === null ? null : <Mono>{row.entity_type}</Mono>),
    },
    {
      key: 'entity_id',
      header: supportAccessMessages.reveals.columns.entityId,
      width: 'w-32',
      cell: (row) =>
        row.entity_id === null ? (
          // No id means the whole scope was read rather than one record — a
          // subject-line listing, say. Saying so is more honest than an em dash.
          <span className="text-[11px] text-faint">{supportAccessMessages.reveals.wholeScope}</span>
        ) : (
          <Mono>{shortId(row.entity_id)}</Mono>
        ),
    },
    {
      key: 'item_count',
      header: supportAccessMessages.reveals.columns.itemCount,
      align: 'right',
      width: 'w-20',
      cell: (row) => <Num>{row.item_count}</Num>,
    },
    {
      key: 'admin',
      header: supportAccessMessages.reveals.columns.admin,
      secondary: true,
      cell: (row) => <span className="text-[12px]">{row.admin_email_redacted}</span>,
    },
    {
      key: 'request_id',
      header: supportAccessMessages.reveals.columns.requestId,
      secondary: true,
      defaultHidden: true,
      cell: (row) => (row.request_id === null ? null : <Mono>{shortId(row.request_id)}</Mono>),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.reveal_id}
      caption={supportAccessMessages.detail.revealsCaption}
      error={error}
      emptyMessage={supportAccessMessages.detail.revealsEmpty}
      location={location}
      pagination={{
        page,
        pageSize: REVEALS_PAGE_SIZE,
        total,
        pageParam: REVEAL_PAGE_PARAM,
      }}
    />
  )
}
