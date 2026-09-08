import type { Metadata } from 'next'
import {
  AI_PARAMS,
  AI_QUALITY_PATH,
  AiTabs,
  BriefingQualityTable,
  BriefingTrendTable,
  CaptureQualityTable,
  DAY_WINDOWS,
  DEFAULT_DAY_WINDOW,
  DraftQualityTable,
  DraftTrendTable,
  QUALITY_TREND_DAYS,
  QualityTiles,
  RefreshForm,
  aiMessages,
  isDayWindowKey,
  type DayWindowKey,
} from '@/components/ai'
import { Card, Filters, PageHeader } from '@/components/ui'
import { requireStaff } from '@/lib/auth'
import {
  loadBriefingQuality,
  loadCaptureQuality,
  loadDraftQuality,
  loadDraftTrend,
  settle,
} from '@/lib/queries/ai'
import { refreshAiAction } from '../actions'

/**
 * Whether what the models produce is any good.
 *
 * The product's own thumbs-up/thumbs-down table, `ai_feedback`, carries a
 * free-text note and is keyed to the entity a user reacted to; no content-blind
 * aggregate view exists over it and this application may not add one. So the
 * page measures the verdict users give with their behaviour instead — a draft
 * refused, a briefing left unopened, a capture the model could not classify —
 * all of which are states and counts, and none of which requires reading a word
 * anybody wrote. The page says so in as many words, under the heading.
 *
 * Four queries, settled independently. The draft tables are exact `count(*)`s
 * over `bo_approvals` per action type; the briefing and capture tables fold
 * views that Postgres has already grouped by day and kind.
 */

export const metadata: Metadata = { title: aiMessages.quality.title }
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

export default async function AiQualityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireStaff('ops')
  const params = await searchParams
  const windowKey = parseWindow(params[AI_PARAMS.days])
  const dayCount = DAY_WINDOWS[windowKey]

  // The trend is a regression alarm, not a history: it stays short so it costs
  // two exact counts per day rather than sixty for a month nobody reads.
  const trendDays = Math.min(dayCount, QUALITY_TREND_DAYS)

  const values: Record<string, string> = { [AI_PARAMS.days]: windowKey }
  const query = new URLSearchParams(values).toString()
  const returnTo = query === '' ? AI_QUALITY_PATH : `${AI_QUALITY_PATH}?${query}`

  const [drafts, trend, briefings, captures] = await Promise.all([
    settle(() => loadDraftQuality(dayCount)),
    settle(() => loadDraftTrend(trendDays)),
    settle(() => loadBriefingQuality(dayCount)),
    settle(() => loadCaptureQuality(dayCount)),
  ])

  return (
    <>
      <PageHeader
        title={aiMessages.quality.title}
        description={aiMessages.quality.description}
        action={<RefreshForm action={refreshAiAction} returnTo={returnTo} />}
      >
        <AiTabs current={AI_QUALITY_PATH} />
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
        <p className="text-[12px] leading-snug text-muted">{aiMessages.quality.feedbackNote}</p>

        <section>
          <h2 className="bo-kicker mb-2">{aiMessages.quality.sectionSummary}</h2>
          <QualityTiles drafts={drafts} briefings={briefings} captures={captures} />
        </section>

        <Card
          title={aiMessages.quality.draftSection}
          description={aiMessages.quality.draftDescription}
          action={<span className="text-[11px] text-faint">{WINDOW_LABEL[windowKey]}</span>}
          flush
        >
          <DraftQualityTable
            rows={drafts.ok ? drafts.value : []}
            error={drafts.ok ? null : drafts.message}
          />
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title={aiMessages.quality.trendSection}
            description={aiMessages.quality.trendDescription}
            action={
              <span className="text-[11px] text-faint">
                {aiMessages.quality.trendWindow(trendDays)}
              </span>
            }
            flush
          >
            <DraftTrendTable
              rows={trend.ok ? trend.value : []}
              error={trend.ok ? null : trend.message}
            />
          </Card>

          <Card
            title={aiMessages.quality.briefingTrendSection}
            description={aiMessages.quality.briefingTrendDescription}
            action={<span className="text-[11px] text-faint">{WINDOW_LABEL[windowKey]}</span>}
            flush
          >
            <BriefingTrendTable
              rows={briefings.ok ? briefings.value.daily : []}
              error={briefings.ok ? null : briefings.message}
            />
          </Card>
        </div>

        <Card
          title={aiMessages.quality.briefingSection}
          description={aiMessages.quality.briefingDescription}
          flush
        >
          <BriefingQualityTable
            rows={briefings.ok ? briefings.value.byKind : []}
            error={briefings.ok ? null : briefings.message}
          />
        </Card>

        <Card
          title={aiMessages.quality.captureSection}
          description={aiMessages.quality.captureDescription}
          flush
        >
          <CaptureQualityTable
            rows={captures.ok ? captures.value : []}
            error={captures.ok ? null : captures.message}
          />
        </Card>

        <p className="text-[11px] text-faint">{aiMessages.area.provenance}</p>
      </div>
    </>
  )
}
