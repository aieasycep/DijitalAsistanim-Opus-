import Link from 'next/link'
import { Badge, DataTable, Mono, Num, type Column } from '@/components/ui'
import { formatDateTime, formatNumber, formatRelative, shortId } from '@/lib/format'
import { messages } from '@/lib/messages'
import {
  REFERRAL_LIMIT,
  type ReferralInsight,
  type ReferralSeriesPoint,
} from '@/lib/queries/billing'
import type { BoAuditRow } from '@/lib/db'
import type { RevokeOutcome } from './contract'
import { MeterBar } from './MeterBar'
import { billingMessages } from './messages'
import { RevokeCreditForm } from './RevokeCreditForm'

/**
 * The referral panels: the activity series, the two fraud lists, and the trail
 * of revocation orders this area has written.
 *
 * The referral code is the one user-supplied string on any of these screens,
 * and it is here deliberately: migration 0017's comment on `bo_referrals` calls
 * it a share token the user hands out on purpose. Everything else is a uuid, a
 * count or a timestamp.
 */

// ---------------------------------------------------------------------------
// Activity over time
// ---------------------------------------------------------------------------

export function ReferralSeriesTable({
  rows,
  error,
}: {
  rows: readonly ReferralSeriesPoint[]
  error: string | null
}) {
  const largest = rows.reduce((max, row) => Math.max(max, row.created, row.active), 0)

  const columns: readonly Column<ReferralSeriesPoint>[] = [
    {
      key: 'bucket',
      header: billingMessages.referrals.seriesBucket,
      cell: (row) => row.bucket.label,
    },
    {
      key: 'created',
      header: billingMessages.referrals.seriesCreated,
      align: 'right',
      width: 'w-48',
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-2">
          <MeterBar value={row.created} max={largest} tone="info" />
          <span className="w-10 tabular-nums">{formatNumber(row.created)}</span>
        </span>
      ),
    },
    {
      key: 'active',
      header: billingMessages.referrals.seriesActive,
      align: 'right',
      width: 'w-48',
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-2">
          <MeterBar value={row.active} max={largest} tone="success" />
          <span className="w-10 tabular-nums">{formatNumber(row.active)}</span>
        </span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.bucket.key}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={billingMessages.referrals.seriesEmpty}
      caption={billingMessages.referrals.seriesTitle}
    />
  )
}

// ---------------------------------------------------------------------------
// Referrers under review
// ---------------------------------------------------------------------------

const rateFormatter = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

export function ReferralRiskTable({
  rows,
  total,
  error,
  emptyMessage,
  caption,
  variant,
  action,
  returnTo,
  resultReferralId,
  resultOutcome,
}: {
  rows: readonly ReferralInsight[]
  total: number
  error: string | null
  emptyMessage: string
  caption: string
  /** `cluster` adds the burst-rate column; `fraud` shows the counter instead. */
  variant: 'fraud' | 'cluster'
  action: (formData: FormData) => void | Promise<void>
  returnTo: string
  resultReferralId: string | null
  resultOutcome: RevokeOutcome | null
}) {
  const columns: readonly Column<ReferralInsight>[] = [
    {
      key: 'referrer',
      header: billingMessages.referrals.columnReferrer,
      cell: (entry) => (
        <Link
          href={`/kullanicilar/${entry.row.user_id}`}
          className="flex flex-col hover:text-primary-on-soft"
        >
          <Mono>{shortId(entry.row.user_id)}</Mono>
          <span className="text-[11px] text-faint">{entry.row.email_redacted}</span>
        </Link>
      ),
    },
    {
      key: 'code',
      header: billingMessages.referrals.columnCode,
      cell: (entry) => <Mono>{entry.row.code}</Mono>,
    },
    {
      key: 'counter',
      header: billingMessages.referrals.columnRedemptions,
      title: billingMessages.referrals.columnRedemptionsTitle,
      align: 'right',
      cell: (entry) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          <Num>{formatNumber(entry.row.redemption_count)}</Num>
          {entry.atOrOverLimit ? (
            <Badge tone="critical">{`/ ${REFERRAL_LIMIT}`}</Badge>
          ) : (
            <span className="text-[11px] text-faint">{`/ ${REFERRAL_LIMIT}`}</span>
          )}
        </span>
      ),
    },
    {
      key: 'credits',
      header: billingMessages.referrals.columnCredits,
      title: billingMessages.referrals.columnCreditsTitle,
      align: 'right',
      secondary: true,
      cell: (entry) => <Num>{formatNumber(entry.creditedRedeemers)}</Num>,
    },
    {
      key: 'drift',
      header: billingMessages.referrals.columnImplied,
      title: billingMessages.referrals.columnImpliedTitle,
      align: 'right',
      cell: (entry) => {
        if (entry.counterDrift === 0) {
          return (
            <span className="text-[11px] text-faint">
              {billingMessages.referrals.driftBalanced}
            </span>
          )
        }
        // Positive means the ceiling is not being enforced for this referrer;
        // negative means somebody's bonus is missing. Different faults, so
        // different tones and different words.
        const ahead = entry.counterDrift > 0
        return (
          <Badge
            tone={ahead ? 'critical' : 'warning'}
            title={
              ahead ? billingMessages.referrals.driftAhead : billingMessages.referrals.driftMissing
            }
          >
            {billingMessages.referrals.driftValue(entry.counterDrift)}
          </Badge>
        )
      },
    },
    {
      key: 'active',
      header: billingMessages.referrals.columnActive,
      align: 'right',
      cell: (entry) => <Num>{formatNumber(entry.row.credit_active_count)}</Num>,
    },
    {
      key: 'revoked',
      header: billingMessages.referrals.columnRevoked,
      align: 'right',
      secondary: true,
      cell: (entry) =>
        entry.row.credit_revoked_count === 0 ? null : (
          <Badge tone="info">{formatNumber(entry.row.credit_revoked_count)}</Badge>
        ),
    },
    ...(variant === 'cluster'
      ? [
          {
            key: 'rate',
            header: billingMessages.referrals.columnRate,
            title: billingMessages.referrals.columnRateTitle,
            align: 'right' as const,
            cell: (entry: ReferralInsight) => (
              <span className="flex flex-col items-end">
                <span className="tabular-nums text-warning-text">
                  {billingMessages.referrals.perDay(rateFormatter.format(entry.redemptionsPerDay))}
                </span>
                <span className="text-[11px] text-faint">
                  {billingMessages.referrals.ageDays(entry.ageDays)}
                </span>
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'created',
      header: billingMessages.referrals.columnCreated,
      align: 'right',
      secondary: true,
      cell: (entry) => (
        <span title={formatDateTime(entry.row.created_at)}>
          {formatRelative(entry.row.created_at)}
        </span>
      ),
    },
    {
      key: 'last',
      header: billingMessages.referrals.columnLastCredit,
      align: 'right',
      cell: (entry) =>
        entry.row.last_credit_at === null ? null : (
          <span title={formatDateTime(entry.row.last_credit_at)}>
            {formatRelative(entry.row.last_credit_at)}
          </span>
        ),
    },
    {
      key: 'action',
      header: billingMessages.referrals.columnAction,
      align: 'right',
      cell: (entry) => (
        <RevokeCreditForm
          action={action}
          referralId={entry.row.referral_id}
          referrerUserId={entry.row.user_id}
          code={entry.row.code}
          activeCredits={entry.row.credit_active_count}
          returnTo={returnTo}
          outcome={resultReferralId === entry.row.referral_id ? resultOutcome : null}
        />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(entry) => entry.row.referral_id}
      total={total}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={emptyMessage}
      rowTone={(entry) =>
        entry.atOrOverLimit || entry.counterDrift !== 0 ? 'critical' : 'warning'
      }
      caption={caption}
    />
  )
}

// ---------------------------------------------------------------------------
// The trail this page writes
// ---------------------------------------------------------------------------

const OUTCOME_TONE: Record<string, 'success' | 'info' | 'warning' | 'critical'> = {
  success: 'success',
  noop: 'info',
  notfound: 'warning',
  invalid: 'warning',
  forbidden: 'critical',
  failed: 'critical',
}

/** `bo_audit.staff_role` arrives as free-form text, so it is looked up loosely. */
const ROLE_LABEL: Record<string, string> = {
  support: messages.roles.support,
  ops: messages.roles.ops,
  admin: messages.roles.admin,
}

export function RevokeOrdersTable({
  rows,
  error,
}: {
  rows: readonly BoAuditRow[]
  error: string | null
}) {
  const columns: readonly Column<BoAuditRow>[] = [
    {
      key: 'when',
      header: billingMessages.referrals.ordersWhen,
      width: 'w-28',
      cell: (row) => (
        <span title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</span>
      ),
    },
    {
      key: 'staff',
      header: billingMessages.referrals.ordersStaff,
      cell: (row) => (
        <div className="flex flex-col">
          <Mono>{shortId(row.staff_user_id)}</Mono>
          {row.staff_role ? (
            <span className="text-[11px] text-faint">
              {ROLE_LABEL[row.staff_role] ?? row.staff_role}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'referrer',
      header: billingMessages.referrals.ordersReferrer,
      cell: (row) =>
        row.subject_user_id === null ? null : (
          <Link
            href={`/kullanicilar/${row.subject_user_id}`}
            className="hover:text-primary-on-soft"
          >
            <Mono>{shortId(row.subject_user_id)}</Mono>
          </Link>
        ),
    },
    {
      key: 'referral',
      header: messages.fields.entity,
      secondary: true,
      cell: (row) => (row.entity_id ? <Mono>{shortId(row.entity_id)}</Mono> : null),
    },
    {
      key: 'reason',
      header: billingMessages.referrals.ordersReason,
      cell: (row) =>
        row.staff_reason ? <span className="text-muted">{row.staff_reason}</span> : null,
    },
    {
      key: 'outcome',
      header: billingMessages.referrals.ordersOutcome,
      align: 'right',
      cell: (row) =>
        row.outcome === null ? null : (
          <Badge tone={OUTCOME_TONE[row.outcome] ?? 'neutral'}>
            {billingMessages.outcomes[row.outcome] ?? row.outcome}
          </Badge>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.audit_id}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={billingMessages.referrals.ordersEmpty}
      caption={billingMessages.referrals.ordersTitle}
    />
  )
}
