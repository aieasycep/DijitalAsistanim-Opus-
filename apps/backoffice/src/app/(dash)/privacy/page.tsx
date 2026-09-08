import type { Metadata } from 'next'
import Link from 'next/link'
import { NavShell } from '@/components/NavShell'
import {
  BOARD_SIZE,
  DEFAULT_PRIVACY_WINDOW,
  DELETION_EVENT_LIMIT,
  DELETION_MARK_LIMIT,
  DeadlineStats,
  DeletionEventTable,
  DeletionMarkTable,
  DeletionSummary,
  FulfilmentPanel,
  PRIVACY_PARAMS,
  PRIVACY_PATH,
  PRIVACY_REQUESTS_PATH,
  PRIVACY_RESULT_PARAMS,
  PRIVACY_RETENTION_PATH,
  PRIVACY_WINDOW_KEYS,
  QUEUE_PARAMS,
  RefreshForm,
  RequestTable,
  ResultBanner,
  StatusBreakdownTable,
  SWEEP_RUN_LIMIT,
  isPrivacyWindowKey,
  isRerunOutcome,
  privacyMessages,
  type PrivacyWindowKey,
} from '@/components/privacy'
import { Card, CardError, type FilterControl, Filters, PageHeader } from '@/components/ui'
import { requireStaff } from '@/lib/auth'
import { formatDate, formatNumber, formatRelative } from '@/lib/format'
import {
  loadDeadlineBoard,
  loadDeadlineCounters,
  loadDeletionCounters,
  loadDeletionEvents,
  loadDeletionMarks,
  loadFulfilment,
  loadRerunOrders,
  loadStatusBreakdown,
  loadSweepHealth,
  resolveDeadlineClock,
  resolvePrivacyWindow,
  settle,
} from '@/lib/queries/privacy'
import { orderExportRerunAction, refreshPrivacyAction } from './actions'

/**
 * Gizlilik talepleri — the statutory obligations, where a deadline cannot be
 * missed quietly.
 *
 * KVKK m.13 and GDPR Art. 12(3) both give the controller thirty days to answer
 * a data subject request. This page measures every open export against that
 * clock, and it treats the last week before the deadline as the state that needs
 * a human — because thirty days is also `data_export_requests`' own retention
 * window, so a request that reaches the limit is not merely late, it is swept
 * away by the nightly job. That coincidence is stated on the page rather than
 * left for someone to discover during an audit.
 *
 * Nothing here can see inside an export. `bo_privacy_requests` does not
 * reference `storage_path`, so the archive an operator is chasing is, to this
 * tool, a status, a size and two timestamps.
 *
 * Eight independent loads, each settled on its own, so a view that is slow or
 * missing costs its own panel and nothing else.
 */

export const metadata: Metadata = { title: privacyMessages.overview.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

const WINDOW_LABELS: Readonly<Record<PrivacyWindowKey, string>> = {
  '7g': privacyMessages.overview.window7d,
  '30g': privacyMessages.overview.window30d,
  '90g': privacyMessages.overview.window90d,
}

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await requireStaff('support')
  const params = await searchParams

  const windowRaw = firstValue(params[PRIVACY_PARAMS.window])
  const windowKey =
    windowRaw !== null && isPrivacyWindowKey(windowRaw) ? windowRaw : DEFAULT_PRIVACY_WINDOW

  const outcomeRaw = firstValue(params[PRIVACY_RESULT_PARAMS.outcome])
  const outcome = outcomeRaw !== null && isRerunOutcome(outcomeRaw) ? outcomeRaw : null
  const resultRequest = firstValue(params[PRIVACY_RESULT_PARAMS.request])

  const window = resolvePrivacyWindow(windowKey)
  const deadlineClock = resolveDeadlineClock()

  const [counters, breakdown, fulfilment, board, deletion, events, marks, sweep] =
    await Promise.all([
      settle(() => loadDeadlineCounters(deadlineClock)),
      settle(() => loadStatusBreakdown(window)),
      settle(() => loadFulfilment(window)),
      settle(async () => {
        const page = await loadDeadlineBoard(BOARD_SIZE)
        const orders = await loadRerunOrders(page.rows.map((row) => row.request_id))
        return { page, orders }
      }),
      settle(() => loadDeletionCounters(window)),
      settle(() => loadDeletionEvents(DELETION_EVENT_LIMIT)),
      settle(() => loadDeletionMarks(DELETION_MARK_LIMIT)),
      settle(() => loadSweepHealth(SWEEP_RUN_LIMIT)),
    ])

  /**
   * This page's own address, carrying the current window and nothing else. It is
   * both where a staff action returns to and where the result banner's dismiss
   * link points, so the two cannot disagree about "back to here".
   */
  const selfHref = `${PRIVACY_PATH}?${new URLSearchParams({
    [PRIVACY_PARAMS.window]: windowKey,
  }).toString()}`

  const statusHref = (status: string): string =>
    `${PRIVACY_REQUESTS_PATH}?${new URLSearchParams({ [QUEUE_PARAMS.status]: status }).toString()}`
  const deadlineHref = (bucket: string): string =>
    `${PRIVACY_REQUESTS_PATH}?${new URLSearchParams({ [QUEUE_PARAMS.deadline]: bucket }).toString()}`

  const controls: FilterControl[] = [
    {
      kind: 'segmented',
      param: PRIVACY_PARAMS.window,
      label: privacyMessages.overview.windowFilter,
      options: PRIVACY_WINDOW_KEYS.map((value) => ({ value, label: WINDOW_LABELS[value] })),
    },
  ]

  return (
    <NavShell session={session}>
      <PageHeader
        title={privacyMessages.overview.title}
        description={privacyMessages.overview.description}
        kicker={privacyMessages.overview.kicker}
        action={
          <div className="flex items-center gap-3">
            <span className="text-[11px] whitespace-nowrap text-faint">
              <span className="bo-kicker mr-1">{privacyMessages.overview.metaLabel}</span>
              {formatDate(window.sinceIso)} → {formatDate(window.nowIso)}
            </span>
            <RefreshForm action={refreshPrivacyAction} returnTo={selfHref} />
          </div>
        }
      >
        <Filters
          controls={controls}
          values={{ [PRIVACY_PARAMS.window]: windowKey }}
          resetParams={[]}
        />
      </PageHeader>

      {outcome ? (
        <ResultBanner outcome={outcome} requestId={resultRequest} dismissHref={selfHref} />
      ) : null}

      <div className="flex flex-col gap-4">
        <section>
          <h2 className="bo-kicker mb-2">{privacyMessages.overview.statSection}</h2>
          <DeadlineStats
            counters={counters.ok ? counters.value : null}
            countersError={counters.ok ? null : counters.message}
            breakdown={breakdown.ok ? breakdown.value : null}
            breakdownError={breakdown.ok ? null : breakdown.message}
            fulfilment={fulfilment.ok ? fulfilment.value : null}
            fulfilmentError={fulfilment.ok ? null : fulfilment.message}
            deletion={deletion.ok ? deletion.value : null}
            deletionError={deletion.ok ? null : deletion.message}
            sweep={sweep.ok ? sweep.value : null}
            sweepError={sweep.ok ? null : sweep.message}
            windowDays={window.days}
            statusHref={statusHref}
            deadlineHref={deadlineHref}
            queueHref={PRIVACY_REQUESTS_PATH}
            retentionHref={PRIVACY_RETENTION_PATH}
          />
        </section>

        <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] leading-relaxed text-warning-text">
          {privacyMessages.deadline.deadlineWarning}
        </p>

        <Card
          title={privacyMessages.deadline.section}
          description={privacyMessages.deadline.description}
          action={
            <Link
              href={PRIVACY_REQUESTS_PATH}
              className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
            >
              {privacyMessages.deadline.queueLink}
            </Link>
          }
          flush
        >
          <RequestTable
            rows={board.ok ? board.value.page.rows : []}
            total={board.ok ? board.value.page.total : undefined}
            orders={board.ok ? board.value.orders : new Map()}
            error={board.ok ? null : board.message}
            rerunAction={orderExportRerunAction}
            returnTo={selfHref}
            resultRequestId={resultRequest}
            resultOutcome={outcome}
          />
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title={privacyMessages.breakdown.section}
            description={privacyMessages.breakdown.description}
            action={
              breakdown.ok ? (
                <span className="text-[12px] text-muted">
                  <span className="bo-kicker mr-1">{privacyMessages.breakdown.total}</span>
                  <span className="tabular-nums">{formatNumber(breakdown.value.total)}</span>
                </span>
              ) : null
            }
            flush
          >
            <StatusBreakdownTable
              breakdown={breakdown.ok ? breakdown.value : null}
              error={breakdown.ok ? null : breakdown.message}
            />
          </Card>

          <Card
            title={privacyMessages.fulfilment.section}
            description={privacyMessages.fulfilment.description}
          >
            <FulfilmentPanel
              fulfilment={fulfilment.ok ? fulfilment.value : null}
              error={fulfilment.ok ? null : fulfilment.message}
              readyHref={statusHref('ready')}
            />
          </Card>
        </div>

        <Card
          title={privacyMessages.deletion.section}
          description={privacyMessages.deletion.description}
        >
          <DeletionSummary
            counters={deletion.ok ? deletion.value : null}
            error={deletion.ok ? null : deletion.message}
            windowDays={window.days}
          />
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={privacyMessages.deletion.eventsSection} flush>
            <DeletionEventTable
              rows={events.ok ? events.value : []}
              error={events.ok ? null : events.message}
            />
          </Card>

          <Card
            title={privacyMessages.deletion.marksSection}
            description={privacyMessages.deletion.marksDescription}
            flush
          >
            <DeletionMarkTable
              rows={marks.ok ? marks.value.rows : []}
              total={marks.ok ? marks.value.total : undefined}
              error={marks.ok ? null : marks.message}
            />
          </Card>
        </div>

        <Card
          title={privacyMessages.overview.retentionSection}
          description={privacyMessages.retention.description}
          action={
            <Link
              href={PRIVACY_RETENTION_PATH}
              className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
            >
              {privacyMessages.retention.title}
            </Link>
          }
        >
          {sweep.ok ? (
            <dl className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              <SweepFigure
                term={privacyMessages.retention.lastRun}
                value={
                  sweep.value.lastRunAt === null
                    ? privacyMessages.stats.noSweep
                    : formatRelative(sweep.value.lastRunAt)
                }
                tone={sweep.value.late ? 'warning' : 'neutral'}
              />
              <SweepFigure
                term={privacyMessages.retention.runsInWindow}
                value={formatNumber(sweep.value.runsLast7d)}
                hint={privacyMessages.retention.runsExpected(sweep.value.expectedLast7d)}
                tone={sweep.value.runsLast7d < sweep.value.expectedLast7d ? 'warning' : 'neutral'}
              />
              <SweepFigure
                term={privacyMessages.retention.runsSection}
                value={formatNumber(sweep.value.runs.length)}
              />
            </dl>
          ) : (
            <CardError message={sweep.message} hint={privacyMessages.errors.retentionFailed} />
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            {privacyMessages.retention.auditNote}
          </p>
        </Card>

        <p className="text-[11px] text-faint">{privacyMessages.overview.privacyNote}</p>
      </div>
    </NavShell>
  )
}

function SweepFigure({
  term,
  value,
  hint,
  tone = 'neutral',
}: {
  term: string
  value: string
  hint?: string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-md border border-hairline px-3 py-2">
      <dt className="bo-kicker">{term}</dt>
      <dd
        className={[
          'mt-0.5 text-[18px] leading-6 font-semibold tabular-nums',
          tone === 'warning' ? 'text-warning-text' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </dd>
      {hint ? <dd className="text-[11px] text-faint">{hint}</dd> : null}
    </div>
  )
}
