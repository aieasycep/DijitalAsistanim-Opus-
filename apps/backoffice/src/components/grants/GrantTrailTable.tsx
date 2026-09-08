import { Badge, DataTable, type Column } from '@/components/ui'
import type { BoAuditRow } from '@/lib/db'
import { formatDateTime } from '@/lib/format'
import { grantMessages } from '@/lib/messages/grants'
import type { GrantAdmin } from '@/lib/queries/grants'
import { adminLabel } from './presentation'

/**
 * Everything the audit log holds about one grant.
 *
 * Refused attempts are here too, and that is the point: `runAdminAction` writes
 * a `failure` row when a permission check or a database constraint refuses the
 * operation, so an operator reaching for a free month they may not give leaves
 * a mark on the grant they aimed it at. A trail that recorded only what
 * succeeded would answer the easy question and none of the hard ones.
 *
 * `admin_reason` is a real column on `audit_logs` rather than a metadata key,
 * placed there by 0019 precisely so the 400-day metadata sweep cannot erase the
 * justification while leaving the row.
 */
export function GrantTrailTable({
  rows,
  admins,
  error,
}: {
  rows: readonly BoAuditRow[]
  admins: ReadonlyMap<string, GrantAdmin>
  error: string | null
}) {
  const columns: readonly Column<BoAuditRow>[] = [
    {
      key: 'when',
      header: grantMessages.trail.columnWhen,
      width: 'w-40',
      hideable: false,
      cell: (row) => (
        <span className="text-[12px] whitespace-nowrap">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: 'who',
      header: grantMessages.trail.columnWho,
      width: 'w-44',
      cell: (row) => (
        <span className="text-[12px] text-ink">
          {row.actor_admin_user_id === null
            ? grantMessages.period.unknownAdmin
            : adminLabel(admins.get(row.actor_admin_user_id), grantMessages.period.unknownAdmin)}
        </span>
      ),
    },
    {
      key: 'action',
      header: grantMessages.trail.columnAction,
      width: 'w-52',
      cell: (row) => (
        <span className="text-[12px] text-muted">
          {row.action === null ? '—' : (grantMessages.trail.actionLabels[row.action] ?? row.action)}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: grantMessages.trail.columnOutcome,
      width: 'w-28',
      cell: (row) =>
        row.outcome === 'failure' ? (
          <Badge tone="critical">{grantMessages.trail.outcomeFailure}</Badge>
        ) : (
          <Badge tone="success">{grantMessages.trail.outcomeSuccess}</Badge>
        ),
    },
    {
      key: 'reason',
      header: grantMessages.trail.columnReason,
      cell: (row) => (
        <span className="line-clamp-2 max-w-md text-[12px] text-muted">
          {row.admin_reason ?? row.staff_reason}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.audit_id}
      caption={grantMessages.trail.tableCaption}
      error={error}
      emptyMessage={grantMessages.trail.empty}
      total={rows.length}
    />
  )
}
