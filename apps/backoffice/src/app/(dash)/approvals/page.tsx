import type { Metadata } from 'next'
import Link from 'next/link'
import { APPROVAL_ACTION_TYPES, SOURCE_TYPES } from '@da/domain'
import {
  APPROVALS_FAILURES_PATH,
  APPROVALS_PATH,
  APPROVAL_PARAMS,
  APPROVAL_RESULT_PARAMS,
  APPROVAL_WINDOW_KEYS,
  ActionTypeTable,
  DASHBOARD_CODE_LIMIT,
  DEFAULT_APPROVAL_WINDOW,
  FailureCodeTable,
  FunnelStats,
  PendingQueueTable,
  QUEUE_PREVIEW_SIZE,
  RefreshForm,
  ResultBanner,
  TimingPanel,
  TrendTable,
  actionTypeLabels,
  approvalMessages,
  isApprovalActionType,
  isApprovalWindowKey,
  isReviewOutcome,
  isSourceType,
  sourceTypeLabels,
  type ApprovalWindowKey,
  type ReviewOutcome,
} from '@/components/approvals'
import { Card, type FilterControl, Filters, PageHeader } from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import {
  loadActionTypeStats,
  loadApprovalFunnel,
  loadApprovalTrend,
  loadDurationSummaries,
  loadFailureBreakdown,
  loadPendingQueue,
  loadRejectionLatency,
  resolveApprovalWindow,
  settle,
  type ApprovalScope,
} from '@/lib/queries/approvals'
import { recordApprovalReviewAction, refreshApprovalsAction } from './actions'

/**
 * Approval oversight — the product's core safety property, observed.
 *
 * Every write that leaves this product goes through an approval, so this page is
 * where "the assistant did something behind my back" is proved false: how many
 * actions were proposed, how many the user allowed, how many they refused, and
 * how many quietly expired because they never answered.
 *
 * The rejection rate per action type is the signal that matters most. It is the
 * only measurement in the system that says the drafts got worse, and it says it
 * without anyone reading a draft — which is the whole design. `bo_approvals`
 * does not reference `payload`, `what` or `why`, so no query on this page could
 * reach the recipient, subject or body even if one tried.
 *
 * Seven independent loads, each settled on its own, so a view that is slow or
 * missing costs its own panel and nothing else. Every number is a `count(*)`,
 * an `ORDER BY … LIMIT 1` or an exact total from Postgres, except the two
 * places that say on screen that they sampled.
 */

export const metadata: Metadata = { title: approvalMessages.overview.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

function parseWindow(raw: string | string[] | undefined): ApprovalWindowKey {
  const value = firstValue(raw)
  return value !== null && isApprovalWindowKey(value) ? value : DEFAULT_APPROVAL_WINDOW
}

function parseOutcome(raw: string | string[] | undefined): ReviewOutcome | null {
  const value = firstValue(raw)
  return value !== null && isReviewOutcome(value) ? value : null
}

const WINDOW_LABELS: Readonly<Record<ApprovalWindowKey, string>> = {
  '7g': approvalMessages.overview.window7d,
  '30g': approvalMessages.overview.window30d,
  '90g': approvalMessages.overview.window90d,
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePermission('integration.read')
  const params = await searchParams

  const windowKey = parseWindow(params[APPROVAL_PARAMS.window])
  const typeRaw = firstValue(params[APPROVAL_PARAMS.type])
  const sourceRaw = firstValue(params[APPROVAL_PARAMS.source])
  const type = typeRaw !== null && isApprovalActionType(typeRaw) ? typeRaw : null
  const source = sourceRaw !== null && isSourceType(sourceRaw) ? sourceRaw : null

  const outcome = parseOutcome(params[APPROVAL_RESULT_PARAMS.outcome])
  const resultSubject = firstValue(params[APPROVAL_RESULT_PARAMS.subject])

  const scope: ApprovalScope = {
    window: resolveApprovalWindow(windowKey),
    type,
    source,
  }

  const [funnel, types, trend, timings, failures, queue] = await Promise.all([
    settle(() => loadApprovalFunnel(scope)),
    settle(() => loadActionTypeStats(scope)),
    settle(() => loadApprovalTrend(scope)),
    settle(async () => {
      const [durations, rejection] = await Promise.all([
        loadDurationSummaries(scope),
        loadRejectionLatency(scope),
      ])
      return { ...durations, rejection }
    }),
    settle(() => loadFailureBreakdown(scope, DASHBOARD_CODE_LIMIT)),
    settle(() => loadPendingQueue(scope, QUEUE_PREVIEW_SIZE)),
  ])

  /**
   * This page's own address, carrying the current filters and nothing else. It
   * is both where a staff action returns to and where the result banner's
   * dismiss link points, so the two can never disagree about "back to here".
   */
  const selfQuery = new URLSearchParams({ [APPROVAL_PARAMS.window]: windowKey })
  if (type !== null) selfQuery.set(APPROVAL_PARAMS.type, type)
  if (source !== null) selfQuery.set(APPROVAL_PARAMS.source, source)
  const selfHref = `${APPROVALS_PATH}?${selfQuery.toString()}`

  /** The failure queue, carrying whatever this page is currently filtered to. */
  const failuresHref = (code: string | null): string => {
    const next = new URLSearchParams({ [APPROVAL_PARAMS.window]: windowKey })
    if (type !== null) next.set(APPROVAL_PARAMS.type, type)
    if (code !== null) next.set(APPROVAL_PARAMS.code, code)
    return `${APPROVALS_FAILURES_PATH}?${next.toString()}`
  }

  const controls: FilterControl[] = [
    {
      kind: 'segmented',
      param: APPROVAL_PARAMS.window,
      label: approvalMessages.overview.windowFilter,
      options: APPROVAL_WINDOW_KEYS.map((value) => ({ value, label: WINDOW_LABELS[value] })),
    },
    {
      kind: 'select',
      param: APPROVAL_PARAMS.type,
      label: approvalMessages.overview.typeFilter,
      options: APPROVAL_ACTION_TYPES.map((value) => ({
        value,
        label: actionTypeLabels[value] ?? value,
      })),
    },
    {
      kind: 'select',
      param: APPROVAL_PARAMS.source,
      label: approvalMessages.overview.sourceFilter,
      options: SOURCE_TYPES.map((value) => ({
        value,
        label: sourceTypeLabels[value] ?? value,
      })),
    },
  ]

  return (
    <>
      <PageHeader
        title={approvalMessages.overview.title}
        description={approvalMessages.overview.description}
        kicker={approvalMessages.overview.kicker}
        action={
          <div className="flex items-center gap-3">
            <span className="text-[11px] whitespace-nowrap text-faint">
              <span className="bo-kicker mr-1">{approvalMessages.overview.metaLabel}</span>
              {formatDate(scope.window.sinceIso)} → {formatDate(scope.window.nowIso)}
            </span>
            <RefreshForm action={refreshApprovalsAction} returnTo={selfHref} />
          </div>
        }
      >
        <Filters
          controls={controls}
          values={{
            [APPROVAL_PARAMS.window]: windowKey,
            [APPROVAL_PARAMS.type]: type ?? '',
            [APPROVAL_PARAMS.source]: source ?? '',
          }}
          resetParams={[]}
        />
      </PageHeader>

      {outcome ? (
        <ResultBanner outcome={outcome} subject={resultSubject} dismissHref={selfHref} />
      ) : null}

      <div className="flex flex-col gap-4">
        <section>
          <h2 className="bo-kicker mb-2">{approvalMessages.funnel.section}</h2>
          <FunnelStats
            funnel={funnel.ok ? funnel.value : null}
            error={funnel.ok ? null : funnel.message}
            days={scope.window.days}
            failuresHref={failuresHref(null)}
          />
        </section>

        <Card
          title={approvalMessages.types.section}
          description={approvalMessages.types.description}
          flush
        >
          <ActionTypeTable
            rows={types.ok ? types.value : []}
            error={types.ok ? null : types.message}
            window={windowKey}
            reviewAction={recordApprovalReviewAction}
            returnTo={selfHref}
            resultSubject={resultSubject}
          />
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title={approvalMessages.trend.section}
            description={approvalMessages.trend.description}
            flush
          >
            <TrendTable
              buckets={trend.ok ? trend.value : []}
              error={trend.ok ? null : trend.message}
            />
          </Card>

          <Card
            title={approvalMessages.timing.section}
            description={approvalMessages.timing.description}
          >
            <TimingPanel
              decision={timings.ok ? timings.value.decision : null}
              execution={timings.ok ? timings.value.execution : null}
              rejection={timings.ok ? timings.value.rejection : null}
              error={timings.ok ? null : timings.message}
            />
          </Card>
        </div>

        <Card
          title={approvalMessages.failures.section}
          description={approvalMessages.failures.description}
          action={
            <Link
              href={failuresHref(null)}
              className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
            >
              {approvalMessages.failures.queueLink}
            </Link>
          }
          flush
        >
          <FailureCodeTable
            breakdown={failures.ok ? failures.value : null}
            error={failures.ok ? null : failures.message}
            window={windowKey}
            codeHref={(code) => failuresHref(code)}
            triageAction={recordApprovalReviewAction}
            returnTo={selfHref}
            resultSubject={resultSubject}
          />
        </Card>

        <Card
          title={approvalMessages.queue.section}
          description={approvalMessages.queue.description}
          flush
        >
          <PendingQueueTable
            rows={queue.ok ? queue.value.rows : []}
            total={queue.ok ? queue.value.total : undefined}
            error={queue.ok ? null : queue.message}
          />
        </Card>

        <p className="text-[11px] text-faint">{approvalMessages.overview.privacyNote}</p>
      </div>
    </>
  )
}
