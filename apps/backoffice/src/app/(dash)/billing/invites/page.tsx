import { fixedClock, systemClock } from '@da/domain'
import type { Metadata } from 'next'
import {
  ActionResultBanner,
  BILLING_PAGE_SIZE,
  BILLING_REFERRALS_PATH,
  BillingTabs,
  CLUSTER_MIN_PARAM,
  CLUSTER_MIN_REDEMPTIONS,
  CLUSTER_WINDOW_DAYS,
  CLUSTER_WINDOW_PARAM,
  DEFAULT_CLUSTER_MIN,
  DEFAULT_CLUSTER_WINDOW,
  DEFAULT_FRAUD_TIER,
  DEFAULT_SERIES_GRANULARITY,
  FRAUD_TIERS,
  FRAUD_TIER_PARAM,
  PAGE_PARAM,
  Pagination,
  ReferralRiskTable,
  ReferralSeriesTable,
  RefreshForm,
  REVOKE_RESULT_PARAMS,
  RevokeOrdersTable,
  SERIES_BUCKET_COUNT,
  SERIES_PARAM,
  billingMessages,
  isClusterMin,
  isClusterWindow,
  isFraudTier,
  isRevokeOutcome,
  isSeriesGranularity,
  parsePage,
  type ClusterMinRedemptions,
  type ClusterWindowDays,
  type FraudTier,
  type RevokeOutcome,
  type SeriesGranularity,
} from '@/components/billing'
import { Card, Filters, PageHeader, StatGrid, StatTile, countTone } from '@/components/ui'
import { requireStaff } from '@/lib/auth'
import { formatNumber } from '@/lib/format'
import {
  REFERRAL_LIMIT,
  REFERRAL_NEAR_LIMIT,
  inspectReferral,
  listFraudReferrers,
  listRedemptionClusters,
  listRevokeOrders,
  loadReferralSeries,
  loadReferralTotals,
  settle,
  type ReferralInsight,
} from '@/lib/queries/billing'
import { revokeReferralCreditAction, refreshBillingAction } from '../actions'

/**
 * The referral programme: how much of it is running, and which parts of it look
 * like abuse.
 *
 * Five independent query groups. The two risk lists are the point of the page:
 * one ranks referrers against the ceiling `@da/domain` enforces, the other finds
 * bursts — codes that collected a lot of redemptions in the days right after
 * they were created. Both predicates are evaluated by Postgres; nothing is
 * filtered or counted here.
 *
 * The one staff action in the area hangs off every row of both lists, and its
 * trail is the last panel on the page, so an operator can see what has been
 * ordered and whether the revoked count has caught up.
 */

export const metadata: Metadata = { title: billingMessages.referrals.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

function parseSeries(raw: string | string[] | undefined): SeriesGranularity {
  const value = firstValue(raw)
  return value !== null && isSeriesGranularity(value) ? value : DEFAULT_SERIES_GRANULARITY
}

function parseTier(raw: string | string[] | undefined): FraudTier {
  const value = firstValue(raw)
  return value !== null && isFraudTier(value) ? value : DEFAULT_FRAUD_TIER
}

function parseWindow(raw: string | string[] | undefined): ClusterWindowDays {
  const parsed = Number.parseInt(firstValue(raw) ?? '', 10)
  return isClusterWindow(parsed) ? parsed : DEFAULT_CLUSTER_WINDOW
}

function parseMin(raw: string | string[] | undefined): ClusterMinRedemptions {
  const parsed = Number.parseInt(firstValue(raw) ?? '', 10)
  return isClusterMin(parsed) ? parsed : DEFAULT_CLUSTER_MIN
}

function parseOutcome(raw: string | string[] | undefined): RevokeOutcome | null {
  const value = firstValue(raw)
  return value !== null && isRevokeOutcome(value) ? value : null
}

const SERIES_LABEL: Readonly<Record<SeriesGranularity, string>> = {
  gun: billingMessages.referrals.seriesDay,
  hafta: billingMessages.referrals.seriesWeek,
  ay: billingMessages.referrals.seriesMonth,
}

export default async function BillingReferralsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireStaff('ops')
  const params = await searchParams

  const granularity = parseSeries(params[SERIES_PARAM])
  const tier = parseTier(params[FRAUD_TIER_PARAM])
  const windowDays = parseWindow(params[CLUSTER_WINDOW_PARAM])
  const minRedemptions = parseMin(params[CLUSTER_MIN_PARAM])
  const page = parsePage(firstValue(params[PAGE_PARAM]))

  const resultOutcome = parseOutcome(params[REVOKE_RESULT_PARAMS.outcome])
  const resultReferralId = firstValue(params[REVOKE_RESULT_PARAMS.referral])

  // One instant for the whole page: the burst window and the audit trail must
  // agree about when "now" was.
  const clock = fixedClock(systemClock.now())

  const values: Record<string, string> = {
    [SERIES_PARAM]: granularity,
    [FRAUD_TIER_PARAM]: tier,
    [CLUSTER_WINDOW_PARAM]: String(windowDays),
    [CLUSTER_MIN_PARAM]: String(minRedemptions),
    [PAGE_PARAM]: page > 1 ? String(page) : '',
  }

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== '') query.set(key, value)
  }
  const selfHref = `${BILLING_REFERRALS_PATH}?${query.toString()}`

  const [totals, series, fraud, clusters, orders] = await Promise.all([
    settle(() => loadReferralTotals()),
    settle(() => loadReferralSeries(granularity, SERIES_BUCKET_COUNT, clock)),
    settle(() => listFraudReferrers(tier, page)),
    settle(() => listRedemptionClusters(windowDays, minRedemptions, clock)),
    settle(() => listRevokeOrders()),
  ])

  const fraudRows: readonly ReferralInsight[] = fraud.ok
    ? fraud.value.rows.map((row) => inspectReferral(row, clock))
    : []
  const clusterRows: readonly ReferralInsight[] = clusters.ok
    ? clusters.value.rows.map((row) => inspectReferral(row, clock))
    : []

  const banner =
    resultOutcome === null
      ? null
      : {
          outcome: resultOutcome,
          message: resultMessage(resultOutcome, resultReferralId, [...fraudRows, ...clusterRows]),
        }

  const tierCopy = billingMessages.fraudTiers[tier]

  return (
    <>
      <PageHeader
        title={billingMessages.referrals.title}
        description={billingMessages.referrals.description}
        action={<RefreshForm action={refreshBillingAction} returnTo={selfHref} />}
      >
        <BillingTabs current={BILLING_REFERRALS_PATH} />
        <Filters
          controls={[
            {
              kind: 'segmented',
              param: SERIES_PARAM,
              label: billingMessages.referrals.seriesBucket,
              options: [
                { value: 'gun', label: SERIES_LABEL.gun },
                { value: 'hafta', label: SERIES_LABEL.hafta },
                { value: 'ay', label: SERIES_LABEL.ay },
              ],
            },
            {
              kind: 'segmented',
              param: FRAUD_TIER_PARAM,
              label: billingMessages.referrals.tierLabel,
              options: FRAUD_TIERS.map((value) => ({
                value,
                label: billingMessages.fraudTiers[value].label,
              })),
            },
            {
              kind: 'segmented',
              param: CLUSTER_WINDOW_PARAM,
              label: billingMessages.referrals.clusterWindowLabel,
              options: CLUSTER_WINDOW_DAYS.map((days) => ({
                value: String(days),
                label: billingMessages.referrals.clusterWindowOption(days),
              })),
            },
            {
              kind: 'segmented',
              param: CLUSTER_MIN_PARAM,
              label: billingMessages.referrals.clusterMinLabel,
              options: CLUSTER_MIN_REDEMPTIONS.map((count) => ({
                value: String(count),
                label: billingMessages.referrals.clusterMinOption(count),
              })),
            },
          ]}
          values={values}
        />
      </PageHeader>

      {banner ? (
        <ActionResultBanner
          outcome={banner.outcome}
          message={banner.message}
          referralId={resultReferralId}
          dismissHref={selfHref}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <StatGrid>
          <StatTile
            label={billingMessages.referrals.tileCodes}
            value={totals.ok ? formatNumber(totals.value.codes) : '—'}
            hint={
              totals.ok
                ? `${formatNumber(totals.value.redeemed)} ${billingMessages.referrals.tileRedeemed.toLocaleLowerCase('tr-TR')}`
                : undefined
            }
          />
          <StatTile
            label={billingMessages.referrals.tileNearLimit}
            value={totals.ok ? formatNumber(totals.value.nearLimit) : '—'}
            hint={billingMessages.referrals.nearHint(REFERRAL_NEAR_LIMIT)}
            tone={totals.ok && totals.value.nearLimit > 0 ? 'warning' : 'neutral'}
          />
          <StatTile
            label={billingMessages.referrals.tileOverLimit}
            value={totals.ok ? formatNumber(totals.value.overLimit) : '—'}
            hint={billingMessages.referrals.limitHint(REFERRAL_LIMIT)}
            tone={totals.ok ? countTone(totals.value.overLimit) : 'neutral'}
          />
          <StatTile
            label={billingMessages.referrals.tileCounterDrift}
            value={totals.ok ? formatNumber(totals.value.counterDrift) : '—'}
            hint={
              totals.ok
                ? `${formatNumber(totals.value.withRevoked)} ${billingMessages.referrals.tileRevoked.toLocaleLowerCase('tr-TR')}`
                : undefined
            }
            tone={totals.ok ? countTone(totals.value.counterDrift) : 'neutral'}
          />
        </StatGrid>

        <Card
          title={billingMessages.referrals.seriesTitle}
          description={billingMessages.referrals.seriesDescription}
          action={<span className="bo-kicker">{SERIES_LABEL[granularity]}</span>}
          flush
        >
          <ReferralSeriesTable
            rows={series.ok ? series.value : []}
            error={series.ok ? null : series.message}
          />
          <p className="border-t border-hairline px-3 py-2 text-[11px] text-faint">
            {billingMessages.referrals.seriesCaveat}
          </p>
        </Card>

        <Card title={billingMessages.referrals.fraudTitle} description={tierCopy.description} flush>
          <ReferralRiskTable
            rows={fraudRows}
            total={fraud.ok ? fraud.value.total : 0}
            error={fraud.ok ? null : fraud.message}
            emptyMessage={billingMessages.referrals.fraudEmpty}
            caption={billingMessages.referrals.fraudTitle}
            variant="fraud"
            action={revokeReferralCreditAction}
            returnTo={selfHref}
            resultReferralId={resultReferralId}
            resultOutcome={resultOutcome}
          />
          <div className="px-3 pb-2">
            <Pagination
              basePath={BILLING_REFERRALS_PATH}
              values={values}
              page={page}
              pageSize={BILLING_PAGE_SIZE}
              total={fraud.ok ? fraud.value.total : 0}
            />
          </div>
        </Card>

        <Card
          title={billingMessages.referrals.clusterTitle}
          description={billingMessages.referrals.clusterDescription}
          action={
            <span className="bo-kicker">
              {billingMessages.referrals.clusterWindowOption(windowDays)} ·{' '}
              {billingMessages.referrals.clusterMinOption(minRedemptions)}
            </span>
          }
          flush
        >
          <ReferralRiskTable
            rows={clusterRows}
            total={clusters.ok ? clusters.value.total : 0}
            error={clusters.ok ? null : clusters.message}
            emptyMessage={billingMessages.referrals.clusterEmpty}
            caption={billingMessages.referrals.clusterTitle}
            variant="cluster"
            action={revokeReferralCreditAction}
            returnTo={selfHref}
            resultReferralId={resultReferralId}
            resultOutcome={resultOutcome}
          />
        </Card>

        <Card
          title={billingMessages.referrals.ordersTitle}
          description={billingMessages.referrals.ordersDescription}
          flush
        >
          <RevokeOrdersTable
            rows={orders.ok ? orders.value : []}
            error={orders.ok ? null : orders.message}
          />
        </Card>

        <p className="px-1 text-[11px] text-faint">{billingMessages.area.aggregateNote}</p>
      </div>
    </>
  )
}

/**
 * The sentence the result banner shows.
 *
 * The code is looked up in the rows this page already fetched rather than
 * queried again — and when the row is not on screen (a filter moved, a page
 * turned) the message drops the code instead of guessing at one.
 */
function resultMessage(
  outcome: RevokeOutcome,
  referralId: string | null,
  rows: readonly ReferralInsight[],
): string {
  const code =
    referralId === null
      ? null
      : (rows.find((entry) => entry.row.referral_id === referralId)?.row.code ?? null)

  switch (outcome) {
    case 'success':
      return code === null
        ? billingMessages.revoke.resultSuccessPlain
        : billingMessages.revoke.resultSuccess(code)
    case 'noop':
      return code === null
        ? billingMessages.revoke.resultNoopPlain
        : billingMessages.revoke.resultNoop(code)
    case 'notfound':
      return billingMessages.revoke.resultNotFound
    case 'invalid':
      return billingMessages.revoke.resultInvalid
    case 'forbidden':
      return billingMessages.revoke.resultForbidden
    case 'failed':
      return billingMessages.revoke.resultFailed
    default:
      return billingMessages.revoke.resultInvalid
  }
}
