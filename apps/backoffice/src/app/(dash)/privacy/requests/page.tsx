import { EXPORT_STATUSES } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  DEADLINE_BUCKETS,
  DEADLINE_BUCKET_LABEL,
  PRIVACY_PATH,
  PRIVACY_REQUESTS_PATH,
  PRIVACY_RESULT_PARAMS,
  Pager,
  QUEUE_PARAMS,
  REQUEST_PAGE_SIZE,
  RefreshForm,
  RequestTable,
  ResultBanner,
  isDeadlineBucket,
  isExportStatus,
  isRerunOutcome,
  privacyMessages,
} from '@/components/privacy'
import { type FilterControl, Filters, PageHeader } from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { enumLabels, labelFor } from '@/lib/messages'
import {
  loadRequestQueue,
  loadRerunOrders,
  resolveDeadlineClock,
  settle,
} from '@/lib/queries/privacy'
import { orderExportRerunAction, refreshPrivacyAction } from '../actions'

/**
 * The full export queue.
 *
 * Filtering and paging are server re-queries driven by the URL, not client-side
 * work over a list that was already fetched: the status filter becomes a
 * `WHERE status = …`, the deadline filter becomes a range over `requested_at`,
 * and the pager becomes an `OFFSET`. The row count under the table is
 * PostgREST's exact total for the same filters, so "23 kayıttan 25 tanesi" can
 * never happen.
 *
 * Ordering is oldest first, which for this table is deadline order — the row at
 * the top is always the one with the least statutory time left.
 */

export const metadata: Metadata = { title: privacyMessages.queue.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

function parsePage(raw: string | string[] | undefined): number {
  const value = firstValue(raw)
  if (value === null || !/^\d{1,6}$/.test(value)) return 1
  return Math.max(1, Number.parseInt(value, 10))
}

export default async function PrivacyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePermission('privacy.read')
  const params = await searchParams

  const statusRaw = firstValue(params[QUEUE_PARAMS.status])
  const deadlineRaw = firstValue(params[QUEUE_PARAMS.deadline])
  const status = statusRaw !== null && isExportStatus(statusRaw) ? statusRaw : null
  const deadline = deadlineRaw !== null && isDeadlineBucket(deadlineRaw) ? deadlineRaw : null
  const page = parsePage(params[QUEUE_PARAMS.page])

  const outcomeRaw = firstValue(params[PRIVACY_RESULT_PARAMS.outcome])
  const outcome = outcomeRaw !== null && isRerunOutcome(outcomeRaw) ? outcomeRaw : null
  const resultRequest = firstValue(params[PRIVACY_RESULT_PARAMS.request])

  const deadlineClock = resolveDeadlineClock()

  const queue = await settle(async () => {
    const result = await loadRequestQueue({
      status,
      deadline,
      deadlineClock,
      limit: REQUEST_PAGE_SIZE,
      offset: (page - 1) * REQUEST_PAGE_SIZE,
    })
    const orders = await loadRerunOrders(result.rows.map((row) => row.request_id))
    return { result, orders }
  })

  const total = queue.ok ? queue.value.result.total : 0
  const pageCount = Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE))

  const hrefFor = (nextPage: number): string => {
    const query = new URLSearchParams()
    if (status !== null) query.set(QUEUE_PARAMS.status, status)
    if (deadline !== null) query.set(QUEUE_PARAMS.deadline, deadline)
    if (nextPage > 1) query.set(QUEUE_PARAMS.page, String(nextPage))
    const search = query.toString()
    return search === '' ? PRIVACY_REQUESTS_PATH : `${PRIVACY_REQUESTS_PATH}?${search}`
  }

  const selfHref = hrefFor(page)
  const isFiltered = status !== null || deadline !== null

  const controls: FilterControl[] = [
    {
      kind: 'select',
      param: QUEUE_PARAMS.status,
      label: privacyMessages.queue.statusFilter,
      options: EXPORT_STATUSES.map((value) => ({
        value,
        label: labelFor(enumLabels.exportStatus, value),
      })),
    },
    {
      kind: 'select',
      param: QUEUE_PARAMS.deadline,
      label: privacyMessages.queue.deadlineFilter,
      options: DEADLINE_BUCKETS.map((value) => ({
        value,
        label: DEADLINE_BUCKET_LABEL[value],
      })),
    },
  ]

  return (
    <>
      <PageHeader
        title={privacyMessages.queue.title}
        description={privacyMessages.queue.description}
        kicker={
          <Link href={PRIVACY_PATH} className="underline underline-offset-2 hover:text-muted">
            {privacyMessages.queue.kicker}
          </Link>
        }
        action={<RefreshForm action={refreshPrivacyAction} returnTo={selfHref} />}
      >
        <Filters
          controls={controls}
          values={{
            [QUEUE_PARAMS.status]: status ?? '',
            [QUEUE_PARAMS.deadline]: deadline ?? '',
            [QUEUE_PARAMS.page]: String(page),
          }}
          resetParams={[QUEUE_PARAMS.page]}
        />
      </PageHeader>

      {outcome ? (
        <ResultBanner outcome={outcome} requestId={resultRequest} dismissHref={selfHref} />
      ) : null}

      <div className="flex flex-col gap-3">
        <RequestTable
          variant="queue"
          rows={queue.ok ? queue.value.result.rows : []}
          total={queue.ok ? queue.value.result.total : undefined}
          orders={queue.ok ? queue.value.orders : new Map()}
          error={queue.ok ? null : queue.message}
          emptyMessage={privacyMessages.queue.empty}
          emptyAction={
            isFiltered ? (
              <Link
                href={PRIVACY_REQUESTS_PATH}
                className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
              >
                {privacyMessages.queue.emptyReset}
              </Link>
            ) : null
          }
          rerunAction={orderExportRerunAction}
          returnTo={selfHref}
          resultRequestId={resultRequest}
          resultOutcome={outcome}
        />

        <Pager page={page} pageCount={pageCount} hrefFor={hrefFor} />

        <p className="text-[11px] text-faint">{privacyMessages.overview.privacyNote}</p>
      </div>
    </>
  )
}
