import type { Clock } from '@da/domain'
import { Badge, DataTable, Mono, type Column } from '@/components/ui'
import type { BoAuditRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { ROLE_LABELS_TR } from '@/lib/permissions'
import { shortId } from '@/lib/redact'

/**
 * Everything that has been done to this grant, and why.
 *
 * `bo_support_access_grants` deliberately does not project `denied_reason` or
 * `revoked_reason` — the grant row is the permission, not the paperwork — so
 * the sentences come from `bo_audit`, where migration 0019 promoted
 * `admin_reason`, `actor_admin_user_id` and `support_access_grant_id` out of
 * `metadata` into real columns, out of reach of the 400-day sweep that used to
 * erase exactly the accountability the table exists for.
 *
 * Refused attempts are here too. `runAdminAction` writes a `failure` row when a
 * permission check denies an action or the work throws, so an admin repeatedly
 * reaching for an approval they may not make appears on the record it was
 * aimed at rather than nowhere.
 */
export function DecisionTrail({
  rows,
  clock,
  error,
}: {
  rows: readonly BoAuditRow[]
  clock: Clock
  error: string | null
}) {
  const columns: readonly Column<BoAuditRow>[] = [
    {
      key: 'created_at',
      header: supportAccessMessages.trail.columns.time,
      width: 'w-36',
      hideable: false,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="whitespace-nowrap text-[12px] text-ink">
            {formatDateTime(row.created_at)}
          </span>
          <span className="text-[11px] text-faint">{formatRelative(row.created_at, clock)}</span>
        </span>
      ),
    },
    {
      key: 'action',
      header: supportAccessMessages.trail.columns.action,
      width: 'w-48',
      cell: (row) =>
        row.action === null ? null : (
          // An action the dictionary does not know renders verbatim. Inventing
          // a label for a token nobody recognised would be worse than the token.
          <span className="text-[12px] text-ink">
            {supportAccessMessages.trail.actions[row.action] ?? row.action}
          </span>
        ),
    },
    {
      key: 'actor',
      header: supportAccessMessages.trail.columns.actor,
      width: 'w-40',
      cell: (row) =>
        row.actor_admin_user_id === null ? null : (
          <span className="flex flex-col">
            <Mono>{shortId(row.actor_admin_user_id)}</Mono>
            {row.admin_role === null ? null : (
              <span className="text-[11px] text-faint">{ROLE_LABELS_TR[row.admin_role]}</span>
            )}
          </span>
        ),
    },
    {
      key: 'outcome',
      header: supportAccessMessages.trail.columns.outcome,
      width: 'w-28',
      cell: (row) =>
        row.outcome === null ? null : (
          <Badge tone={row.outcome === 'failure' ? 'critical' : 'neutral'}>
            {supportAccessMessages.trail.outcomes[row.outcome] ?? row.outcome}
          </Badge>
        ),
    },
    {
      key: 'reason',
      header: supportAccessMessages.trail.columns.reason,
      hideable: false,
      cell: (row) => {
        const reason = row.admin_reason ?? row.staff_reason
        return reason === null ? null : <span className="text-[12px] text-muted">{reason}</span>
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.audit_id}
      caption={supportAccessMessages.detail.trailCaption}
      error={error}
      emptyMessage={supportAccessMessages.detail.trailEmpty}
      total={rows.length}
    />
  )
}
