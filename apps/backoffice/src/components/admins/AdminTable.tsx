import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, DataTable, Mono, Num, type Column, type TableLocation } from '@/components/ui'
import type { BoAdminUserRow } from '@/lib/db'
import { formatDateTime, formatNumber, shortId } from '@/lib/format'
import { adminMessages, adminStatusHints, adminStatusLabels } from '@/lib/messages/admins'
import { ROLE_LABELS_TR } from '@/lib/permissions'
import type { NamedAdmin } from '@/lib/queries/admins'
import { ADMINS_PAGE_SIZE, adminPath, type AdminSort } from './contract'
import { adminRoleTone, adminStatusTone, mfaTone } from './presentation'

/**
 * The roster.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT SHOWS, AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------
 *
 * A masked address, a name, a role, a status, whether a second factor is
 * enrolled, when they last signed in, how many live sessions they hold and how
 * much they have done in thirty days. Every one of those is a column of
 * `bo_admin_users` — none is computed here, and none of them is a guess.
 *
 * The address is masked exactly as a user's is. An admin is a person too, and
 * the roster is read by their colleagues; the one unredacted address this
 * console renders is the reader's own, in the top bar.
 *
 * MFA is the only place where a missing value is painted as a warning rather
 * than dashed out. `mfa_enrolled_at is null` means somebody with access to this
 * console can be signed in with a password alone, and a grey dash would let
 * that read as "not applicable".
 *
 * ---------------------------------------------------------------------------
 * PAGING AND SORTING ARE THE DATABASE'S
 * ---------------------------------------------------------------------------
 *
 * `total` is the exact count PostgREST returned for the current filters, not
 * `rows.length`, and every sort header rewrites the URL so the next page is
 * fetched already ordered. The browser is never handed the roster to slice.
 */
export function AdminTable({
  rows,
  total,
  page,
  sort,
  inviters,
  location,
  hiddenColumns,
  error,
  emptyMessage,
  emptyAction,
  filtered,
}: {
  rows: readonly BoAdminUserRow[]
  total: number
  page: number
  sort: AdminSort
  /** Display names for `invited_by_admin_user_id`, loaded in one query. */
  inviters: ReadonlyMap<string, NamedAdmin>
  location: TableLocation
  hiddenColumns: readonly string[] | null
  error: string | null
  emptyMessage: string
  emptyAction?: ReactNode
  filtered: boolean
}) {
  const columns: readonly Column<BoAdminUserRow>[] = [
    {
      key: 'admin',
      header: adminMessages.columns.admin,
      hideable: false,
      cell: (row) => (
        <Link
          href={adminPath(row.admin_user_id)}
          className="block min-w-0 font-medium text-primary-on-soft hover:text-primary hover:underline"
        >
          <span className="block truncate">{row.admin_name ?? row.email_redacted ?? '—'}</span>
          {row.admin_name === null ? null : (
            <span className="block truncate text-[11px] font-normal text-faint">
              {row.email_redacted ?? '—'}
            </span>
          )}
        </Link>
      ),
    },
    {
      key: 'role',
      header: adminMessages.columns.role,
      sortKey: 'role_rank',
      width: 'w-40',
      cell: (row) => (
        <Badge tone={adminRoleTone(row.role)} title={ROLE_LABELS_TR[row.role]}>
          {row.role_label}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: adminMessages.columns.status,
      width: 'w-28',
      cell: (row) => (
        <Badge tone={adminStatusTone(row.status)} dot title={adminStatusHints[row.status]}>
          {adminStatusLabels[row.status]}
        </Badge>
      ),
    },
    {
      key: 'mfa',
      header: adminMessages.columns.mfa,
      width: 'w-28',
      cell: (row) => (
        <Badge tone={mfaTone(row.is_mfa_enrolled)}>
          {row.is_mfa_enrolled ? adminMessages.facts.mfaEnrolled : adminMessages.facts.mfaMissing}
        </Badge>
      ),
    },
    {
      key: 'lastLogin',
      header: adminMessages.columns.lastLogin,
      sortKey: 'last_login_at',
      secondary: true,
      cell: (row) =>
        row.last_login_at === null ? (
          <span className="text-faint">{adminMessages.facts.never}</span>
        ) : (
          formatDateTime(row.last_login_at)
        ),
    },
    {
      key: 'sessions',
      header: adminMessages.columns.sessions,
      align: 'right',
      width: 'w-24',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.active_session_count)}</Num>,
    },
    {
      key: 'activity',
      header: adminMessages.columns.activity,
      sortKey: 'action_count_30d',
      align: 'right',
      width: 'w-28',
      secondary: true,
      title: adminMessages.facts.actions30d,
      cell: (row) => (
        <Num>
          {formatNumber(row.action_count_30d)}
          {row.sensitive_count_30d > 0 ? (
            <span className="ml-1 text-[11px] text-warning-text">
              ({formatNumber(row.sensitive_count_30d)})
            </span>
          ) : null}
        </Num>
      ),
    },
    {
      key: 'permissions',
      header: adminMessages.columns.permissions,
      align: 'right',
      width: 'w-20',
      defaultHidden: true,
      cell: (row) => <Num>{formatNumber(row.permission_count)}</Num>,
    },
    {
      key: 'invitedBy',
      header: adminMessages.columns.invitedBy,
      secondary: true,
      defaultHidden: true,
      cell: (row) => {
        if (row.invited_by_admin_user_id === null) {
          return <span className="text-faint">{adminMessages.facts.systemInvited}</span>
        }
        const inviter = inviters.get(row.invited_by_admin_user_id)
        if (inviter === undefined) {
          return <Mono>{shortId(row.invited_by_admin_user_id)}</Mono>
        }
        return inviter.name ?? inviter.emailRedacted ?? adminMessages.facts.unknownAdmin
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.admin_user_id}
      caption={adminMessages.list.title}
      error={error}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      filtered={filtered}
      location={location}
      sorting={{ current: { key: sort.key, direction: sort.direction } }}
      pagination={{ page, pageSize: ADMINS_PAGE_SIZE, total }}
      columnVisibility={{ hidden: hiddenColumns }}
      // A closed account is not an incident, so it is not painted red. An
      // active account with no second factor is the one row on this screen that
      // somebody has to do something about.
      rowTone={(row) => (row.is_active && !row.is_mfa_enrolled ? 'warning' : 'default')}
    />
  )
}
