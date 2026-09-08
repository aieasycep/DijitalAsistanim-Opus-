import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  DEFAULT_PROMPT_SORT,
  FeatureRosterTable,
  LIST_PARAMS,
  PROMPTS_NEW_PATH,
  PROMPTS_PATH,
  PROMPT_SORT_KEYS,
  PROMPT_STATUSES,
  PromptResultBanner,
  PromptTable,
  RESULT_PARAMS,
  firstParam,
  hrefWithQuery,
  isFiltered,
  isPromptSortKey,
  parsePromptListParams,
  promptListParamValues,
  toQueryRecord,
  withoutResultParams,
  type PromptSort,
} from '@/components/prompts'
import {
  Button,
  Card,
  Filters,
  PageHeader,
  StatGrid,
  StatTile,
  TABLE_PARAMS,
  parseColumnVisibility,
  parseSort,
} from '@/components/ui'
import { requirePermission, sessionCan } from '@/lib/auth'
import { formatCompact } from '@/lib/format'
import { messages } from '@/lib/messages'
import { promptMessages, promptStatusLabels } from '@/lib/messages/prompts'
import {
  ROSTER_MAX_PAGES,
  ROSTER_PAGE_SIZE,
  featuresWithoutActive,
  listPromptVersions,
  loadFeatureRoster,
  loadPromptAdmins,
  loadPromptSummary,
  settle,
  type PromptAdmin,
} from '@/lib/queries/prompts'

export const metadata: Metadata = { title: promptMessages.list.title }
export const dynamic = 'force-dynamic'

/**
 * Every prompt version the platform has, and — above it — the one that is
 * actually serving each feature.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `prompt.read`, checked server-side before anything renders. The sidebar entry
 * is a courtesy; this page refuses the same URL typed into the address bar.
 * `prompt.write` decides whether the "Yeni taslak" button is drawn — and only
 * that: the Server Actions ask the database again and audit the refusal.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Five `count=exact` HEAD requests against `bo_prompt_versions` — one per status
 * plus one for active versions that took no call in thirty days — and a bounded
 * fold over the same view's draft and active rows for the feature roster. The
 * version table itself is one page with the exact total beside it; the browser
 * is never handed the version table to sort or slice.
 *
 * The three loads are settled separately, so a summary that fails costs its own
 * panel and the list still renders. Neither the roster nor the table ever falls
 * through to the empty state on failure: "no prompt versions" and "the query
 * failed" are different sentences here, and confusing them would read as "no
 * feature has a prompt".
 */
export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('prompt.read')

  const raw = await searchParams
  const params = parsePromptListParams(raw)
  const clock = systemClock

  const parsedSort = parseSort(firstParam(raw, TABLE_PARAMS.sort), PROMPT_SORT_KEYS)
  const sort: PromptSort =
    parsedSort !== null && isPromptSortKey(parsedSort.key)
      ? { key: parsedSort.key, direction: parsedSort.direction }
      : DEFAULT_PROMPT_SORT

  const [summary, roster, list] = await Promise.all([
    settle(() => loadPromptSummary()),
    settle(() => loadFeatureRoster()),
    settle(async () => {
      const page = await listPromptVersions(params, sort)
      // A failed roster lookup must not take the table with it: the columns then
      // read "Bilinmiyor", which is true, rather than blanking the list.
      const admins = await loadPromptAdmins(
        page.rows.flatMap((row) => [row.created_by_admin_user_id, row.activated_by_admin_user_id]),
      ).catch(() => new Map<string, PromptAdmin>())
      return { page, admins }
    }),
  ])

  const query = toQueryRecord(raw)
  const values = { ...query, ...promptListParamValues(params) }
  const filtered = isFiltered(params)
  const canWrite = sessionCan(session, 'prompt.write')

  // This page's own address, carrying the current filters and nothing else. It
  // is where the result banner's dismiss link points and what the table's page
  // and sort links are built from, so an answer cannot outlive the navigation
  // that produced it.
  const tableQuery = withoutResultParams(query)
  const dismissHref = hrefWithQuery(PROMPTS_PATH, tableQuery)

  const missingActive = roster.ok ? featuresWithoutActive(roster.value) : null
  const featureCount = roster.ok ? roster.value.features.length : null

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: promptMessages.area.breadcrumb, href: '/ai' },
          { label: promptMessages.list.title },
        ]}
        title={promptMessages.list.title}
        description={promptMessages.list.description}
        meta={promptMessages.list.meta}
        action={
          canWrite ? (
            <Button asChild size="md" variant="primary">
              <Link href={PROMPTS_NEW_PATH}>{promptMessages.list.newDraft}</Link>
            </Button>
          ) : null
        }
      >
        <Filters
          controls={[
            {
              kind: 'select',
              param: LIST_PARAMS.status,
              label: promptMessages.filters.status,
              options: PROMPT_STATUSES.map((status) => ({
                value: status,
                label: promptStatusLabels[status],
              })),
            },
            {
              kind: 'search',
              param: LIST_PARAMS.q,
              label: promptMessages.filters.search,
              placeholder: promptMessages.filters.searchPlaceholder,
            },
          ]}
          values={values}
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <PromptResultBanner
          outcome={firstParam(raw, RESULT_PARAMS.outcome)}
          feature={firstParam(raw, RESULT_PARAMS.feature)}
          version={firstParam(raw, RESULT_PARAMS.version)}
          dismissHref={dismissHref}
        />

        {params.searchRejected ? (
          <p
            role="status"
            className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text"
          >
            {promptMessages.list.searchInvalid}
          </p>
        ) : null}

        {params.feature === null ? null : (
          <p className="text-[12px] text-muted">
            <span className="bo-kicker mr-1.5">{promptMessages.filters.feature}</span>
            <span className="font-mono text-ink">{params.feature}</span>
            <Link href={PROMPTS_PATH} className="ml-2 text-primary hover:underline">
              {promptMessages.filters.featureAll}
            </Link>
          </p>
        )}

        {!canWrite ? (
          <p className="text-[12px] text-faint">{promptMessages.list.noWritePermission}</p>
        ) : null}

        {summary.ok ? (
          <StatGrid>
            <StatTile
              label={promptMessages.tiles.features}
              hint={promptMessages.tiles.featuresHint}
              value={featureCount === null ? '—' : formatCompact(featureCount)}
            />
            <StatTile
              label={promptMessages.tiles.active}
              hint={promptMessages.tiles.activeHint}
              value={formatCompact(summary.value.active)}
              tone={summary.value.active > 0 ? 'primary' : 'neutral'}
              href={`${PROMPTS_PATH}?${LIST_PARAMS.status}=active`}
            />
            <StatTile
              label={promptMessages.tiles.drafts}
              hint={promptMessages.tiles.draftsHint}
              value={formatCompact(summary.value.draft)}
              tone={summary.value.draft > 0 ? 'info' : 'neutral'}
              href={`${PROMPTS_PATH}?${LIST_PARAMS.status}=draft`}
            />
            <StatTile
              label={promptMessages.tiles.idle}
              hint={promptMessages.tiles.idleHint}
              value={formatCompact(summary.value.idleActive)}
              tone={summary.value.idleActive > 0 ? 'warning' : 'neutral'}
              href={`${PROMPTS_PATH}?${LIST_PARAMS.status}=active`}
            />
          </StatGrid>
        ) : (
          <Card title={promptMessages.list.title}>
            <p role="alert" className="text-[12px] text-critical-text">
              {summary.message}
            </p>
          </Card>
        )}

        {missingActive !== null && missingActive > 0 ? (
          <p
            role="status"
            className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text"
          >
            {promptMessages.tiles.missing}: {formatCompact(missingActive)} —{' '}
            {promptMessages.tiles.missingHint}
          </p>
        ) : null}

        <Card
          title={promptMessages.roster.section}
          description={promptMessages.roster.description}
          flush
        >
          <FeatureRosterTable
            features={roster.ok ? roster.value.features : []}
            truncated={roster.ok ? roster.value.truncated : false}
            clock={clock}
            error={roster.ok ? null : roster.message}
            limit={ROSTER_PAGE_SIZE * ROSTER_MAX_PAGES}
          />
        </Card>

        <PromptTable
          rows={list.ok ? list.value.page.rows : []}
          total={list.ok ? list.value.page.total : 0}
          page={params.page}
          sort={sort}
          admins={list.ok ? list.value.admins : new Map<string, PromptAdmin>()}
          location={{ path: PROMPTS_PATH, query: tableQuery }}
          hiddenColumns={parseColumnVisibility(firstParam(raw, TABLE_PARAMS.columns))}
          clock={clock}
          error={list.ok ? null : list.message}
          emptyMessage={filtered ? promptMessages.list.emptyFiltered : promptMessages.list.empty}
          emptyAction={
            filtered ? (
              <Link
                href={PROMPTS_PATH}
                className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:text-ink"
              >
                {messages.filters.reset}
              </Link>
            ) : null
          }
          filtered={filtered}
        />
      </div>
    </>
  )
}
