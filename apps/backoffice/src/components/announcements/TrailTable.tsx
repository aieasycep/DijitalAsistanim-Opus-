import { Badge, DataTable, Mono, type Column } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { announcementMessages } from '@/lib/messages/announcements'
import type { BoAuditRow } from '@/lib/db'
import type { AnnouncementAdmin } from '@/lib/queries/announcements'
import { auditActionLabel } from './presentation'

/**
 * Everything ever done to this announcement.
 *
 * The reason column is the point of the table. `audit_logs.reason` is
 * staff-authored prose about a staff action, promoted to a real column by
 * migration 0019 precisely so the 400-day metadata sweep cannot erase it — so
 * "who decided this notice should go to every Pro user, and why" still has an
 * answer a year later. A row with no reason says so rather than rendering an
 * empty cell: the two non-sensitive actions here (creating and editing a draft)
 * genuinely have none, and a blank would read as a missing record.
 *
 * The actor is joined from `bo_admin_users`, where another admin's address is
 * already redacted. No unredacted address reaches this table.
 */

export interface TrailTableProps {
  rows: readonly BoAuditRow[]
  admins: ReadonlyMap<string, AnnouncementAdmin>
  error: string | null
}

export function TrailTable({ rows, admins, error }: TrailTableProps) {
  const columns: readonly Column<BoAuditRow>[] = [
    {
      key: 'when',
      header: announcementMessages.detail.trailWhen,
      width: 'w-40',
      hideable: false,
      cell: (row) => (
        <span className="tabular-nums text-[12px] text-muted">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: 'action',
      header: announcementMessages.detail.trailAction,
      width: 'w-56',
      hideable: false,
      cell: (row) => <span className="text-[13px] text-ink">{auditActionLabel(row.action)}</span>,
    },
    {
      key: 'actor',
      header: announcementMessages.detail.trailActor,
      width: 'w-52',
      cell: (row) => renderActor(row, admins),
    },
    {
      key: 'outcome',
      header: announcementMessages.detail.trailOutcome,
      width: 'w-28',
      cell: (row) =>
        row.outcome === 'failure' ? (
          <Badge tone="critical">{announcementMessages.detail.trailOutcomeFailure}</Badge>
        ) : (
          <Badge tone="success">{announcementMessages.detail.trailOutcomeSuccess}</Badge>
        ),
    },
    {
      key: 'reason',
      header: announcementMessages.detail.trailReason,
      cell: (row) =>
        row.admin_reason === null || row.admin_reason === '' ? (
          <span className="text-[12px] text-faint">
            {announcementMessages.detail.trailNoReason}
          </span>
        ) : (
          <span className="block max-w-prose text-[12px] text-ink">{row.admin_reason}</span>
        ),
    },
  ]

  return (
    <DataTable<BoAuditRow>
      columns={columns}
      rows={rows}
      rowKey={(row) => row.audit_id}
      caption={announcementMessages.detail.trailTitle}
      error={error}
      emptyMessage={announcementMessages.detail.trailEmpty}
      total={rows.length}
    />
  )
}

function renderActor(row: BoAuditRow, admins: ReadonlyMap<string, AnnouncementAdmin>) {
  const adminUserId = row.actor_admin_user_id
  if (adminUserId === null) {
    return (
      <span className="text-[12px] text-faint">{announcementMessages.values.unknownAdmin}</span>
    )
  }
  const admin = admins.get(adminUserId)
  if (admin === undefined) {
    return <Mono>{adminUserId.slice(0, 8)}</Mono>
  }
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[12px] text-ink">
        {admin.name ?? admin.emailRedacted ?? adminUserId.slice(0, 8)}
      </span>
      <span className="text-[11px] text-faint">{admin.roleLabel}</span>
    </span>
  )
}
