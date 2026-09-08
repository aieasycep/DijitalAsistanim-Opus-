import { Badge, DataTable, type Column } from '@/components/ui'
import type { BoAuditRow } from '@/lib/db'
import { formatDateTime, shortId } from '@/lib/format'
import { adminMessages } from '@/lib/messages/admins'
import { REENABLED_DETAIL_KEY, type NamedAdmin } from '@/lib/queries/admins'

/**
 * Everything the audit log holds about one admin account.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ACTION NAME IS NOT RENDERED RAW
 * ---------------------------------------------------------------------------
 *
 * `AdminAuditAction` is the closed union of the 26 names 0019 seeded, and the
 * enable/disable axis has exactly one member: `admin.disabled`. A reopen is
 * therefore written under that action with `admin_reenabled` in its detail —
 * see the note in `@/lib/actions/admins`, which explains why inventing a
 * 27th name in application code would be worse.
 *
 * `bo_audit.metadata_keys` is the sorted list of keys in the row's metadata, so
 * the marker survives into the view even though the values do not. This table
 * reads it and labels the row for what it actually was, rather than telling an
 * operator that an account was closed when it was reopened.
 *
 * ---------------------------------------------------------------------------
 * REFUSALS ARE ROWS TOO
 * ---------------------------------------------------------------------------
 *
 * `runAdminAction` writes a `failure` row when a permission check or a database
 * rule refuses an operation — including the last-super-admin trigger. An
 * operator repeatedly reaching for something they may not do is exactly what an
 * audit trail is for, so those rows are rendered here with the same weight as
 * the successes, marked by their outcome.
 */

const ACTION_LABELS: Readonly<Record<string, string>> = {
  'admin.role_changed': adminMessages.trailActions.roleChanged,
  'admin.disabled': adminMessages.trailActions.disabled,
  'admin.sessions_revoked': adminMessages.trailActions.sessionsRevoked,
  'admin.invited': adminMessages.trailActions.invited,
  'admin.invite_revoked': adminMessages.trailActions.inviteRevoked,
}

function labelFor(row: BoAuditRow): string {
  if (row.action === 'admin.disabled' && (row.metadata_keys ?? []).includes(REENABLED_DETAIL_KEY)) {
    return adminMessages.trailActions.reenabled
  }
  return (row.action === null ? undefined : ACTION_LABELS[row.action]) ?? row.action ?? '—'
}

export function TrailTable({
  rows,
  actors,
  error,
}: {
  rows: readonly BoAuditRow[]
  /** Display names for `actor_admin_user_id`, loaded in one query. */
  actors: ReadonlyMap<string, NamedAdmin>
  error: string | null
}) {
  const columns: readonly Column<BoAuditRow>[] = [
    {
      key: 'when',
      header: adminMessages.trailColumns.when,
      width: 'w-44',
      hideable: false,
      cell: (row) => formatDateTime(row.created_at),
    },
    {
      key: 'action',
      header: adminMessages.trailColumns.action,
      cell: (row) => <span className="font-medium text-ink">{labelFor(row)}</span>,
    },
    {
      key: 'actor',
      header: adminMessages.trailColumns.actor,
      cell: (row) => {
        if (row.actor_admin_user_id === null) {
          return <span className="text-faint">{adminMessages.facts.unknownAdmin}</span>
        }
        const actor = actors.get(row.actor_admin_user_id)
        if (actor === undefined) {
          return <span className="font-mono text-[11px]">{shortId(row.actor_admin_user_id)}</span>
        }
        return actor.name ?? actor.emailRedacted ?? adminMessages.facts.unknownAdmin
      },
    },
    {
      key: 'outcome',
      header: adminMessages.trailColumns.outcome,
      width: 'w-28',
      cell: (row) =>
        row.outcome === 'failure' ? (
          <Badge tone="critical">{adminMessages.trailOutcome.failure}</Badge>
        ) : row.outcome === 'success' ? (
          <Badge tone="success">{adminMessages.trailOutcome.success}</Badge>
        ) : (
          <Badge tone="neutral">{adminMessages.trailOutcome.unknown}</Badge>
        ),
    },
    {
      key: 'reason',
      header: adminMessages.trailColumns.reason,
      secondary: true,
      cell: (row) => (
        <span className="line-clamp-2 max-w-md text-[12px] text-muted">
          {row.admin_reason ?? row.staff_reason ?? ''}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.audit_id}
      caption={adminMessages.detail.trailSection}
      error={error}
      emptyMessage={adminMessages.detail.trailEmpty}
      total={rows.length}
      rowTone={(row) => (row.outcome === 'failure' ? 'critical' : 'default')}
    />
  )
}
