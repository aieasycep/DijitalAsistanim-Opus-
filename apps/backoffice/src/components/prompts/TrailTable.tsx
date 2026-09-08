import type { Clock } from '@da/domain'
import { Badge, DataTable, type Column } from '@/components/ui'
import type { BoAuditRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { messages } from '@/lib/messages'
import { promptMessages } from '@/lib/messages/prompts'
import { adminLabel, type NamedAdmin } from './presentation'

/**
 * Everything ever done to this version, refusals included.
 *
 * All four operations write against `entity_type = 'prompt_version'` and the
 * version's own id, so this is one indexed read rather than a union. A row whose
 * `outcome` is not `success` is a refused attempt — a permission that was not
 * held, a constraint that said no — and it is shown as plainly as a successful
 * one, because an operator repeatedly reaching for an activation they may not
 * make is exactly what an audit trail is for.
 *
 * The reason column prints what an operator typed. It is staff-authored prose
 * about a staff action, stored in `audit_logs.reason` — its own column,
 * deliberately out of reach of the 400-day metadata sweep — and it is the only
 * free text on this screen.
 */
export function TrailTable({
  rows,
  admins,
  clock,
  error,
}: {
  rows: readonly BoAuditRow[]
  admins: ReadonlyMap<string, NamedAdmin>
  clock: Clock
  /** A message from `messages.errors`, never a raw exception string. */
  error: string | null
}) {
  const columns: readonly Column<BoAuditRow>[] = [
    {
      key: 'action',
      header: promptMessages.trail.action,
      hideable: false,
      cell: (row) => {
        const action = row.action ?? ''
        return promptMessages.trail.labels[action] ?? action
      },
    },
    {
      key: 'outcome',
      header: promptMessages.trail.outcome,
      width: 'w-28',
      cell: (row) =>
        row.outcome === 'success' ? (
          <Badge tone="neutral">{promptMessages.trail.outcomeSuccess}</Badge>
        ) : (
          <Badge tone="critical">{promptMessages.trail.outcomeFailure}</Badge>
        ),
    },
    {
      key: 'actor',
      header: promptMessages.trail.actor,
      cell: (row) => {
        const label = adminLabel(
          row.actor_admin_user_id === null ? undefined : admins.get(row.actor_admin_user_id),
        )
        return (
          <span>
            {label}
            {row.admin_role === null ? null : (
              <span className="ml-1.5 text-[11px] text-faint">{row.admin_role}</span>
            )}
          </span>
        )
      },
    },
    {
      key: 'reason',
      header: promptMessages.trail.reason,
      cell: (row) => {
        const reason = row.admin_reason ?? row.staff_reason
        return reason === null || reason === '' ? null : (
          <span className="block max-w-prose text-[12px] text-muted">{reason}</span>
        )
      },
    },
    {
      key: 'at',
      header: promptMessages.trail.at,
      width: 'w-36',
      cell: (row) => (
        <span title={formatDateTime(row.created_at)}>{formatRelative(row.created_at, clock)}</span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.audit_id}
      caption={promptMessages.trail.section}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={promptMessages.trail.empty}
      total={rows.length}
      rowTone={(row) => (row.outcome === 'success' ? 'default' : 'critical')}
    />
  )
}
