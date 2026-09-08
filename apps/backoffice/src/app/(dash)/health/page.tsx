import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CHECK_SCOPE_ALL,
  CheckForm,
  DependencyTable,
  HEALTH_CONFIG_PATH,
  HEALTH_PATH,
  HEALTH_RESULT_PARAMS,
  RefreshForm,
  ResultBanner,
  ScheduledJobTable,
  firstParam,
  isCheckOutcome,
  withoutResult,
} from '@/components/health'
import { Card, CardError, PageHeader, StatGrid, StatTile, countTone } from '@/components/ui'
import { refreshHealthAction, runHealthCheckAction } from '@/lib/actions/health'
import { csrfField, requirePermission, sessionCan } from '@/lib/auth'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { messages } from '@/lib/messages'
import { healthMessages } from '@/lib/messages/health'
import {
  loadDependencyStatus,
  loadScheduledJobEvidence,
  settle,
  summarise,
} from '@/lib/queries/health'

/**
 * The page an operator opens during an incident.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN IT, AND WHO MAY ACT ON IT
 * ---------------------------------------------------------------------------
 *
 * `system.health.read`, checked server-side before anything renders — the one
 * permission every one of the seven roles holds, because a console where an
 * analyst cannot see whether the platform is up is a console that generates
 * support tickets of its own. Typing the URL in directly gets the same refusal;
 * the sidebar entry is a courtesy, not the boundary.
 *
 * Starting a measurement is a different question and needs
 * `integration.resync` alongside it. The controls are only drawn for an
 * operator who holds both — and `runHealthCheckAction` asks the database again
 * anyway, because a hidden button stops nobody who can post a form.
 *
 * ---------------------------------------------------------------------------
 * EVERY NUMBER ON THIS SCREEN
 * ---------------------------------------------------------------------------
 *
 *   the four tiles   folded from the dependency rows already loaded — one row
 *                    per target, so counting them again in SQL would be five
 *                    more round trips to re-measure a seven-element array
 *   status, latency, `bo_system_health`: the latest `system_health_checks` row
 *   error code       per target, with `bo_error_code()` already applied
 *   the 24h strip    `sample_count_24h` / `degraded_count_24h` /
 *                    `down_count_24h` from the same view's lateral window
 *   the job traces   `ORDER BY … LIMIT 1` and `count(*)` over `bo_sync_health`,
 *                    `bo_approvals`, `bo_privacy_requests`, and the newest day
 *                    of `bo_briefing_health` / `bo_notification_health`
 *
 * Nothing here is estimated, and nothing here defaults to green. A target with
 * no row renders "hiç ölçülmedi"; a target whose last row is older than fifteen
 * minutes renders "bilinmiyor" with the age beside it, because
 * `bo_system_health.is_stale` says the probe stopped rather than that the
 * dependency is fine.
 *
 * The two loads are settled separately, so a failed query costs its own panel
 * and the rest of the page still answers. Neither falls through to an empty
 * state: on this page above all others, "nothing is wrong" and "the query
 * failed" must not look the same.
 */

export const metadata: Metadata = { title: healthMessages.dashboard.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await requirePermission('system.health.read')
  const params = await searchParams

  // Both permissions, decided once. This chooses what to *render*; the Server
  // Action decides what may *happen*, and it runs whether or not the control
  // was drawn. Refreshing re-reads what is already stored and needs only the
  // read permission; measuring opens outbound connections and needs both.
  const mayCheck =
    sessionCan(session, 'system.health.read') && sessionCan(session, 'integration.resync')
  const csrf = csrfField(session)
  const checkCsrf = mayCheck ? csrf : null

  const outcomeParam = firstParam(params, HEALTH_RESULT_PARAMS.outcome)
  const outcome = outcomeParam !== null && isCheckOutcome(outcomeParam) ? outcomeParam : null
  const resultTarget = firstParam(params, HEALTH_RESULT_PARAMS.target)
  const checkedParam = firstParam(params, HEALTH_RESULT_PARAMS.checked)
  const checked = checkedParam === null ? 0 : Math.max(0, Number.parseInt(checkedParam, 10) || 0)

  // This page's own address with the last answer stripped off. It is the
  // action's return target and the banner's dismiss link, so the two cannot
  // disagree about where "back to this page" is.
  const query = new URLSearchParams()
  for (const key of Object.keys(params)) {
    const single = firstParam(params, key)
    if (single !== null) query.set(key, single)
  }
  const selfHref = withoutResult(HEALTH_PATH, query)

  const [dependencies, jobs] = await Promise.all([
    settle(() => loadDependencyStatus()),
    settle(() => loadScheduledJobEvidence()),
  ])

  const summary = dependencies.ok ? summarise(dependencies.value) : null

  return (
    <>
      <PageHeader
        title={healthMessages.dashboard.title}
        description={healthMessages.dashboard.description}
        kicker={healthMessages.dashboard.kicker}
        meta={
          summary === null ? null : summary.lastCheckedAt === null ? (
            healthMessages.dashboard.noMeasurement
          ) : (
            <>
              <span className="bo-kicker mr-1">{healthMessages.dashboard.lastMeasurement}</span>
              {formatDateTime(summary.lastCheckedAt)} · {formatRelative(summary.lastCheckedAt)}
            </>
          )
        }
        action={
          <div className="flex items-center gap-2">
            <Link
              href={HEALTH_CONFIG_PATH}
              className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
            >
              {healthMessages.dashboard.configLink}
            </Link>
            <RefreshForm
              action={refreshHealthAction}
              returnTo={selfHref}
              csrf={csrf}
              label={healthMessages.check.refresh}
              pendingLabel={healthMessages.check.refreshPending}
            />
            {checkCsrf === null ? null : (
              <CheckForm
                action={runHealthCheckAction}
                target={CHECK_SCOPE_ALL}
                returnTo={selfHref}
                csrf={checkCsrf}
                label={healthMessages.check.all}
                pendingLabel={healthMessages.check.allPending}
              />
            )}
          </div>
        }
      />

      {outcome === null ? null : (
        <ResultBanner
          outcome={outcome}
          target={resultTarget}
          checked={checked}
          dismissHref={selfHref}
        />
      )}

      <div className="flex flex-col gap-4">
        <section>
          <h2 className="bo-kicker mb-2">{healthMessages.summary.section}</h2>
          {!dependencies.ok || summary === null ? (
            <Card title={healthMessages.summary.section}>
              <CardError
                message={dependencies.ok ? messages.errors.queryFailed : dependencies.message}
                hint={messages.errors.queryFailedHint}
              />
            </Card>
          ) : (
            <StatGrid>
              <StatTile
                label={healthMessages.summary.tracked}
                value={formatNumber(summary.tracked)}
                hint={healthMessages.summary.trackedHint}
              />
              <StatTile
                label={healthMessages.summary.operational}
                value={formatNumber(summary.operational)}
                tone={summary.operational > 0 ? 'success' : 'neutral'}
              />
              <StatTile
                label={healthMessages.summary.degraded}
                value={formatNumber(summary.degraded)}
                tone={summary.degraded > 0 ? 'warning' : 'neutral'}
              />
              <StatTile
                label={healthMessages.summary.down}
                value={formatNumber(summary.down)}
                tone={countTone(summary.down)}
              />
              <StatTile
                label={healthMessages.summary.unmeasured}
                value={formatNumber(summary.unmeasured)}
                hint={healthMessages.summary.unmeasuredHint}
                // Deliberately never green and never red. "Nobody measured
                // this" is neither good news nor an outage; painting it either
                // way would be the page making a claim it cannot support.
                tone={summary.unmeasured > 0 ? 'info' : 'neutral'}
              />
            </StatGrid>
          )}
        </section>

        <Card
          title={healthMessages.table.section}
          description={healthMessages.table.description}
          flush
        >
          <DependencyTable
            rows={dependencies.ok ? dependencies.value : []}
            error={dependencies.ok ? null : dependencies.message}
            action={runHealthCheckAction}
            returnTo={selfHref}
            csrf={checkCsrf}
          />
          {/* What the button does, or why there is no button. A control that
              is simply absent reads as a missing feature; naming the permission
              turns it into something the operator can ask for. */}
          <p className="border-t border-hairline px-4 py-2 text-[11px] text-faint">
            {checkCsrf === null ? healthMessages.check.forbidden : healthMessages.check.note}
          </p>
        </Card>

        <Card
          title={healthMessages.jobs.section}
          description={healthMessages.jobs.description}
          flush
        >
          <ScheduledJobTable
            evidence={jobs.ok ? jobs.value : null}
            error={jobs.ok ? null : jobs.message}
          />
          <p className="border-t border-hairline px-4 py-2 text-[11px] text-faint">
            {healthMessages.jobs.cronUnreadable}
          </p>
        </Card>

        <p className="text-[11px] text-faint">{healthMessages.dashboard.measuredFrom}</p>
      </div>
    </>
  )
}
