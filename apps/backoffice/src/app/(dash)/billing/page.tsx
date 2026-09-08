import type { Metadata } from 'next'
import Link from 'next/link'
import { NavShell } from '@/components/NavShell'
import {
  BILLING_PATH,
  BILLING_RECONCILIATION_PATH,
  BillingTabs,
  COHORT_BUCKET_COUNT,
  COHORT_PARAM,
  CohortTable,
  DEFAULT_COHORT_GRANULARITY,
  RULE_PARAM,
  RefreshForm,
  SubscriptionMixTable,
  TrialOutcomeTable,
  billingMessages,
  isCohortGranularity,
  type CohortGranularity,
} from '@/components/billing'
import {
  Card,
  CardError,
  Filters,
  PageHeader,
  StatGrid,
  StatTile,
  countTone,
} from '@/components/ui'
import { requireStaff } from '@/lib/auth'
import { formatNumber, formatPercent } from '@/lib/format'
import { messages } from '@/lib/messages'
import {
  loadCohorts,
  loadDriftSummary,
  loadSubscriptionMix,
  loadTrialFunnel,
  settle,
  type SubscriptionMix,
  type TrialFunnel,
} from '@/lib/queries/billing'
import { refreshBillingAction } from './actions'

/**
 * The billing landing page: what the subscription base looks like right now,
 * how trials ended, and how conversion moves by signup cohort.
 *
 * Four independent query groups, each settled on its own so a slow or missing
 * view costs its own panel and nothing else. Every figure on screen is a
 * `count(*)` Postgres ran — the only arithmetic here is over numbers it already
 * aggregated, and it is named where it happens.
 */

export const metadata: Metadata = { title: billingMessages.subscriptions.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

function parseCohort(raw: string | string[] | undefined): CohortGranularity {
  const value = firstValue(raw)
  return value !== null && isCohortGranularity(value) ? value : DEFAULT_COHORT_GRANULARITY
}

export default async function BillingSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await requireStaff('ops')
  const params = await searchParams
  const granularity = parseCohort(params[COHORT_PARAM])

  const query = new URLSearchParams()
  if (granularity !== DEFAULT_COHORT_GRANULARITY) query.set(COHORT_PARAM, granularity)
  const queryString = query.toString()
  const selfHref = queryString === '' ? BILLING_PATH : `${BILLING_PATH}?${queryString}`

  const [mix, funnel, cohorts, drift] = await Promise.all([
    settle(() => loadSubscriptionMix()),
    settle(() => loadTrialFunnel()),
    settle(() => loadCohorts(granularity, COHORT_BUCKET_COUNT)),
    settle(() => loadDriftSummary()),
  ])

  return (
    <NavShell session={session}>
      <PageHeader
        title={billingMessages.subscriptions.title}
        description={billingMessages.subscriptions.description}
        action={<RefreshForm action={refreshBillingAction} returnTo={selfHref} />}
      >
        <BillingTabs current={BILLING_PATH} />
        <Filters
          controls={[
            {
              kind: 'segmented',
              param: COHORT_PARAM,
              label: billingMessages.subscriptions.cohortLabel,
              options: [
                { value: 'ay', label: billingMessages.subscriptions.cohortMonth },
                { value: 'hafta', label: billingMessages.subscriptions.cohortWeek },
              ],
            },
          ]}
          values={{ [COHORT_PARAM]: granularity }}
          resetParams={[]}
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        {mix.ok ? (
          <MixCounters mix={mix.value} />
        ) : (
          <Card title={billingMessages.subscriptions.mixTitle}>
            <CardError message={mix.message} hint={messages.errors.queryFailedHint} />
          </Card>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title={billingMessages.subscriptions.mixTitle}
            description={billingMessages.subscriptions.mixDescription}
            flush
          >
            <SubscriptionMixTable
              rows={mix.ok ? mix.value.counts : []}
              total={mix.ok ? mix.value.total : 0}
              error={mix.ok ? null : mix.message}
            />
          </Card>

          <Card
            title={billingMessages.subscriptions.trialTitle}
            description={billingMessages.subscriptions.trialDescription}
            flush
          >
            <div className="border-b border-hairline p-3">
              <TrialCounters funnel={funnel.ok ? funnel.value : null} error={!funnel.ok} />
            </div>
            <TrialOutcomeTable
              funnel={funnel.ok ? funnel.value : null}
              error={funnel.ok ? null : funnel.message}
            />
          </Card>
        </div>

        <Card
          title={billingMessages.subscriptions.cohortTitle}
          description={billingMessages.subscriptions.cohortDescription}
          flush
        >
          <CohortTable
            rows={cohorts.ok ? cohorts.value : []}
            error={cohorts.ok ? null : cohorts.message}
          />
        </Card>

        <Card
          title={billingMessages.subscriptions.driftTitle}
          description={billingMessages.subscriptions.driftDescription}
          action={
            <Link
              href={BILLING_RECONCILIATION_PATH}
              className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:border-primary/40 hover:text-ink"
            >
              {billingMessages.subscriptions.driftLink}
            </Link>
          }
        >
          {drift.ok ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <StatTile
                label={billingMessages.subscriptions.driftPeriodLapsed}
                value={formatNumber(drift.value.periodLapsed)}
                tone={countTone(drift.value.periodLapsed)}
                hint={billingMessages.rules['donem-gecmis'].label}
                href={`${BILLING_RECONCILIATION_PATH}?${RULE_PARAM}=donem-gecmis`}
              />
              <StatTile
                label={billingMessages.subscriptions.driftTrialLapsed}
                value={formatNumber(drift.value.trialLapsed)}
                tone={countTone(drift.value.trialLapsed)}
                hint={billingMessages.rules['deneme-gecmis'].label}
                href={`${BILLING_RECONCILIATION_PATH}?${RULE_PARAM}=deneme-gecmis`}
              />
            </div>
          ) : (
            <CardError message={drift.message} hint={messages.errors.queryFailedHint} />
          )}
        </Card>

        <p className="px-1 text-[11px] text-faint">{billingMessages.area.aggregateNote}</p>
      </div>
    </NavShell>
  )
}

function MixCounters({ mix }: { mix: SubscriptionMix }) {
  const countOf = (status: string): number =>
    mix.counts.find((entry) => entry.status === status)?.count ?? 0

  return (
    <div className="flex flex-col gap-4">
      <StatGrid>
        <StatTile
          label={billingMessages.subscriptions.tilePaying}
          value={formatNumber(mix.paying)}
          hint={billingMessages.subscriptions.tilePayingHint}
          tone="success"
        />
        <StatTile
          label={billingMessages.subscriptions.tileTrialing}
          value={formatNumber(mix.trialing)}
          tone="primary"
        />
        <StatTile
          label={billingMessages.subscriptions.tileGrace}
          value={formatNumber(mix.gracePeriod)}
          tone={mix.gracePeriod > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          label={billingMessages.subscriptions.tileBillingIssue}
          value={formatNumber(mix.billingIssue)}
          tone={countTone(mix.billingIssue)}
        />
      </StatGrid>

      <StatGrid>
        <StatTile label={billingMessages.subscriptions.tileTotal} value={formatNumber(mix.total)} />
        <StatTile
          label={billingMessages.subscriptions.tileFree}
          value={formatNumber(countOf('free'))}
        />
        <StatTile
          label={billingMessages.subscriptions.tileExpired}
          value={formatNumber(countOf('expired'))}
        />
        <StatTile
          label={billingMessages.subscriptions.tilePayingShare}
          value={formatPercent(mix.paying, mix.total)}
        />
      </StatGrid>
    </div>
  )
}

/**
 * The trial headline. Rendered as plain figures rather than tiles because it
 * lives inside a card — a panel nested in a panel reads as a mistake.
 */
function TrialCounters({ funnel, error }: { funnel: TrialFunnel | null; error: boolean }) {
  if (error || funnel === null) {
    return (
      <CardError message={messages.errors.queryFailed} hint={messages.errors.queryFailedHint} />
    )
  }

  const cells: readonly { key: string; label: string; value: string; tone?: string }[] = [
    {
      key: 'running',
      label: billingMessages.subscriptions.trialRunning,
      value: formatNumber(funnel.running),
    },
    {
      key: 'ended',
      label: billingMessages.subscriptions.trialEnded,
      value: formatNumber(funnel.ended),
    },
    {
      key: 'rate',
      label: billingMessages.subscriptions.trialConversionRate,
      value: funnel.conversionRate === null ? '—' : formatPercent(funnel.converted, funnel.ended),
      tone: 'text-success-text',
    },
    {
      key: 'stuck',
      label: billingMessages.subscriptions.trialStuck,
      value: formatNumber(funnel.stuck),
      tone: funnel.stuck > 0 ? 'text-warning-text' : undefined,
    },
  ]

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.key}>
          <dt className="bo-kicker">{cell.label}</dt>
          <dd
            className={[
              'mt-0.5 text-[20px] leading-6 font-semibold tabular-nums',
              cell.tone ?? 'text-ink',
            ].join(' ')}
          >
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
