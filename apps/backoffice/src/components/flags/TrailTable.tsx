import type { Clock } from '@da/domain'
import { Badge, DataTable, Mono, type Column } from '@/components/ui'
import type { BoAuditRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { flagMessages } from '@/lib/messages/flags'
import type { FlagAdmin } from '@/lib/queries/flags'
import { adminLabel } from './presentation'

/**
 * Everything the audit log holds about this flag.
 *
 * All six operations in this module write their row against
 * `entity_type = 'feature_flag'` and the flag's own id, so this is one indexed
 * query rather than a union of three — and the two override actions appear here
 * as well as on the affected user's own history, because they name the user in
 * `subject_user_id`.
 *
 * Refused attempts are in here too. `runAdminAction` writes a `failure` row
 * when a permission check or a constraint refuses an operation, which is what
 * makes "who tried to pull this kill switch and was told no" a question with an
 * answer.
 *
 * `admin_reason` is the operator's own sentence, promoted to a real column by
 * 0019 precisely so the 400-day metadata sweep cannot erase it.
 */
export function TrailTable({
  rows,
  admins,
  clock,
  error,
}: {
  rows: readonly BoAuditRow[]
  admins: ReadonlyMap<string, FlagAdmin>
  clock: Clock
  error: string | null
}) {
  const columns: readonly Column<BoAuditRow>[] = [
    {
      key: 'when',
      header: flagMessages.trail.columnWhen,
      width: 'w-40',
      hideable: false,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="text-[12px] whitespace-nowrap text-ink">
            {formatDateTime(row.created_at)}
          </span>
          <span className="text-[11px] text-faint">{formatRelative(row.created_at, clock)}</span>
        </span>
      ),
    },
    {
      key: 'who',
      header: flagMessages.trail.columnWho,
      width: 'w-44',
      cell: (row) => {
        const admin =
          row.actor_admin_user_id === null ? undefined : admins.get(row.actor_admin_user_id)
        return (
          <span className="flex flex-col">
            <span className="text-[12px] text-ink">{adminLabel(admin)}</span>
            {admin === undefined ? (
              row.actor_admin_user_id === null ? null : (
                <Mono>{row.actor_admin_user_id.slice(0, 8)}</Mono>
              )
            ) : (
              <span className="text-[11px] text-faint">{admin.roleLabel}</span>
            )}
          </span>
        )
      },
    },
    {
      key: 'action',
      header: flagMessages.trail.columnAction,
      width: 'w-52',
      cell: (row) => {
        const action = row.action ?? ''
        // An action this screen has no Turkish name for is shown verbatim
        // rather than blank: an unlabelled entry is still evidence.
        return (
          <span className="text-[12px] text-ink">
            {flagMessages.trail.actionLabels[action] ?? action}
          </span>
        )
      },
    },
    {
      key: 'outcome',
      header: flagMessages.trail.columnOutcome,
      width: 'w-28',
      cell: (row) =>
        row.outcome === 'failure' ? (
          <Badge tone="critical">{flagMessages.trail.outcomeFailure}</Badge>
        ) : (
          <Badge tone="neutral">{flagMessages.trail.outcomeSuccess}</Badge>
        ),
    },
    {
      key: 'reason',
      header: flagMessages.trail.columnReason,
      cell: (row) => (
        <span className="line-clamp-2 text-[12px] text-muted">
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
      caption={flagMessages.trail.tableCaption}
      error={error}
      emptyMessage={flagMessages.trail.empty}
      total={rows.length}
      rowTone={(row) => (row.outcome === 'failure' ? 'critical' : 'default')}
    />
  )
}
