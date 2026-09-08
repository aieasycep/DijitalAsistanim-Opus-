import type { Metadata } from 'next'
import Link from 'next/link'
import { APPROVAL_ACTION_TYPES } from '@da/domain'
import { NavShell } from '@/components/NavShell'
import {
  APPROVALS_FAILURES_PATH,
  APPROVALS_PATH,
  APPROVAL_PARAMS,
  APPROVAL_RESULT_PARAMS,
  APPROVAL_WINDOW_KEYS,
  DEFAULT_APPROVAL_WINDOW,
  FAILURE_CODE_LIMIT,
  FAILURE_PAGE_SIZE,
  FailedApprovalTable,
  FailureCodeTable,
  Pager,
  RefreshForm,
  ResultBanner,
  actionTypeLabels,
  approvalMessages,
  isApprovalActionType,
  isApprovalWindowKey,
  isFailureCode,
  isReviewOutcome,
  type ApprovalWindowKey,
  type ReviewOutcome,
} from '@/components/approvals'
import { Card, type FilterControl, Filters, PageHeader } from '@/components/ui'
import { requireStaff } from '@/lib/auth'
import { formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import {
  loadFailedApprovals,
  loadFailureBreakdown,
  resolveApprovalWindow,
  settle,
  type ApprovalScope,
} from '@/lib/queries/approvals'
import { recordApprovalReviewAction, refreshApprovalsAction } from '../actions'

/**
 * The full failure queue.
 *
 * The dashboard shows the five worst codes; this is every failed approval behind
 * them, filterable and paginated. Both filters are server-side re-queries — the
 * URL is the state, the page reads it, Postgres does the filtering — so a
 * filtered queue is a link an operator can paste to a colleague and get exactly
 * the same rows.
 *
 * The code filter is built from the codes the window actually contains, so it
 * can never offer a choice that returns nothing, and it is not rendered at all
 * when there is nothing to choose.
 */

export const metadata: Metadata = { title: approvalMessages.failureQueue.title }
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

function parsePage(raw: string | string[] | undefined): number {
  const value = Number.parseInt(firstValue(raw) ?? '', 10)
  return Number.isFinite(value) && value > 1 ? value : 1
}

const WINDOW_LABELS: Readonly<Record<ApprovalWindowKey, string>> = {
  '7g': approvalMessages.overview.window7d,
  '30g': approvalMessages.overview.window30d,
  '90g': approvalMessages.overview.window90d,
}

export default async function ApprovalFailuresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await requireStaff('ops')
  const params = await searchParams

  const windowKey = parseWindow(params[APPROVAL_PARAMS.window])
  const typeRaw = firstValue(params[APPROVAL_PARAMS.type])
  const codeRaw = firstValue(params[APPROVAL_PARAMS.code])
  const type = typeRaw !== null && isApprovalActionType(typeRaw) ? typeRaw : null
  // A code is an exact `eq` in SQL, so an unknown one simply returns no rows.
  // It still has to look like a code: `bo_error_code()` guarantees that shape on
  // the way out of the database, and anything else is refused rather than sent.
  const code = codeRaw !== null && isFailureCode(codeRaw) ? codeRaw : null
  const page = parsePage(params[APPROVAL_PARAMS.page])

  const outcome = parseOutcome(params[APPROVAL_RESULT_PARAMS.outcome])
  const resultSubject = firstValue(params[APPROVAL_RESULT_PARAMS.subject])

  const scope: ApprovalScope = { window: resolveApprovalWindow(windowKey), type, source: null }

  const readPage = (target: number) =>
    settle(() =>
      loadFailedApprovals({
        scope,
        code,
        limit: FAILURE_PAGE_SIZE,
        offset: (target - 1) * FAILURE_PAGE_SIZE,
      }),
    )

  // The breakdown is deliberately not narrowed by `code`: it is what the code
  // filter is built from, so narrowing it would leave the filter offering only
  // the choice already made.
  const [firstRead, breakdown] = await Promise.all([
    readPage(page),
    settle(() => loadFailureBreakdown(scope, FAILURE_CODE_LIMIT)),
  ])

  // A `sayfa` past the end — a stale bookmark, or a queue that shrank while it
  // was being worked — would otherwise show an empty table under a pager
  // claiming there are rows. Re-read the last real page instead, once, and only
  // in that case.
  const firstTotal = firstRead.ok ? firstRead.value.total : 0
  const pageCount = Math.max(1, Math.ceil(firstTotal / FAILURE_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const queue = currentPage === page ? firstRead : await readPage(currentPage)

  const isFiltered = type !== null || code !== null

  /** This page's address with the given overrides, minus any action result. */
  const hrefWith = (overrides: Readonly<Record<string, string | null>>): string => {
    const current: Record<string, string | null> = {
      [APPROVAL_PARAMS.window]: windowKey,
      [APPROVAL_PARAMS.type]: type,
      [APPROVAL_PARAMS.code]: code,
      [APPROVAL_PARAMS.page]: currentPage > 1 ? String(currentPage) : null,
      ...overrides,
    }
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(current)) {
      if (value !== null && value !== '') next.set(key, value)
    }
    return `${APPROVALS_FAILURES_PATH}?${next.toString()}`
  }

  const selfHref = hrefWith({})
  const overviewHref = `${APPROVALS_PATH}?${new URLSearchParams({
    [APPROVAL_PARAMS.window]: windowKey,
  }).toString()}`

  // The choices are the codes the window actually contains. A code that arrived
  // in the URL but is no longer among them — the last row carrying it aged out
  // of the window a minute ago — is kept as an option so the select still names
  // what is filtering the empty table below it.
  const codeChoices = (breakdown.ok ? breakdown.value.rows : []).map((row) => ({
    value: row.code,
    label: `${row.code} (${formatNumber(row.count)})`,
  }))
  if (code !== null && !codeChoices.some((choice) => choice.value === code)) {
    codeChoices.unshift({ value: code, label: code })
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
  ]
  // Rendered only when there is something to choose: a select whose every option
  // is "Tümü" is a control that cannot change anything.
  if (codeChoices.length > 0) {
    controls.push({
      kind: 'select',
      param: APPROVAL_PARAMS.code,
      label: approvalMessages.failureQueue.codeFilter,
      options: codeChoices,
    })
  }

  return (
    <NavShell session={session}>
      <PageHeader
        title={approvalMessages.failureQueue.title}
        description={approvalMessages.failureQueue.description}
        kicker={
          <Link href={overviewHref} className="hover:text-ink">
            {approvalMessages.failureQueue.backToOverview}
          </Link>
        }
        action={<RefreshForm action={refreshApprovalsAction} returnTo={selfHref} />}
      >
        <Filters
          controls={controls}
          values={{
            [APPROVAL_PARAMS.window]: windowKey,
            [APPROVAL_PARAMS.type]: type ?? '',
            [APPROVAL_PARAMS.code]: code ?? '',
            [APPROVAL_PARAMS.page]: currentPage > 1 ? String(currentPage) : '',
          }}
          resetParams={[APPROVAL_PARAMS.page]}
        />
      </PageHeader>

      {outcome ? (
        <ResultBanner outcome={outcome} subject={resultSubject} dismissHref={selfHref} />
      ) : null}

      <div className="flex flex-col gap-4">
        <Card
          title={approvalMessages.failures.section}
          description={approvalMessages.failures.description}
          flush
        >
          <FailureCodeTable
            breakdown={breakdown.ok ? breakdown.value : null}
            error={breakdown.ok ? null : breakdown.message}
            window={windowKey}
            codeHref={(value) =>
              hrefWith({ [APPROVAL_PARAMS.code]: value, [APPROVAL_PARAMS.page]: null })
            }
            triageAction={recordApprovalReviewAction}
            returnTo={selfHref}
            resultSubject={resultSubject}
          />
        </Card>

        <Card
          title={approvalMessages.failureQueue.title}
          description={approvalMessages.failureQueue.description}
          flush
        >
          <FailedApprovalTable
            rows={queue.ok ? queue.value.rows : []}
            total={queue.ok ? queue.value.total : undefined}
            error={queue.ok ? null : queue.message}
            codeHref={(value) =>
              hrefWith({ [APPROVAL_PARAMS.code]: value, [APPROVAL_PARAMS.page]: null })
            }
            emptyMessage={
              isFiltered ? approvalMessages.failures.emptyFiltered : approvalMessages.failures.empty
            }
            emptyAction={
              isFiltered ? (
                <Link
                  href={hrefWith({
                    [APPROVAL_PARAMS.type]: null,
                    [APPROVAL_PARAMS.code]: null,
                    [APPROVAL_PARAMS.page]: null,
                  })}
                  className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
                >
                  {messages.filters.reset}
                </Link>
              ) : undefined
            }
          />
        </Card>

        {queue.ok ? (
          <Pager
            page={currentPage}
            pageCount={pageCount}
            hrefFor={(target) =>
              hrefWith({ [APPROVAL_PARAMS.page]: target > 1 ? String(target) : null })
            }
          />
        ) : null}

        <p className="text-[11px] text-faint">{approvalMessages.overview.privacyNote}</p>
      </div>
    </NavShell>
  )
}
