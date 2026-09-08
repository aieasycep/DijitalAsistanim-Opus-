import type { Metadata } from 'next'
import {
  AI_PARAMS,
  AI_PATH,
  AiTabs,
  BreakdownTable,
  DAY_WINDOWS,
  DEFAULT_DAY_WINDOW,
  DailySpendTable,
  RefreshForm,
  SpendTotalsTiles,
  SpenderTiles,
  TOP_SPENDER_LIMIT,
  TopSpenderTable,
  TriagePanel,
  aiMessages,
  isDayWindowKey,
  operationLabel,
  type DayWindowKey,
} from '@/components/ai'
import { Card, CardError, Filters, Mono, PageHeader } from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import {
  loadConnectedMailAccounts,
  loadSpendWindow,
  loadSpenderCounts,
  loadTopSpenders,
  settle,
} from '@/lib/queries/ai'
import { refreshAiAction } from './actions'

/**
 * What the platform spends on models, and on what.
 *
 * Four queries, each settled on its own so a failing view degrades its panel
 * instead of blanking the page. The window control is a server-side re-query:
 * the URL is the state, Postgres does the work, and a filtered view is a link
 * an operator can hand to a colleague.
 *
 * Every figure comes from `bo_ai_spend_daily` (buckets already grouped by day,
 * model and operation) or `bo_ai_spend` (one row per user). Neither contains a
 * column that could be widened into a prompt, a completion or an address —
 * `ai_usage_events` never held one.
 */

export const metadata: Metadata = { title: aiMessages.spend.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

function parseWindow(raw: string | string[] | undefined): DayWindowKey {
  const value = firstValue(raw)
  return value !== null && isDayWindowKey(value) ? value : DEFAULT_DAY_WINDOW
}

const WINDOW_LABEL: Readonly<Record<DayWindowKey, string>> = {
  '7g': aiMessages.spend.window7d,
  '30g': aiMessages.spend.window30d,
}

export default async function AiSpendPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePermission('ai.read')
  const params = await searchParams
  const windowKey = parseWindow(params[AI_PARAMS.days])
  const dayCount = DAY_WINDOWS[windowKey]

  const values: Record<string, string> = { [AI_PARAMS.days]: windowKey }
  const query = new URLSearchParams(values).toString()
  const returnTo = query === '' ? AI_PATH : `${AI_PATH}?${query}`

  const [spend, spenders, topSpenders, mailAccounts] = await Promise.all([
    settle(() => loadSpendWindow(dayCount)),
    settle(() => loadSpenderCounts()),
    settle(() => loadTopSpenders(windowKey, TOP_SPENDER_LIMIT)),
    settle(() => loadConnectedMailAccounts()),
  ])

  return (
    <>
      <PageHeader
        title={aiMessages.spend.title}
        description={aiMessages.spend.description}
        action={<RefreshForm action={refreshAiAction} returnTo={returnTo} />}
      >
        <AiTabs current={AI_PATH} />
        <Filters
          controls={[
            {
              kind: 'segmented',
              param: AI_PARAMS.days,
              label: aiMessages.spend.windowLabel,
              options: (Object.keys(DAY_WINDOWS) as DayWindowKey[]).map((key) => ({
                value: key,
                label: WINDOW_LABEL[key],
              })),
            },
          ]}
          values={values}
          resetParams={[]}
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <section>
          <h2 className="bo-kicker mb-2">{aiMessages.spend.sectionTotals}</h2>
          {spend.ok ? (
            <SpendTotalsTiles spend={spend.value} />
          ) : (
            <Card title={aiMessages.spend.sectionTotals}>
              <CardError message={spend.message} hint={messages.errors.queryFailedHint} />
            </Card>
          )}
        </section>

        {spenders.ok ? (
          <SpenderTiles counts={spenders.value} spend={spend.ok ? spend.value : null} />
        ) : (
          <Card title={aiMessages.spend.spenders24h}>
            <CardError message={spenders.message} hint={messages.errors.queryFailedHint} />
          </Card>
        )}

        {spend.ok && spend.value.truncated ? (
          <p className="text-[12px] text-warning-text">
            {aiMessages.spend.truncated(
              formatNumber(spend.value.rowsRead),
              formatNumber(spend.value.rowTotal),
            )}
          </p>
        ) : null}

        <Card
          title={aiMessages.spend.dailySection}
          description={aiMessages.spend.dailyDescription}
          action={<span className="text-[11px] text-faint">{WINDOW_LABEL[windowKey]}</span>}
          flush
        >
          <DailySpendTable
            rows={spend.ok ? spend.value.daily : []}
            error={spend.ok ? null : spend.message}
          />
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title={aiMessages.spend.modelSection}
            description={aiMessages.spend.modelDescription}
            flush
          >
            <BreakdownTable
              rows={spend.ok ? spend.value.models : []}
              totalCostMicros={spend.ok ? spend.value.current.costMicros : 0}
              labelFor={(key) => <Mono>{key}</Mono>}
              headerLabel={aiMessages.fields.model}
              emptyMessage={aiMessages.spend.modelEmpty}
              caption={aiMessages.spend.modelSection}
              error={spend.ok ? null : spend.message}
            />
          </Card>

          <Card
            title={aiMessages.spend.operationSection}
            description={aiMessages.spend.operationDescription}
            flush
          >
            <BreakdownTable
              rows={spend.ok ? spend.value.operations : []}
              totalCostMicros={spend.ok ? spend.value.current.costMicros : 0}
              labelFor={(key) => operationLabel(key)}
              headerLabel={aiMessages.fields.operation}
              emptyMessage={aiMessages.spend.operationEmpty}
              caption={aiMessages.spend.operationSection}
              error={spend.ok ? null : spend.message}
            />
          </Card>
        </div>

        <Card title={aiMessages.triage.section} description={aiMessages.triage.description}>
          {spend.ok ? (
            <TriagePanel
              spend={spend.value}
              mailAccounts={mailAccounts.ok ? mailAccounts.value : null}
              mailAccountsError={mailAccounts.ok ? null : mailAccounts.message}
            />
          ) : (
            <CardError message={spend.message} hint={messages.errors.queryFailedHint} />
          )}
        </Card>

        <Card
          title={aiMessages.spend.topSection}
          description={aiMessages.spend.topDescription}
          action={<span className="text-[11px] text-faint">{WINDOW_LABEL[windowKey]}</span>}
          flush
        >
          <TopSpenderTable
            rows={topSpenders.ok ? topSpenders.value : []}
            windowLabel={WINDOW_LABEL[windowKey]}
            error={topSpenders.ok ? null : topSpenders.message}
          />
        </Card>

        <p className="text-[11px] text-faint">{aiMessages.area.provenance}</p>
      </div>
    </>
  )
}
