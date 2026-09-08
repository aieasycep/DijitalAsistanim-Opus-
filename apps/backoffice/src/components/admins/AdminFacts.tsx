import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, Mono } from '@/components/ui'
import type { BoAdminUserRow } from '@/lib/db'
import { formatDateTime, formatNumber, shortId } from '@/lib/format'
import { adminMessages, adminStatusHints, adminStatusLabels } from '@/lib/messages/admins'
import { ROLE_DESCRIPTIONS_TR } from '@/lib/permissions'
import type { AdminAccountFacts, NamedAdmin } from '@/lib/queries/admins'
import { adminPath } from './contract'
import { adminRoleTone, adminStatusTone, mfaTone } from './presentation'

/**
 * Everything `bo_admin_users` knows about one account, as a definition list.
 *
 * No value here is derived and none is optimistic. "Hiç" for a null last login
 * is a fact; a green tick for an unenrolled second factor would not be. The
 * disabled reason comes from `admin_users.disabled_reason`, which the schema
 * requires to be at least three characters — so a closed account always says
 * why it was closed, in the words of the person who closed it.
 *
 * The address is the masked one. `bo_redact_email()` produces it in the view,
 * and this component never receives another form of it.
 */

function Fact({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-hairline/70 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="bo-kicker w-full shrink-0 sm:w-44">{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink">
        {children}
        {hint === undefined ? null : <p className="mt-0.5 text-[11px] text-faint">{hint}</p>}
      </dd>
    </div>
  )
}

export function AdminFacts({
  admin,
  account,
  inviter,
  isSelf,
}: {
  admin: BoAdminUserRow
  /** `disabled_reason` and whether an auth account is bound. Null when unreadable. */
  account: AdminAccountFacts | null
  inviter: NamedAdmin | null
  isSelf: boolean
}) {
  return (
    <dl className="flex flex-col">
      <Fact label={adminMessages.facts.email}>
        <span className="font-mono">{admin.email_redacted ?? '—'}</span>
        {admin.email_domain === null ? null : (
          <span className="ml-2 text-[11px] text-faint">{admin.email_domain}</span>
        )}
      </Fact>

      <Fact label={adminMessages.facts.name}>{admin.admin_name ?? '—'}</Fact>

      <Fact label={adminMessages.facts.role} hint={ROLE_DESCRIPTIONS_TR[admin.role]}>
        <Badge tone={adminRoleTone(admin.role)}>{admin.role_label}</Badge>
      </Fact>

      <Fact label={adminMessages.facts.status} hint={adminStatusHints[admin.status]}>
        <Badge tone={adminStatusTone(admin.status)} dot>
          {adminStatusLabels[admin.status]}
        </Badge>
      </Fact>

      {admin.disabled_at === null ? null : (
        <Fact label={adminMessages.facts.disabledAt}>{formatDateTime(admin.disabled_at)}</Fact>
      )}

      {account?.disabledReason == null ? null : (
        <Fact label={adminMessages.detail.disabledReasonLabel}>
          <span className="text-muted">{account.disabledReason}</span>
        </Fact>
      )}

      <Fact
        label={adminMessages.facts.mfa}
        hint={
          admin.mfa_enrolled_at === null
            ? undefined
            : adminMessages.facts.mfaSince(formatDateTime(admin.mfa_enrolled_at))
        }
      >
        <Badge tone={mfaTone(admin.is_mfa_enrolled)}>
          {admin.is_mfa_enrolled ? adminMessages.facts.mfaEnrolled : adminMessages.facts.mfaMissing}
        </Badge>
      </Fact>

      <Fact label={adminMessages.facts.lastLogin}>
        {admin.last_login_at === null ? (
          <span className="text-faint">{adminMessages.facts.never}</span>
        ) : (
          formatDateTime(admin.last_login_at)
        )}
      </Fact>

      <Fact label={adminMessages.facts.invitedBy}>
        {admin.invited_by_admin_user_id === null ? (
          <span className="text-faint">{adminMessages.facts.systemInvited}</span>
        ) : inviter === null ? (
          <Mono>{shortId(admin.invited_by_admin_user_id)}</Mono>
        ) : (
          <Link
            href={adminPath(inviter.adminUserId)}
            className="text-primary-on-soft hover:underline"
          >
            {inviter.name ?? inviter.emailRedacted ?? adminMessages.facts.unknownAdmin}
          </Link>
        )}
      </Fact>

      <Fact label={adminMessages.facts.invitedAt}>{formatDateTime(admin.invited_at)}</Fact>

      <Fact label={adminMessages.facts.permissionCount}>
        {formatNumber(admin.permission_count)}
      </Fact>

      <Fact label={adminMessages.facts.activeSessions}>
        {formatNumber(admin.active_session_count)}
      </Fact>

      <Fact label={adminMessages.facts.actions30d}>
        {formatNumber(admin.action_count_30d)}
        <span className="ml-2 text-[11px] text-faint">
          {adminMessages.facts.sensitive30d}: {formatNumber(admin.sensitive_count_30d)}
        </span>
      </Fact>

      <Fact label={adminMessages.facts.lastAction}>
        {admin.last_action_at === null ? (
          <span className="text-faint">{adminMessages.facts.never}</span>
        ) : (
          formatDateTime(admin.last_action_at)
        )}
      </Fact>

      <Fact label={adminMessages.facts.supportAccess}>
        {formatNumber(admin.support_access_active_count)}
      </Fact>

      <Fact label={adminMessages.facts.authUserId}>
        {account === null ? (
          <span className="text-faint">{adminMessages.facts.authUnknown}</span>
        ) : account.hasAuthUser ? (
          <span className="text-muted">{adminMessages.facts.authBound}</span>
        ) : (
          <span className="text-warning-text">{adminMessages.detail.noAuthUser}</span>
        )}
      </Fact>

      <Fact label={adminMessages.facts.adminUserId}>
        <Mono>{admin.admin_user_id}</Mono>
        {isSelf ? (
          <p className="mt-0.5 text-[11px] text-faint">{adminMessages.detail.ownAccountNote}</p>
        ) : null}
      </Fact>
    </dl>
  )
}
