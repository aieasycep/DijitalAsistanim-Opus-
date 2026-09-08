import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AUTO_REFRESH_PARAM,
  ActionResultBanner,
  AutoRefreshMeta,
  DASHBOARD_QUEUE_SIZE,
  ErrorCodeTable,
  ErrorRateTable,
  FailingSyncTable,
  OPS_PATH,
  OPS_QUEUE_PATH,
  OPS_RESULT_PARAMS,
  ProviderHealthTable,
  QUEUE_PARAMS,
  RefreshForm,
  ThroughputTable,
  isAutoRefreshKey,
  isResyncOutcome,
  opsMessages,
  type AutoRefreshKey,
  type ResyncOutcome,
} from '@/components/ops'
import {
  Card,
  CardError,
  Filters,
  PageHeader,
  StatGrid,
  StatTile,
  countTone,
} from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { formatCostMicros, formatDateTime, formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import {
  loadErrorCodeBreakdown,
  loadFailingSync,
  loadFunctionErrorRates,
  loadPlatformOverview,
  loadProviderHealth,
  loadSyncPulse,
  loadThroughput,
  settle,
} from '@/lib/queries/ops'
import { refreshOpsAction, resyncAccountAction } from './actions'

/**
 * The operations dashboard — the page that stays open on the second monitor.
 *
 * Seven independent queries, each settled on its own, so a view that is missing
 * or slow costs its own panel and nothing else. Nothing on this page is
 * computed from a sample: the counters are `count(*)` in Postgres, the
 * staleness figures are `ORDER BY … LIMIT 1`, and the one panel that tallies in
 * the application says so on screen when its sample is partial.
 *
 * Every control does something: the interval picker rewrites the URL and makes
 * the page reload itself, "Yenile" re-runs the queries through a Server Action,
 * every error code links into the queue filtered by that code, and each failing
 * row carries the one outward action this area has.
 */

export const metadata: Metadata = { title: opsMessages.dashboard.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

function parseAutoRefresh(raw: string | string[] | undefined): AutoRefreshKey {
  const value = firstValue(raw)
  return value !== null && isAutoRefreshKey(value) ? value : 'kapali'
}

function parseOutcome(raw: string | string[] | undefined): ResyncOutcome | null {
  const value = firstValue(raw)
  return value !== null && isResyncOutcome(value) ? value : null
}

export default async function OpsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePermission('system.health.read')
  const params = await searchParams

  const autoRefresh = parseAutoRefresh(params[AUTO_REFRESH_PARAM])
  const outcome = parseOutcome(params[OPS_RESULT_PARAMS.outcome])
  const resultCode = firstValue(params[OPS_RESULT_PARAMS.code])
  const resultAccount = firstValue(params[OPS_RESULT_PARAMS.account])

  // The page's own address without the last action's answer on it. Used both as
  // the action's return target and as the banner's dismiss link, so the two can
  // never disagree about where "back to this page" is.
  const baseQuery = new URLSearchParams()
  if (autoRefresh !== 'kapali') baseQuery.set(AUTO_REFRESH_PARAM, autoRefresh)
  const queryString = baseQuery.toString()
  const selfHref = queryString === '' ? OPS_PATH : `${OPS_PATH}?${queryString}`

  const [overview, pulse, providers, failing, rates, codes, throughput] = await Promise.all([
    settle(() => loadPlatformOverview()),
    settle(() => loadSyncPulse()),
    settle(() => loadProviderHealth()),
    settle(() => loadFailingSync({ limit: DASHBOARD_QUEUE_SIZE, offset: 0 })),
    settle(() => loadFunctionErrorRates()),
    settle(() => loadErrorCodeBreakdown()),
    settle(() => loadThroughput()),
  ])

  const codeHref = (code: string): string =>
    `${OPS_QUEUE_PATH}?${QUEUE_PARAMS.code}=${encodeURIComponent(code)}`

  return (
    <>
      <AutoRefreshMeta interval={autoRefresh} />

      <PageHeader
        title={opsMessages.dashboard.title}
        description={opsMessages.dashboard.description}
        kicker={opsMessages.dashboard.kicker}
        action={
          <div className="flex items-center gap-3">
            {overview.ok && overview.value ? (
              <span className="text-[11px] text-faint">
                <span className="bo-kicker mr-1">{opsMessages.dashboard.generatedAt}</span>
                {formatDateTime(overview.value.generated_at)}
              </span>
            ) : null}
            <RefreshForm action={refreshOpsAction} returnTo={selfHref} />
          </div>
        }
      >
        <Filters
          controls={[
            {
              kind: 'segmented',
              param: AUTO_REFRESH_PARAM,
              label: opsMessages.refresh.autoLabel,
              options: [
                // "Off" is the absent parameter rather than a value of its own,
                // so the default URL stays clean and `Filters` only offers its
                // reset button when an interval is actually set.
                { value: '', label: opsMessages.refresh.autoOff },
                { value: '1dk', label: opsMessages.refresh.auto1m },
                { value: '5dk', label: opsMessages.refresh.auto5m },
              ],
            },
          ]}
          values={{ [AUTO_REFRESH_PARAM]: autoRefresh === 'kapali' ? '' : autoRefresh }}
          resetParams={[]}
        />
      </PageHeader>

      {outcome ? (
        <ActionResultBanner
          outcome={outcome}
          code={resultCode}
          accountId={resultAccount}
          dismissHref={selfHref}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <section>
          <h2 className="bo-kicker mb-2">{opsMessages.pulse.section}</h2>
          {pulse.ok ? (
            <StatGrid>
              <StatTile
                label={opsMessages.pulse.ranLastHour}
                value={formatNumber(pulse.value.ranLastHour)}
              />
              <StatTile
                label={opsMessages.pulse.ranLast24h}
                value={formatNumber(pulse.value.ranLast24h)}
              />
              <StatTile
                label={opsMessages.pulse.dueNow}
                value={formatNumber(pulse.value.dueNow)}
                hint={opsMessages.pulse.dueNowHint}
                tone={pulse.value.dueNow > 0 ? 'warning' : 'neutral'}
              />
              <StatTile
                label={opsMessages.pulse.backfilling}
                value={formatNumber(pulse.value.backfilling)}
                tone={pulse.value.backfilling > 0 ? 'info' : 'neutral'}
              />
              <StatTile
                label={opsMessages.pulse.errored}
                value={formatNumber(pulse.value.errored)}
                tone={countTone(pulse.value.errored)}
                href={OPS_QUEUE_PATH}
              />
              <StatTile
                label={opsMessages.pulse.stalled}
                value={formatNumber(pulse.value.stalled)}
                hint={opsMessages.pulse.stalledHint}
                tone={pulse.value.stalled > 0 ? 'warning' : 'neutral'}
              />
              <StatTile
                label={opsMessages.pulse.accountsAtRisk}
                value={
                  overview.ok && overview.value ? formatNumber(overview.value.account_error) : '—'
                }
                hint={
                  overview.ok && overview.value
                    ? opsMessages.pulse.accountsAtRiskHint
                    : opsMessages.dashboard.overviewUnavailable
                }
                tone={
                  overview.ok && overview.value
                    ? countTone(overview.value.account_error)
                    : 'neutral'
                }
              />
              <StatTile
                label={opsMessages.pulse.aiCost24h}
                value={
                  overview.ok && overview.value
                    ? formatCostMicros(overview.value.ai_cost_micros_24h)
                    : '—'
                }
                hint={
                  overview.ok && overview.value
                    ? undefined
                    : opsMessages.dashboard.overviewUnavailable
                }
              />
            </StatGrid>
          ) : (
            <Card title={opsMessages.pulse.section}>
              <CardError message={pulse.message} hint={messages.errors.queryFailedHint} />
            </Card>
          )}
        </section>

        <Card
          title={opsMessages.providers.section}
          description={opsMessages.providers.description}
          flush
        >
          <ProviderHealthTable
            rows={providers.ok ? providers.value : []}
            error={providers.ok ? null : providers.message}
          />
        </Card>

        <Card
          title={opsMessages.failing.section}
          description={opsMessages.failing.description}
          action={
            <Link
              href={OPS_QUEUE_PATH}
              className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
            >
              {opsMessages.failing.fullQueue}
            </Link>
          }
          flush
        >
          <FailingSyncTable
            rows={failing.ok ? failing.value.rows : []}
            total={failing.ok ? failing.value.total : undefined}
            error={failing.ok ? null : failing.message}
            action={resyncAccountAction}
            returnTo={selfHref}
            codeHref={codeHref}
            resultAccountId={resultAccount}
            resultOutcome={outcome}
            emptyMessage={opsMessages.failing.empty}
          />
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title={opsMessages.errorRates.section}
            description={opsMessages.errorRates.description}
            flush
          >
            <ErrorRateTable
              rows={rates.ok ? rates.value : []}
              error={rates.ok ? null : rates.message}
            />
          </Card>

          <Card
            title={opsMessages.errorCodes.section}
            description={opsMessages.errorCodes.description}
            flush
          >
            <ErrorCodeTable
              breakdown={codes.ok ? codes.value : null}
              error={codes.ok ? null : codes.message}
              codeHref={codeHref}
            />
          </Card>
        </div>

        <Card
          title={opsMessages.throughput.section}
          description={opsMessages.throughput.description}
          flush
        >
          <ThroughputTable
            rows={throughput.ok ? throughput.value : []}
            error={throughput.ok ? null : throughput.message}
          />
        </Card>

        <p className="text-[11px] text-faint">{opsMessages.privacy.note}</p>
      </div>
    </>
  )
}
