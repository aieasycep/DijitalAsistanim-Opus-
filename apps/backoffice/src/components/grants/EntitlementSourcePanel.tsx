import { Badge, DataTable, type Column } from '@/components/ui'
import type { BoEntitlementSourceRow } from '@/lib/db'
import { formatDateTime } from '@/lib/format'
import { enumLabels, labelFor } from '@/lib/messages'
import {
  entitlementSourceLabels,
  grantEffectHints,
  grantEffectLabels,
  grantKindLabels,
  grantMessages,
} from '@/lib/messages/grants'
import type { GrantPicture } from '@/lib/queries/grants'
import type { GrantEffect } from './contract'
import { entitlementSourceTone, grantEffectTone } from './presentation'

/**
 * The answer to "why is this account Pro right now", and the evidence for it.
 *
 * ---------------------------------------------------------------------------
 * THE CONSOLE DOES NOT DECIDE THIS
 * ---------------------------------------------------------------------------
 *
 * The verdict at the top is whatever `resolveEntitlements()` in @da/domain
 * returns for the account — the same function the mobile app calls, given the
 * same two inputs it is given there: the store subscription and the referral
 * bonus. Nothing here re-derives a plan from a status string, so this panel
 * cannot confidently contradict the phone in the caller's hand.
 *
 * ---------------------------------------------------------------------------
 * AND IT SAYS THE UNCOMFORTABLE PART OUT LOUD
 * ---------------------------------------------------------------------------
 *
 * `resolveEntitlements()` takes a subscription status, a store entitlement id
 * and a referral bonus expiry. It has no parameter for an operator grant. So a
 * grant recorded in `admin_entitlement_grants` is a decision, a cost and an
 * audit record — and it is not, by itself, what the resolver reads. A screen
 * that drew a green "Pro" next to a live grant would be inventing a fourth
 * branch of a function that has three, and an operator would find out it was
 * fiction the next time a user rang up asking why they still see the paywall.
 *
 * The note below is therefore not a caveat added for safety. It is the finding.
 */
export function EntitlementSourcePanel({
  picture,
  effect,
  /** The grant this panel was opened from, so its own row can be marked. */
  grantId,
  error,
}: {
  picture: GrantPicture | null
  effect: GrantEffect
  grantId: string
  error: string | null
}) {
  const columns: readonly Column<BoEntitlementSourceRow>[] = [
    {
      key: 'source',
      header: grantMessages.truth.columnSource,
      hideable: false,
      width: 'w-40',
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-ink">{sourceLabel(row.source)}</span>
          {row.source_id === grantId ? (
            <Badge tone="primary">{grantMessages.truth.thisGrant}</Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: grantMessages.truth.columnStatus,
      width: 'w-32',
      cell: (row) => (
        <span className="text-[12px] text-muted">
          {row.source === 'store'
            ? labelFor(enumLabels.subscriptionStatus, row.detail_status)
            : row.detail_status}
        </span>
      ),
    },
    {
      key: 'detail',
      header: grantMessages.truth.columnDetail,
      cell: (row) => <span className="text-[12px] text-muted">{detailLabel(row)}</span>,
    },
    {
      key: 'ends',
      header: grantMessages.truth.columnEnds,
      width: 'w-40',
      cell: (row) => (
        <span className="text-[12px] whitespace-nowrap">{formatDateTime(row.ends_at)}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      {error !== null ? (
        <p
          role="alert"
          className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
        >
          {error}
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="bo-kicker">{grantMessages.truth.currentLabel}</dt>
              <dd className="mt-1">
                {picture === null ? (
                  <span className="text-[13px] text-faint">{grantMessages.truth.unavailable}</span>
                ) : (
                  <Badge tone={entitlementSourceTone(picture.source)}>
                    {entitlementSourceLabels[picture.source]}
                  </Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="bo-kicker">{grantMessages.truth.planLabel}</dt>
              <dd className="mt-1 text-[13px] font-semibold text-ink">
                {picture === null
                  ? '—'
                  : picture.entitlements.plan === 'pro'
                    ? grantMessages.truth.planPro
                    : grantMessages.truth.planFree}
              </dd>
            </div>
            <div>
              <dt className="bo-kicker">{grantMessages.truth.expiresLabel}</dt>
              <dd className="mt-1 text-[13px] text-ink">
                {formatDateTime(picture?.entitlements.expiresAt)}
              </dd>
            </div>
          </dl>

          <div className="rounded-md border border-hairline px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={grantEffectTone(effect)}>{grantEffectLabels[effect]}</Badge>
            </div>
            <p className="mt-1.5 max-w-prose text-[12px] text-muted">{grantEffectHints[effect]}</p>
          </div>
        </>
      )}

      <div>
        <h3 className="bo-kicker mb-1">{grantMessages.truth.sourcesTitle}</h3>
        <p className="mb-2 max-w-prose text-[12px] text-muted">
          {grantMessages.truth.sourcesDescription}
        </p>
        <DataTable
          columns={columns}
          rows={picture?.sources ?? []}
          rowKey={(row, index) => `${row.source}-${row.source_id ?? 'store'}-${index}`}
          caption={grantMessages.truth.sourcesCaption}
          error={error}
          emptyMessage={grantMessages.truth.sourcesEmpty}
          total={picture?.sources.length ?? 0}
        />
      </div>

      <p className="max-w-prose rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
        {grantMessages.truth.resolverNote}
      </p>
    </div>
  )
}

function sourceLabel(source: BoEntitlementSourceRow['source']): string {
  switch (source) {
    case 'store':
      return grantMessages.truth.sourceStore
    case 'referral':
      return grantMessages.truth.sourceReferral
    case 'admin_grant':
      return grantMessages.truth.sourceAdminGrant
    default:
      return source
  }
}

/**
 * The one distinguishing fact per source: the store a purchase came from, the
 * kind an operator chose, the length of a bonus. Never a SKU or a price — the
 * store product is a billing detail the view deliberately does not project.
 */
function detailLabel(row: BoEntitlementSourceRow): string {
  if (row.source === 'store') return row.store ?? '—'
  if (row.source === 'admin_grant') {
    const kind = row.grant_kind === null ? '' : grantKindLabels[row.grant_kind]
    const days = row.days === null ? '' : grantMessages.columns.daysUnit(row.days)
    return [kind, days].filter((part) => part !== '').join(' · ') || '—'
  }
  return row.days === null ? '—' : grantMessages.columns.daysUnit(row.days)
}
