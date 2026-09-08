import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Mono,
  type Column,
  type TableLocation,
} from '@/components/ui'
import { formatDateTime, shortId } from '@/lib/format'
import { revokeInviteAction } from '@/lib/actions/admins'
import { adminMessages } from '@/lib/messages/admins'
import type { NamedAdmin, PendingInvite } from '@/lib/queries/admins'
import { INVITES_PAGE_SIZE, INVITE_PAGE_PARAM, INVITE_REVOKE_FIELDS } from './contract'
import { adminRoleTone } from './presentation'

/**
 * Invites that have not been used yet.
 *
 * ---------------------------------------------------------------------------
 * THE TOKEN IS NOT HERE, AND CANNOT BE
 * ---------------------------------------------------------------------------
 *
 * `admin_invites.token_hash` is on `@/lib/db`'s unreadable-column list: a query
 * naming it throws, and a `select *` on this table is refused outright so the
 * omission has to be written down. There is no "resend" and no "copy link" on
 * this table, because there is nothing to copy — the plaintext token existed
 * once, in the response to the form that created it, and the database holds
 * only its SHA-256.
 *
 * So the two honest controls are the ones rendered: see that an invite is open,
 * and revoke it. Replacing an invite means revoking this one and issuing a new
 * token, which is what the empty "resend" button would have quietly done anyway
 * — except that this way the operator knows the old link stopped working.
 *
 * An expired invite is still listed. It is a row somebody may want to revoke or
 * replace, and hiding it would leave the roster's "bekleyen davet" count
 * explaining a number nothing on screen accounts for.
 */
export function InviteTable({
  rows,
  total,
  page,
  inviters,
  location,
  canInvite,
  csrf,
  nowIso,
  error,
}: {
  rows: readonly PendingInvite[]
  total: number
  page: number
  inviters: ReadonlyMap<string, NamedAdmin>
  location: TableLocation
  /** Decides whether the revoke control is drawn. It is not the check. */
  canInvite: boolean
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  /** The request's instant, from the injected clock. */
  nowIso: string
  error: string | null
}) {
  const columns: readonly Column<PendingInvite>[] = [
    {
      key: 'email',
      header: adminMessages.invites.columnEmail,
      hideable: false,
      cell: (row) => <span className="font-medium text-ink">{row.email}</span>,
    },
    {
      key: 'role',
      header: adminMessages.invites.columnRole,
      width: 'w-40',
      cell: (row) => <Badge tone={adminRoleTone(row.role)}>{row.role}</Badge>,
    },
    {
      key: 'invitedBy',
      header: adminMessages.invites.columnInvitedBy,
      secondary: true,
      cell: (row) => {
        const inviter = inviters.get(row.invited_by)
        if (inviter === undefined) return <Mono>{shortId(row.invited_by)}</Mono>
        return inviter.name ?? inviter.emailRedacted ?? adminMessages.facts.unknownAdmin
      },
    },
    {
      key: 'created',
      header: adminMessages.invites.columnCreated,
      secondary: true,
      cell: (row) => formatDateTime(row.created_at),
    },
    {
      key: 'expires',
      header: adminMessages.invites.columnExpires,
      cell: (row) =>
        row.expires_at <= nowIso ? (
          <Badge tone="warning">{adminMessages.invites.expired}</Badge>
        ) : (
          <span className="text-muted">{formatDateTime(row.expires_at)}</span>
        ),
    },
    {
      key: 'action',
      header: adminMessages.invites.columnAction,
      align: 'right',
      width: 'w-28',
      hideable: false,
      cell: (row) =>
        canInvite ? (
          <ConfirmDialog
            trigger={
              <Button variant="secondary" size="sm">
                {adminMessages.invites.revoke}
              </Button>
            }
            title={adminMessages.invites.revokeTitle}
            description={adminMessages.invites.revokeBody}
            confirmLabel={adminMessages.invites.revokeConfirm}
            action={revokeInviteAction}
            hiddenFields={{
              [csrf.name]: csrf.value,
              [INVITE_REVOKE_FIELDS.inviteId]: row.id,
            }}
            reason={{
              label: adminMessages.invites.revokeReasonLabel,
              placeholder: adminMessages.invites.revokeReasonPlaceholder,
              minLength: MIN_REASON_LENGTH,
              maxLength: MAX_REASON_LENGTH,
            }}
            destructive
          >
            <div className="rounded-md border border-hairline px-3 py-2">
              <p className="text-[12px] text-ink">{row.email}</p>
              <p className="mt-0.5 text-[11px] text-faint">
                {row.role} · {formatDateTime(row.expires_at)}
              </p>
            </div>
          </ConfirmDialog>
        ) : null,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      caption={adminMessages.invites.section}
      error={error}
      emptyMessage={adminMessages.invites.empty}
      location={location}
      pagination={{
        page,
        pageSize: INVITES_PAGE_SIZE,
        total,
        pageParam: INVITE_PAGE_PARAM,
      }}
      rowTone={(row) => (row.expires_at <= nowIso ? 'warning' : 'default')}
    />
  )
}
