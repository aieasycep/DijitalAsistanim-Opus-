import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Clock } from '@da/domain'
import { Badge, DataTable, Mono, Num, type Column, type TableLocation } from '@/components/ui'
import type { BoEntitlementGrantRow } from '@/lib/db'
import { formatDateTime, formatRelative, shortId } from '@/lib/format'
import {
  grantMessages,
  grantEffectLabels,
  grantKindLabels,
  grantStatusLabels,
} from '@/lib/messages/grants'
import type { GrantAdmin, GrantPicture } from '@/lib/queries/grants'
import { grantEffect } from '@/lib/queries/grants'
import { GRANTS_PAGE_SIZE, grantPath, userPath, type GrantSort } from './contract'
import { adminLabel, grantEffectTone, grantStatusOf, grantStatusTone } from './presentation'

/**
 * Every operator-issued Pro grant, with what it is actually doing on the row.
 *
 * ---------------------------------------------------------------------------
 * WHY "ÜRÜN NE DİYOR?" IS A COLUMN
 * ---------------------------------------------------------------------------
 *
 * A grant is a record of a decision, not a switch. Three things can make an
 * account Pro and `resolveEntitlements()` ranks two of them; this column
 * reports which one the product is actually applying to the account named on
 * the row, so a live grant sitting on top of a paid subscription reads as
 * "Mağaza ile çakışıyor" rather than as a second, invisible copy of the same
 * entitlement. That single comparison is the difference between a list of rows
 * and a budget somebody can control.
 *
 * The comparison is computed server-side for the whole page in one query — see
 * `loadGrantPictures` — and never per row, so twenty-five rows cost one request
 * rather than twenty-five.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ON THE ROW AND WHAT IS NOT
 * ---------------------------------------------------------------------------
 *
 * The account is a redacted address from `bo_redact_email()` and, for a role
 * that may see individuals, a link to its user record. An analyst — whose
 * redaction level is `aggregate` — gets neither: the column says so instead of
 * rendering a blank cell. Nothing else about the account appears here at all.
 *
 * Paging and sorting are server-side: `queryViewPage` returns the exact total
 * beside a bounded page and the sort is an `order by` in Postgres, so the
 * browser is never handed the grant table to slice.
 */
export function GrantTable({
  rows,
  total,
  page,
  sort,
  admins,
  pictures,
  pictureError,
  revocationReasons,
  canSeeAccounts,
  location,
  hiddenColumns,
  clock,
  error,
  emptyMessage,
  emptyAction,
  filtered,
}: {
  rows: readonly BoEntitlementGrantRow[]
  /** Exact count from Postgres, never `rows.length`. */
  total: number
  page: number
  sort: GrantSort
  /** `granted_by` resolved to a staff member, keyed by admin id. */
  admins: ReadonlyMap<string, GrantAdmin>
  /** What the product's resolver says for each account on this page. */
  pictures: ReadonlyMap<string, GrantPicture>
  /** Set when the source lookup failed: the column says so rather than lying. */
  pictureError: boolean
  /** `revoked_reason` per grant id, for the rows that carry one. */
  revocationReasons: ReadonlyMap<string, string | null>
  /** False for a role whose redaction level is `aggregate`. */
  canSeeAccounts: boolean
  location: TableLocation
  /** From `parseColumnVisibility()`: null means the operator has not chosen. */
  hiddenColumns: readonly string[] | null
  clock: Clock
  error: string | null
  emptyMessage: string
  emptyAction?: ReactNode
  filtered: boolean
}) {
  const columns: readonly Column<BoEntitlementGrantRow>[] = [
    {
      key: 'user',
      header: grantMessages.columns.user,
      hideable: false,
      cell: (row) => {
        if (!canSeeAccounts) {
          return <span className="text-[11px] text-faint">{grantMessages.columns.userHidden}</span>
        }
        return (
          <Link href={userPath(row.user_id)} className="flex flex-col gap-0.5 hover:underline">
            <span className="text-[12px] text-ink">{row.user_email_redacted}</span>
            <Mono>{shortId(row.user_id)}</Mono>
          </Link>
        )
      },
    },
    {
      key: 'kind',
      header: grantMessages.columns.kind,
      width: 'w-32',
      cell: (row) => <Badge tone="neutral">{grantKindLabels[row.kind]}</Badge>,
    },
    {
      key: 'status',
      header: grantMessages.columns.status,
      width: 'w-28',
      hideable: false,
      cell: (row) => {
        const status = grantStatusOf(row)
        return <Badge tone={grantStatusTone(status)}>{grantStatusLabels[status]}</Badge>
      },
    },
    {
      key: 'effect',
      header: grantMessages.columns.effect,
      title: grantMessages.truth.description,
      width: 'w-40',
      cell: (row) => {
        if (pictureError) {
          return <span className="text-[11px] text-faint">{grantMessages.truth.unavailable}</span>
        }
        const effect = grantEffect(row, pictures.get(row.user_id) ?? null)
        return <Badge tone={grantEffectTone(effect)}>{grantEffectLabels[effect]}</Badge>
      },
    },
    {
      key: 'days',
      header: grantMessages.columns.days,
      sortKey: 'days',
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>{grantMessages.columns.daysUnit(row.days)}</Num>,
    },
    {
      key: 'remaining',
      header: grantMessages.columns.remaining,
      sortKey: 'days_remaining',
      align: 'right',
      width: 'w-24',
      cell: (row) => (
        <Num>
          <span className={row.is_live ? 'font-semibold text-ink' : 'text-faint'}>
            {grantMessages.columns.remainingUnit(row.days_remaining)}
          </span>
        </Num>
      ),
    },
    {
      key: 'reason',
      header: grantMessages.columns.reason,
      cell: (row) => (
        <span className="line-clamp-2 max-w-md text-[12px] text-muted">{row.reason}</span>
      ),
    },
    {
      key: 'grantedBy',
      header: grantMessages.columns.grantedBy,
      width: 'w-40',
      secondary: true,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="text-[12px] text-ink">
            {adminLabel(
              admins.get(row.granted_by_admin_user_id),
              grantMessages.period.unknownAdmin,
            )}
          </span>
          <span className="text-[11px] whitespace-nowrap text-faint">
            {formatRelative(row.granted_at, clock)}
          </span>
        </span>
      ),
    },
    {
      key: 'grantedAt',
      header: grantMessages.columns.grantedAt,
      sortKey: 'granted_at',
      width: 'w-36',
      secondary: true,
      defaultHidden: true,
      cell: (row) => (
        <span className="text-[12px] whitespace-nowrap">{formatDateTime(row.granted_at)}</span>
      ),
    },
    {
      key: 'expires',
      header: grantMessages.columns.expires,
      sortKey: 'expires_at',
      width: 'w-36',
      secondary: true,
      cell: (row) => (
        <span className="text-[12px] whitespace-nowrap">{formatDateTime(row.expires_at)}</span>
      ),
    },
    {
      key: 'revoked',
      header: grantMessages.columns.revoked,
      width: 'w-48',
      secondary: true,
      cell: (row) =>
        row.revoked_at === null ? null : (
          <span className="flex flex-col">
            <span className="text-[12px] whitespace-nowrap">{formatDateTime(row.revoked_at)}</span>
            <span className="line-clamp-2 max-w-xs text-[11px] text-faint">
              {revocationReasons.get(row.grant_id) ?? grantMessages.columns.revokedReasonMissing}
            </span>
          </span>
        ),
    },
    {
      key: 'detail',
      header: grantMessages.columns.detail,
      align: 'right',
      width: 'w-20',
      hideable: false,
      cell: (row) => (
        <Link
          href={grantPath(row.grant_id)}
          className="text-[12px] font-medium text-primary-on-soft hover:underline"
        >
          {grantMessages.list.detailLink}
        </Link>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.grant_id}
      caption={grantMessages.list.tableCaption}
      error={error}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      filtered={filtered}
      location={location}
      sorting={{ current: sort }}
      columnVisibility={{ hidden: hiddenColumns }}
      pagination={{ page, pageSize: GRANTS_PAGE_SIZE, total }}
      // A live grant sitting on top of a paid subscription is the row somebody
      // has to look at: the account is being given something it is already
      // buying. Nothing else on this list is coloured.
      rowTone={(row) =>
        !pictureError && grantEffect(row, pictures.get(row.user_id) ?? null) === 'overlaps_store'
          ? 'warning'
          : 'default'
      }
    />
  )
}
