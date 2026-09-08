import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AdminBudgetTable,
  BILLING_PATH,
  DEFAULT_GRANT_SORT,
  GRANTS_NEW_PATH,
  GRANTS_PATH,
  GRANT_KINDS,
  GRANT_SORT_KEYS,
  GRANT_STATUSES,
  GrantResultBanner,
  GrantTable,
  LIST_PARAMS,
  RANGE_PARAM_NAMES,
  RESULT_PARAMS,
  adminLabel,
  firstParam,
  grantListParamValues,
  hrefWithQuery,
  isFiltered,
  isGrantSortKey,
  parseGrantListParams,
  toQueryRecord,
  withoutResultParams,
  type GrantSort,
} from '@/components/grants'
import {
  Button,
  Card,
  DateRangePicker,
  type FilterControl,
  Filters,
  PageHeader,
  StatGrid,
  StatTile,
  TABLE_PARAMS,
  parseColumnVisibility,
  parseSort,
  resolveRange,
  withParams,
} from '@/components/ui'
import { requirePermission, sessionCan } from '@/lib/auth'
import { formatCompact, formatDate } from '@/lib/format'
import { messages } from '@/lib/messages'
import { grantKindLabels, grantMessages, grantStatusLabels } from '@/lib/messages/grants'
import {
  listGrants,
  loadGrantAdmins,
  loadGrantPictures,
  loadGrantingAdminIds,
  loadLiveExposure,
  loadPeriodBudget,
  loadRevocationReasons,
  settle,
  type GrantAdmin,
  type GrantPicture,
} from '@/lib/queries/grants'

export const metadata: Metadata = { title: grantMessages.list.title }
export const dynamic = 'force-dynamic'

/**
 * Every temporary Pro grant an operator has issued.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `billing.read`, checked server-side before anything renders. The sidebar
 * entry is a courtesy; this page refuses the same URL typed into the address
 * bar. `billing.grant` decides whether the "Yeni tanım" button is drawn and
 * `billing.revoke` whether a revoke control appears on a detail page — and only
 * that: the Server Actions ask the database again at the moment of acting, and
 * audit the refusal.
 *
 * An `analyst` holds `billing.read` and a redaction level of `aggregate`. They
 * see every number on this page and no account identifier at all: the column
 * says so rather than rendering a blank cell.
 *
 * ---------------------------------------------------------------------------
 * WHAT EACH NUMBER IS, AND OVER WHAT
 * ---------------------------------------------------------------------------
 *
 * Two of the tiles are "right now" and two are "over the chosen window", and
 * the tiles say which they are because mixing the two is how a budget report
 * becomes unreadable:
 *
 *   - **Yürürlükteki tanım** — an exact `count(*)` over `bo_entitlement_grants`
 *     where `is_live`, the view's own predicate. All time, unaffected by the
 *     filters or by the range.
 *   - **Bekleyen Pro günü** — the sum of `days_remaining` over those same
 *     grants. A sum needs rows, so it is computed over a bounded page and the
 *     tile says whether that page was the whole population.
 *   - **Dönemde tanımlanan** — an exact `count(*)` with `granted_at` inside the
 *     half-open window `resolveRange()` produced.
 *   - **Dönemde verilen gün** — the sum of `days` over that same window, with
 *     the same bounded-page caveat.
 *
 * The list below is all-time and filter-driven; it is deliberately *not*
 * narrowed by the range, so a grant issued four months ago and still running
 * cannot disappear from a screen whose first tile is counting it.
 *
 * Six loads, settled independently, so a panel that fails costs its own panel
 * and nothing else. None of them ever falls through to the empty state: "no
 * grants" and "the query failed" are different sentences here, and confusing
 * them would read as "nobody is giving Pro away" on the screen whose job is to
 * say whether they are.
 */
export default async function GrantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('billing.read')

  const raw = await searchParams
  const params = parseGrantListParams(raw)
  const clock = systemClock

  const query = toQueryRecord(raw)
  const range = resolveRange(query, { clock, fallback: '30d', params: RANGE_PARAM_NAMES })

  const parsedSort = parseSort(firstParam(raw, TABLE_PARAMS.sort), GRANT_SORT_KEYS)
  const sort: GrantSort =
    parsedSort !== null && isGrantSortKey(parsedSort.key)
      ? { key: parsedSort.key, direction: parsedSort.direction }
      : DEFAULT_GRANT_SORT

  const [exposure, budget, list, grantingAdmins] = await Promise.all([
    settle(() => loadLiveExposure()),
    settle(() => loadPeriodBudget({ fromIso: range.fromIso, toIso: range.toIso })),
    settle(async () => {
      const page = await listGrants(params, sort)
      const userIds = page.rows.map((row) => row.user_id)
      const grantIds = page.rows.map((row) => row.grant_id)
      // Three lookups the table needs, each of which may fail on its own
      // without taking the rows with it: a missing name reads as "Bilinmiyor",
      // a missing entitlement picture as "kaynak karşılaştırması yapılamıyor",
      // a missing revocation reason as "gerekçe okunamadı". None of them may
      // blank the list.
      const [pictures, reasons] = await Promise.all([
        loadGrantPictures(userIds, clock).catch(() => null),
        loadRevocationReasons(grantIds).catch(() => new Map<string, string | null>()),
      ])
      return { page, pictures, reasons }
    }),
    settle(() => loadGrantingAdminIds()),
  ])

  // Every admin id any panel on this page needs, resolved to a name in one
  // request rather than one per row.
  const adminIds = [
    ...(list.ok ? list.value.page.rows.map((row) => row.granted_by_admin_user_id) : []),
    ...(budget.ok ? budget.value.perAdmin.map((tally) => tally.adminUserId) : []),
    ...(grantingAdmins.ok ? grantingAdmins.value : []),
    ...(params.admin === null ? [] : [params.admin]),
  ]
  const admins = await loadGrantAdmins(adminIds).catch(() => new Map<string, GrantAdmin>())

  const filtered = isFiltered(params)
  const canGrant = sessionCan(session, 'billing.grant')
  const canSeeAccounts = session.redactionLevel === 'metadata'

  // This page's own address, carrying the current filters and the current
  // window and nothing else. It is where the result banner's dismiss link
  // points, what the filter bar writes back into, and what the table's page and
  // sort links are built from — so an answer cannot outlive the navigation that
  // produced it and get re-announced on every page turn.
  const tableQuery = withoutResultParams(query)
  const location = { path: GRANTS_PATH, query: tableQuery }
  const dismissHref = hrefWithQuery(GRANTS_PATH, tableQuery)
  const values = { ...tableQuery, ...grantListParamValues(params) }

  /** The all-time live list: the population the first two tiles count. */
  const liveHref = withParams(location, {
    [LIST_PARAMS.status]: 'live',
    [LIST_PARAMS.page]: null,
    [RANGE_PARAM_NAMES.range]: null,
    [RANGE_PARAM_NAMES.from]: null,
    [RANGE_PARAM_NAMES.to]: null,
  })

  // The admin filter offers the operators who have actually issued a grant. The
  // one currently selected is always included even when it is older than the
  // bounded lookup — otherwise a shared link would render a select whose value
  // matches none of its options, which browsers draw as blank.
  const adminOptionIds = [
    ...new Set([
      ...(grantingAdmins.ok ? grantingAdmins.value : []),
      ...(params.admin === null ? [] : [params.admin]),
    ]),
  ]
  const adminOptions = adminOptionIds.map((adminUserId) => ({
    value: adminUserId,
    label: adminLabel(admins.get(adminUserId), grantMessages.period.unknownAdmin),
  }))

  const controls: FilterControl[] = [
    {
      kind: 'segmented',
      param: LIST_PARAMS.status,
      label: grantMessages.filters.status,
      options: GRANT_STATUSES.map((value) => ({ value, label: grantStatusLabels[value] })),
    },
    {
      kind: 'select',
      param: LIST_PARAMS.kind,
      label: grantMessages.filters.kind,
      options: GRANT_KINDS.map((value) => ({ value, label: grantKindLabels[value] })),
    },
    // Rendered only when there is somebody to filter by: a select whose only
    // entry is "all" is a control that cannot change anything.
    ...(adminOptions.length > 0
      ? [
          {
            kind: 'select' as const,
            param: LIST_PARAMS.admin,
            label: grantMessages.filters.admin,
            allLabel: grantMessages.filters.adminAll,
            options: adminOptions,
          },
        ]
      : []),
  ]

  const periodHint = grantMessages.tiles.periodHint(
    formatDate(range.fromDate),
    formatDate(range.toDate),
  )

  return (
    <>
      <PageHeader
        title={grantMessages.list.title}
        description={grantMessages.list.description}
        breadcrumbs={[
          { label: grantMessages.area.breadcrumbBilling, href: BILLING_PATH },
          { label: grantMessages.area.breadcrumbGrants },
        ]}
        meta={grantMessages.list.meta}
        action={
          canGrant ? (
            <Button asChild size="md" variant="primary">
              <Link href={GRANTS_NEW_PATH}>{grantMessages.list.newGrant}</Link>
            </Button>
          ) : null
        }
      >
        <Filters controls={controls} values={values} />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <GrantResultBanner
          outcome={firstParam(raw, RESULT_PARAMS.outcome)}
          grantId={firstParam(raw, RESULT_PARAMS.grant)}
          dismissHref={dismissHref}
        />

        {!canGrant ? (
          <p className="text-[12px] text-faint">{grantMessages.list.noGrantPermission}</p>
        ) : null}

        <StatGrid>
          {exposure.ok ? (
            <>
              <StatTile
                label={grantMessages.tiles.live}
                hint={grantMessages.tiles.liveHint}
                value={formatCompact(exposure.value.liveCount)}
                tone={exposure.value.liveCount > 0 ? 'primary' : 'neutral'}
                href={liveHref}
              />
              <StatTile
                label={grantMessages.tiles.outstanding}
                hint={
                  exposure.value.exact
                    ? grantMessages.tiles.outstandingHint
                    : grantMessages.tiles.outstandingSampled(
                        exposure.value.sampleSize,
                        exposure.value.liveCount,
                      )
                }
                value={formatCompact(exposure.value.outstandingDays)}
                tone={exposure.value.outstandingDays > 0 ? 'warning' : 'neutral'}
                href={liveHref}
              />
            </>
          ) : (
            <TileError message={exposure.message} label={grantMessages.tiles.live} />
          )}

          {budget.ok ? (
            <>
              <StatTile
                label={grantMessages.tiles.issued}
                hint={periodHint}
                value={formatCompact(budget.value.issuedCount)}
              />
              <StatTile
                label={grantMessages.tiles.issuedDays}
                hint={
                  budget.value.exact
                    ? periodHint
                    : grantMessages.tiles.periodSampled(
                        budget.value.sampleSize,
                        budget.value.issuedCount,
                      )
                }
                value={formatCompact(budget.value.issuedDays)}
              />
            </>
          ) : (
            <TileError message={budget.message} label={grantMessages.tiles.issued} />
          )}
        </StatGrid>

        <section className="flex flex-col gap-2">
          <h2 className="bo-kicker">{grantMessages.period.section}</h2>
          <DateRangePicker
            location={location}
            range={range}
            params={RANGE_PARAM_NAMES}
            // A window change does not change what the list shows, so the
            // list's page must not be reset out from under the operator.
            resetParams={[]}
            label={grantMessages.period.rangeLabel}
          />
          <p className="text-[11px] text-faint">{grantMessages.period.rangeNote}</p>
          <Card
            title={grantMessages.period.tableTitle}
            description={grantMessages.period.description}
            flush
          >
            <AdminBudgetTable
              budget={budget.ok ? budget.value : null}
              admins={admins}
              error={budget.ok ? null : budget.message}
            />
          </Card>
        </section>

        <GrantTable
          rows={list.ok ? list.value.page.rows : []}
          total={list.ok ? list.value.page.total : 0}
          page={params.page}
          sort={sort}
          admins={admins}
          pictures={
            list.ok && list.value.pictures !== null
              ? list.value.pictures
              : new Map<string, GrantPicture>()
          }
          pictureError={list.ok && list.value.pictures === null}
          revocationReasons={list.ok ? list.value.reasons : new Map<string, string | null>()}
          canSeeAccounts={canSeeAccounts}
          location={location}
          hiddenColumns={parseColumnVisibility(firstParam(raw, TABLE_PARAMS.columns))}
          clock={clock}
          error={list.ok ? null : list.message}
          emptyMessage={filtered ? grantMessages.list.emptyFiltered : grantMessages.list.empty}
          emptyAction={
            filtered ? (
              <Link
                href={GRANTS_PATH}
                className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:text-ink"
              >
                {messages.filters.reset}
              </Link>
            ) : null
          }
          filtered={filtered}
        />

        <p className="max-w-prose text-[11px] text-faint">{grantMessages.truth.resolverNote}</p>
      </div>
    </>
  )
}

/**
 * A tile whose query failed.
 *
 * It occupies the same cell so the grid does not reflow, and it says the number
 * is missing rather than showing a zero — a zero here would read as "nothing
 * outstanding", which is the most expensive thing this page could get wrong.
 */
function TileError({ message, label }: { message: string; label: string }) {
  return (
    <div role="alert" className="bo-panel col-span-2 px-3 py-2.5">
      <span className="bo-kicker">{label}</span>
      <p className="mt-1 text-[12px] text-critical-text">{message}</p>
    </div>
  )
}
