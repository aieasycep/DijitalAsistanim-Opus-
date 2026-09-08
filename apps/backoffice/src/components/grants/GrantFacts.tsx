import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Clock } from '@da/domain'
import { Badge } from '@/components/ui'
import type { BoEntitlementGrantRow } from '@/lib/db'
import { formatDateTime, formatRelative, shortId } from '@/lib/format'
import {
  grantKindHints,
  grantKindLabels,
  grantMessages,
  grantStatusLabels,
} from '@/lib/messages/grants'
import type { GrantAdmin } from '@/lib/queries/grants'
import { userPath } from './contract'
import { adminLabel, grantStatusOf, grantStatusTone } from './presentation'

/**
 * One grant, written out.
 *
 * A definition list rather than a table, because these are facts about a single
 * object rather than rows to compare. Every value is a column of
 * `bo_entitlement_grants`; nothing here is derived except the status pill,
 * which reads the view's own `is_live` and `revoked_at` through the same helper
 * the list uses, so the two screens cannot disagree about whether the grant is
 * in force.
 *
 * The account appears as its redacted address and a short id, and only for a
 * role that may see individuals. For an analyst the row says so, because a
 * blank cell would read as "no account".
 */
export function GrantFacts({
  row,
  grantedBy,
  revokedBy,
  revokedReason,
  canSeeAccounts,
  clock,
}: {
  row: BoEntitlementGrantRow
  grantedBy: GrantAdmin | undefined
  revokedBy: GrantAdmin | undefined
  /** `admin_entitlement_grants.revoked_reason`, which the view does not carry. */
  revokedReason: string | null
  canSeeAccounts: boolean
  clock: Clock
}) {
  const status = grantStatusOf(row)

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={grantMessages.detail.factUser}>
          {canSeeAccounts ? (
            <Link href={userPath(row.user_id)} className="flex flex-col gap-0.5 hover:underline">
              <span className="text-[13px] text-ink">{row.user_email_redacted ?? '—'}</span>
              <span className="font-mono text-[11px] text-faint">{shortId(row.user_id)}</span>
            </Link>
          ) : (
            <span className="text-[12px] text-faint">{grantMessages.detail.noUserLink}</span>
          )}
        </Fact>

        <Fact label={grantMessages.detail.factKind}>
          <span className="flex flex-col gap-1">
            <Badge tone="neutral">{grantKindLabels[row.kind]}</Badge>
            <span className="max-w-prose text-[11px] text-faint">{grantKindHints[row.kind]}</span>
          </span>
        </Fact>

        <Fact label={grantMessages.detail.factDays}>
          <span className="text-[13px] font-semibold text-ink tabular-nums">
            {grantMessages.columns.daysUnit(row.days)}
          </span>
        </Fact>

        <Fact label={grantMessages.detail.factGrantedAt}>
          <span className="flex flex-col">
            <span className="text-[13px] text-ink">{formatDateTime(row.granted_at)}</span>
            <span className="text-[11px] text-faint">{formatRelative(row.granted_at, clock)}</span>
          </span>
        </Fact>

        <Fact label={grantMessages.detail.factExpires}>
          <span className="flex flex-col">
            <span className="text-[13px] text-ink">{formatDateTime(row.expires_at)}</span>
            <span className="text-[11px] text-faint">{formatRelative(row.expires_at, clock)}</span>
          </span>
        </Fact>

        <Fact label={grantMessages.detail.factRemaining}>
          <span className="flex flex-col gap-1">
            <Badge tone={grantStatusTone(status)}>{grantStatusLabels[status]}</Badge>
            <span className="text-[11px] text-faint tabular-nums">
              {grantMessages.columns.remainingUnit(row.days_remaining)}
            </span>
          </span>
        </Fact>

        <Fact label={grantMessages.detail.factGrantedBy}>
          <span className="flex flex-col">
            <span className="text-[13px] text-ink">
              {adminLabel(grantedBy, grantMessages.period.unknownAdmin)}
            </span>
            {grantedBy === undefined ? null : (
              <span className="text-[11px] text-faint">{grantedBy.roleLabel}</span>
            )}
          </span>
        </Fact>

        <Fact label={grantMessages.detail.factTicket}>
          <span className="font-mono text-[12px] text-muted">
            {row.ticket_id === null ? '—' : shortId(row.ticket_id)}
          </span>
        </Fact>

        <Fact label={grantMessages.detail.factUpdated}>
          <span className="text-[13px] text-ink">{formatDateTime(row.updated_at)}</span>
        </Fact>

        {row.revoked_at === null ? null : (
          <>
            <Fact label={grantMessages.detail.factRevokedAt}>
              <span className="flex flex-col">
                <span className="text-[13px] text-ink">{formatDateTime(row.revoked_at)}</span>
                <span className="text-[11px] text-faint">
                  {formatRelative(row.revoked_at, clock)}
                </span>
              </span>
            </Fact>
            <Fact label={grantMessages.detail.factRevokedBy}>
              <span className="text-[13px] text-ink">
                {adminLabel(revokedBy, grantMessages.period.unknownAdmin)}
              </span>
            </Fact>
          </>
        )}
      </dl>

      <div>
        <h3 className="bo-kicker mb-1">{grantMessages.detail.reasonSection}</h3>
        <p className="max-w-prose rounded-md border border-hairline px-3 py-2 text-[13px] text-ink">
          {row.reason}
        </p>
        <p className="mt-1 max-w-prose text-[11px] text-faint">
          {grantMessages.detail.reasonDescription}
        </p>
      </div>

      {row.revoked_at === null ? null : (
        <div>
          <h3 className="bo-kicker mb-1">{grantMessages.detail.factRevokedReason}</h3>
          <p className="max-w-prose rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning-text">
            {revokedReason ?? grantMessages.columns.revokedReasonMissing}
          </p>
        </div>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="bo-kicker">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}
