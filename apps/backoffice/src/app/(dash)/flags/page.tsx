import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
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
import {
  DEFAULT_FLAG_SORT,
  FLAGS_NEW_PATH,
  FLAGS_PATH,
  FLAG_PLANS,
  FLAG_PLATFORMS,
  FLAG_SORT_KEYS,
  FLAG_STATES,
  FlagResultBanner,
  FlagTable,
  LIST_PARAMS,
  RESULT_PARAMS,
  firstParam,
  flagListParamValues,
  hrefWithQuery,
  isFiltered,
  isFlagSortKey,
  parseFlagListParams,
  toQueryRecord,
  withoutResultParams,
  type FlagSort,
} from '@/components/flags'
import { requirePermission, sessionCan } from '@/lib/auth'
import { formatCompact } from '@/lib/format'
import { messages } from '@/lib/messages'
import {
  flagMessages,
  flagPlanLabels,
  flagPlatformLabels,
  flagStateLabels,
} from '@/lib/messages/flags'
import {
  listFlags,
  loadFlagAdmins,
  loadFlagSummary,
  settle,
  type FlagAdmin,
} from '@/lib/queries/flags'

export const metadata: Metadata = { title: flagMessages.list.title }
export const dynamic = 'force-dynamic'

/**
 * Every feature flag, with its real current state on the row.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `flags.read`, checked server-side before anything renders. The sidebar entry
 * is a courtesy; this page refuses the same URL typed into the address bar.
 * `flags.write` decides whether the create button is drawn — and only that: the
 * Server Actions ask the database again, and audit the refusal.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Four `count=exact` HEAD requests against `bo_feature_flags`, each over
 * `effective_state` — the column the view computes with the evaluator's own
 * expression — so a tile and the rows it links to are answering the same
 * question. The table itself is one bounded page with the exact total beside
 * it; the browser is never handed the flag table to sort or slice.
 *
 * The two loads are settled separately, so a summary that fails costs its own
 * panel and the list still renders. Neither ever falls through to the empty
 * state: "no flags" and "the query failed" are different sentences on this
 * screen, and confusing them would read as "nothing is being rolled out".
 */
export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('flags.read')

  const raw = await searchParams
  const params = parseFlagListParams(raw)
  const clock = systemClock

  const parsedSort = parseSort(firstParam(raw, TABLE_PARAMS.sort), FLAG_SORT_KEYS)
  const sort: FlagSort =
    parsedSort !== null && isFlagSortKey(parsedSort.key)
      ? { key: parsedSort.key, direction: parsedSort.direction }
      : DEFAULT_FLAG_SORT

  const [summary, list] = await Promise.all([
    settle(() => loadFlagSummary()),
    settle(async () => {
      const page = await listFlags(params, sort)
      // A failed name lookup must not take the table with it: the column then
      // reads "Bilinmiyor", which is true, rather than blanking the list.
      const admins = await loadFlagAdmins(
        page.rows.map((row) => row.updated_by_admin_user_id),
      ).catch(() => new Map<string, FlagAdmin>())
      return { page, admins }
    }),
  ])

  const query = toQueryRecord(raw)
  const values = { ...query, ...flagListParamValues(params) }
  const filtered = isFiltered(params)
  const canWrite = sessionCan(session, 'flags.write')

  // This page's own address, carrying the current filters and nothing else. It
  // is where the result banner's dismiss link points and what the table's page
  // and sort links are built from, so an answer cannot outlive the navigation
  // that produced it.
  const tableQuery = withoutResultParams(query)
  const dismissHref = hrefWithQuery(FLAGS_PATH, tableQuery)

  return (
    <>
      <PageHeader
        title={flagMessages.list.title}
        description={flagMessages.list.description}
        meta={flagMessages.list.meta}
        action={
          canWrite ? (
            <Button asChild size="md" variant="primary">
              <Link href={FLAGS_NEW_PATH}>{flagMessages.list.newFlag}</Link>
            </Button>
          ) : null
        }
      >
        <Filters
          controls={[
            {
              kind: 'select',
              param: LIST_PARAMS.state,
              label: flagMessages.filters.state,
              options: FLAG_STATES.map((state) => ({
                value: state,
                label: flagStateLabels[state],
              })),
            },
            {
              kind: 'select',
              param: LIST_PARAMS.platform,
              label: flagMessages.filters.platform,
              options: FLAG_PLATFORMS.map((platform) => ({
                value: platform,
                label: flagPlatformLabels[platform],
              })),
            },
            {
              kind: 'select',
              param: LIST_PARAMS.plan,
              label: flagMessages.filters.plan,
              options: FLAG_PLANS.map((plan) => ({
                value: plan,
                label: flagPlanLabels[plan],
              })),
            },
            {
              kind: 'search',
              param: LIST_PARAMS.q,
              label: flagMessages.filters.search,
              placeholder: flagMessages.filters.searchPlaceholder,
            },
          ]}
          values={values}
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <FlagResultBanner
          outcome={firstParam(raw, RESULT_PARAMS.outcome)}
          flagKey={firstParam(raw, RESULT_PARAMS.key)}
          dismissHref={dismissHref}
        />

        {params.searchRejected ? (
          <p
            role="status"
            className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text"
          >
            {flagMessages.list.searchInvalid}
          </p>
        ) : null}

        {params.platform !== null || params.plan !== null ? (
          <p className="text-[11px] text-faint">{flagMessages.filters.targetingNote}</p>
        ) : null}

        {!canWrite ? (
          <p className="text-[12px] text-faint">{flagMessages.list.noWritePermission}</p>
        ) : null}

        {summary.ok ? (
          <StatGrid>
            <StatTile
              label={flagMessages.tiles.total}
              hint={flagMessages.tiles.totalHint}
              value={formatCompact(summary.value.total)}
              href={FLAGS_PATH}
            />
            <StatTile
              label={flagMessages.tiles.on}
              hint={flagMessages.tiles.onHint}
              value={formatCompact(summary.value.on)}
              tone={summary.value.on > 0 ? 'primary' : 'neutral'}
              href={`${FLAGS_PATH}?${LIST_PARAMS.state}=on`}
            />
            <StatTile
              label={flagMessages.tiles.partial}
              hint={flagMessages.tiles.partialHint}
              value={formatCompact(summary.value.partial)}
              tone={summary.value.partial > 0 ? 'info' : 'neutral'}
              href={`${FLAGS_PATH}?${LIST_PARAMS.state}=partial`}
            />
            <StatTile
              label={flagMessages.tiles.killed}
              hint={flagMessages.tiles.killedHint}
              value={formatCompact(summary.value.killed)}
              tone={summary.value.killed > 0 ? 'critical' : 'neutral'}
              href={`${FLAGS_PATH}?${LIST_PARAMS.state}=killed`}
            />
          </StatGrid>
        ) : (
          <Card title={flagMessages.list.title}>
            <p role="alert" className="text-[12px] text-critical-text">
              {summary.message}
            </p>
          </Card>
        )}

        <FlagTable
          rows={list.ok ? list.value.page.rows : []}
          total={list.ok ? list.value.page.total : 0}
          page={params.page}
          sort={sort}
          admins={list.ok ? list.value.admins : new Map<string, FlagAdmin>()}
          location={{ path: FLAGS_PATH, query: tableQuery }}
          hiddenColumns={parseColumnVisibility(firstParam(raw, TABLE_PARAMS.columns))}
          clock={clock}
          error={list.ok ? null : list.message}
          emptyMessage={filtered ? flagMessages.list.emptyFiltered : flagMessages.list.empty}
          emptyAction={
            filtered ? (
              <Link
                href={FLAGS_PATH}
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
