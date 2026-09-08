import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AI_CEILING_PATH,
  AI_PARAMS,
  AI_PATH,
  AiTabs,
  CEILING_PAGE_SIZE,
  CEILING_SORTS,
  CapNote,
  CeilingTable,
  CeilingTiles,
  DEFAULT_CEILING_SORT,
  DEFAULT_SPEND_WINDOW,
  MIN_COST_OPTIONS,
  Pager,
  REVIEW_RESULT_PARAMS,
  RefreshForm,
  ReviewResultBanner,
  SPEND_WINDOWS,
  aiMessages,
  isCeilingSort,
  isMinCostOption,
  isReviewOutcome,
  isSpendWindowKey,
  type CeilingSort,
  type ReviewOutcome,
  type SpendWindowKey,
} from '@/components/ai'
import { Card, CardError, type FilterControl, Filters, PageHeader } from '@/components/ui'
import { requireStaff } from '@/lib/auth'
import { formatCostMicros } from '@/lib/format'
import { messages } from '@/lib/messages'
import { loadCeilingPage, loadCeilingSummary, settle, type CeilingQuery } from '@/lib/queries/ai'
import { recordQuotaReviewAction, refreshAiAction } from '../actions'

/**
 * Who is close to the model budget their plan actually enforces.
 *
 * The ordering, the threshold and the paging are all Postgres: the page asks
 * `bo_ai_spend` for twenty accounts in the chosen window — ordered by cost, or
 * by call count when the operator asks for it, because the ceiling is enforced
 * as a call count and the two orders surface different accounts — and gets the
 * exact total back beside them. It then asks `bo_users` about exactly those ids
 * for the plan each one is measured against, and `bo_audit` whether anyone has
 * already reviewed them, so an account a colleague triaged an hour ago does not
 * look untouched.
 *
 * The review control is the one thing in this area that writes. It changes
 * nothing about the account: it records which operator looked, what they
 * concluded and why, with the account's real spend at that moment, into
 * `audit_logs`. That row shows up in this table on the next render and in
 * `/denetim` alongside every other staff action.
 */

export const metadata: Metadata = { title: aiMessages.ceiling.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

function parseWindow(raw: string | string[] | undefined): SpendWindowKey {
  const value = firstValue(raw)
  return value !== null && isSpendWindowKey(value) ? value : DEFAULT_SPEND_WINDOW
}

/** Only the three offered floors are honoured; anything else means no floor. */
function parseMinCost(raw: string | string[] | undefined): number {
  const value = firstValue(raw)
  if (value === null) return 0
  const parsed = Number.parseInt(value, 10)
  return isMinCostOption(parsed) ? parsed : 0
}

function parseSort(raw: string | string[] | undefined): CeilingSort {
  const value = firstValue(raw)
  return value !== null && isCeilingSort(value) ? value : DEFAULT_CEILING_SORT
}

function parsePage(raw: string | string[] | undefined): number {
  const value = firstValue(raw)
  if (value === null) return 1
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function parseOutcome(raw: string | string[] | undefined): ReviewOutcome | null {
  const value = firstValue(raw)
  return value !== null && isReviewOutcome(value) ? value : null
}

const WINDOW_LABEL: Readonly<Record<SpendWindowKey, string>> = {
  '24s': aiMessages.ceiling.window24h,
  '7g': aiMessages.ceiling.window7d,
  '30g': aiMessages.ceiling.window30d,
}

const SORT_LABEL: Readonly<Record<CeilingSort, string>> = {
  maliyet: aiMessages.ceiling.sortByCost,
  cagri: aiMessages.ceiling.sortByEvents,
}

export default async function AiCeilingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireStaff('ops')
  const params = await searchParams

  const windowKey = parseWindow(params[AI_PARAMS.window])
  const minCostMicros = parseMinCost(params[AI_PARAMS.minCost])
  const sort = parseSort(params[AI_PARAMS.sort])
  const page = parsePage(params[AI_PARAMS.page])

  const outcome = parseOutcome(params[REVIEW_RESULT_PARAMS.outcome])
  const resultDecision = firstValue(params[REVIEW_RESULT_PARAMS.decision])
  const resultUser = firstValue(params[REVIEW_RESULT_PARAMS.user])

  const values: Record<string, string> = {
    [AI_PARAMS.window]: windowKey,
    [AI_PARAMS.minCost]: minCostMicros > 0 ? String(minCostMicros) : '',
    [AI_PARAMS.sort]: sort,
    [AI_PARAMS.page]: page > 1 ? String(page) : '',
  }
  const query = new URLSearchParams(
    Object.entries(values).filter(([, value]) => value !== ''),
  ).toString()
  const returnTo = query === '' ? AI_CEILING_PATH : `${AI_CEILING_PATH}?${query}`

  const ceilingQuery: CeilingQuery = {
    window: windowKey,
    minCostMicros,
    sort,
    limit: CEILING_PAGE_SIZE,
    offset: (page - 1) * CEILING_PAGE_SIZE,
  }

  const [rows, summary] = await Promise.all([
    settle(() => loadCeilingPage(ceilingQuery)),
    settle(() => loadCeilingSummary(ceilingQuery)),
  ])

  const controls: readonly FilterControl[] = [
    {
      kind: 'segmented',
      param: AI_PARAMS.window,
      label: aiMessages.ceiling.windowLabel,
      options: SPEND_WINDOWS.map((key) => ({ value: key, label: WINDOW_LABEL[key] })),
    },
    {
      kind: 'segmented',
      param: AI_PARAMS.sort,
      label: aiMessages.ceiling.sortLabel,
      options: CEILING_SORTS.map((key) => ({ value: key, label: SORT_LABEL[key] })),
    },
    {
      kind: 'select',
      param: AI_PARAMS.minCost,
      label: aiMessages.ceiling.minCostLabel,
      allLabel: aiMessages.ceiling.minCostAll,
      options: MIN_COST_OPTIONS.map((micros) => ({
        value: String(micros),
        label: formatCostMicros(micros),
      })),
    },
  ]

  return (
    <>
      <PageHeader
        title={aiMessages.ceiling.title}
        description={aiMessages.ceiling.description}
        action={<RefreshForm action={refreshAiAction} returnTo={returnTo} />}
      >
        <AiTabs current={AI_CEILING_PATH} />
        <Filters controls={controls} values={values} />
      </PageHeader>

      {outcome !== null ? (
        <ReviewResultBanner
          outcome={outcome}
          decision={resultDecision}
          userId={resultUser}
          dismissHref={returnTo}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <section>
          <h2 className="bo-kicker mb-2">{aiMessages.ceiling.sectionSummary}</h2>
          {summary.ok ? (
            <CeilingTiles
              summary={summary.value}
              entries={rows.ok ? rows.value.entries : []}
              windowLabel={WINDOW_LABEL[windowKey]}
              thresholdLabel={
                minCostMicros > 0
                  ? aiMessages.ceiling.minCostHint(formatCostMicros(minCostMicros))
                  : null
              }
            />
          ) : (
            <Card title={aiMessages.ceiling.sectionSummary}>
              <CardError message={summary.message} hint={messages.errors.queryFailedHint} />
            </Card>
          )}
        </section>

        <Card
          title={aiMessages.ceiling.tableSection}
          description={aiMessages.ceiling.tableDescription}
          action={<span className="text-[11px] text-faint">{WINDOW_LABEL[windowKey]}</span>}
          flush
        >
          <CeilingTable
            entries={rows.ok ? rows.value.entries : []}
            total={rows.ok ? rows.value.total : 0}
            windowKey={windowKey}
            windowLabel={WINDOW_LABEL[windowKey]}
            returnTo={returnTo}
            reviewAction={recordQuotaReviewAction}
            reopenUserId={outcome !== null && outcome !== 'recorded' ? resultUser : null}
            error={rows.ok ? null : rows.message}
            emptyAction={
              minCostMicros > 0 ? (
                <Link
                  href={`${AI_CEILING_PATH}?${AI_PARAMS.window}=${windowKey}`}
                  className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2"
                >
                  {aiMessages.ceiling.minCostAll}
                </Link>
              ) : (
                <Link
                  href={AI_PATH}
                  className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2"
                >
                  {aiMessages.spend.title}
                </Link>
              )
            }
          />

          {rows.ok ? (
            <div className="px-3 pb-2">
              <Pager
                basePath={AI_CEILING_PATH}
                values={values}
                page={page}
                pageSize={CEILING_PAGE_SIZE}
                total={rows.value.total}
              />
            </div>
          ) : null}
        </Card>

        <CapNote />
        <p className="text-[11px] text-faint">{aiMessages.area.provenance}</p>
      </div>
    </>
  )
}
