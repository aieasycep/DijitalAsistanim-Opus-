import { Badge, DataTable, Num, type Column } from '@/components/ui'
import type { BoAdminSessionRow } from '@/lib/db'
import { formatDateTime, formatNumber } from '@/lib/format'
import { adminMessages } from '@/lib/messages/admins'
import { SESSIONS_LIMIT } from './contract'
import { sessionTone } from './presentation'

/**
 * One admin's console sessions.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------------------------------------------------------
 *
 * `admin_sessions` carries `token_hash`, `ip_hash` and `user_agent`. The first
 * is a credential — anyone holding it can mount an offline attack against the
 * token it came from — and the second is a fact about where a colleague was
 * sitting. `bo_admin_sessions` does not reference any of the three, so this
 * table could not show them if it wanted to, and `@/lib/db` refuses a read that
 * names the first two even from the base table.
 *
 * What is left is what a session list is actually for: how many are open, when
 * each was issued, when it was last used, and when it expires. That is enough
 * to spot one an admin does not recognise, which is the question this panel
 * exists to answer.
 *
 * ---------------------------------------------------------------------------
 * EXPIRY IS THE DATABASE'S OPINION, NOT THIS PAGE'S
 * ---------------------------------------------------------------------------
 *
 * `is_active`, `idle_minutes` and `minutes_remaining` are computed by the view
 * against `now()` in Postgres. Nothing here compares a timestamp to a clock:
 * the session's own validity is decided on every request by
 * `admin_touch_session()`, and a page that computed its own answer would
 * eventually disagree with the thing that actually lets somebody in.
 */
export function SessionTable({
  rows,
  total,
  error,
}: {
  rows: readonly BoAdminSessionRow[]
  /** Exact count from Postgres. The page below is capped at `SESSIONS_LIMIT`. */
  total: number
  error: string | null
}) {
  const columns: readonly Column<BoAdminSessionRow>[] = [
    {
      key: 'state',
      header: adminMessages.sessionColumns.state,
      hideable: false,
      width: 'w-32',
      cell: (row) => (
        <Badge tone={sessionTone(row.is_active, row.revoked_at !== null)} dot>
          {row.revoked_at !== null
            ? adminMessages.sessionState.revoked
            : row.is_active
              ? adminMessages.sessionState.active
              : adminMessages.sessionState.expired}
        </Badge>
      ),
    },
    {
      key: 'lastSeen',
      header: adminMessages.sessionColumns.lastSeen,
      cell: (row) => formatDateTime(row.last_seen_at),
    },
    {
      key: 'idle',
      header: adminMessages.sessionColumns.idle,
      align: 'right',
      width: 'w-24',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.idle_minutes)} dk</Num>,
    },
    {
      key: 'issued',
      header: adminMessages.sessionColumns.issued,
      secondary: true,
      cell: (row) => formatDateTime(row.issued_at),
    },
    {
      key: 'expires',
      header: adminMessages.sessionColumns.expires,
      cell: (row) => formatDateTime(row.expires_at),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.session_id}
      caption={adminMessages.detail.sessionsSection}
      error={error}
      emptyMessage={adminMessages.detail.sessionsEmpty}
      total={total}
      maxBodyHeight={rows.length > 8 ? '20rem' : undefined}
      // A revoked or expired row is history, not a problem. A live session is
      // the ordinary case. Nothing here is painted as an incident, because
      // whether a session is suspicious is a judgement this table cannot make.
      rowTone={() => 'default'}
      loadingRows={Math.min(rows.length || 4, SESSIONS_LIMIT)}
    />
  )
}
