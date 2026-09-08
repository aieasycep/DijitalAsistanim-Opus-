import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ANNOUNCEMENTS_PATH,
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_LOCALES,
  ANNOUNCEMENT_NEW_PATH,
  ANNOUNCEMENT_PAGE_SIZE,
  ANNOUNCEMENT_PAGE_SIZES,
  ANNOUNCEMENT_PARAMS,
  ANNOUNCEMENT_RESULT_PARAMS,
  ANNOUNCEMENT_SORT_KEYS,
  ANNOUNCEMENT_STATE_FILTERS,
  AnnouncementTable,
  DISMISSIBLE_FILTERS,
  ResultBanner,
  panelError,
  type AnnouncementSortKey,
  type AnnouncementStateFilter,
  type DismissibleFilter,
} from '@/components/announcements'
import {
  Button,
  Filters,
  PageHeader,
  StatGrid,
  StatTile,
  TABLE_PARAMS,
  parseColumnVisibility,
  parsePageSize,
  parseSort,
  type FilterControl,
} from '@/components/ui'
import { requirePermission, sessionCan } from '@/lib/auth'
import { formatNumber } from '@/lib/format'
import {
  AUDIENCE_LABELS_TR,
  LOCALE_LABELS_TR,
  STATE_LABELS_TR,
  announcementMessages,
  isAnnouncementOutcome,
  type AnnouncementOutcome,
} from '@/lib/messages/announcements'
import { parseOffsetPageRequest } from '@/lib/pagination'
import {
  countAnnouncementStates,
  listAnnouncements,
  type AnnouncementListFilters,
} from '@/lib/queries/announcements'
import {
  attempt,
  parseOptionalEnumParam,
  parseSearchParam,
  type RawSearchParams,
} from '@/lib/queries/shared'

/**
 * The announcement list.
 *
 * ---------------------------------------------------------------------------
 * A DRAFT HAS TO READ AS A DRAFT
 * ---------------------------------------------------------------------------
 *
 * `published_at is null` is the whole safety property of this table, and it is
 * one nullable column away from "live". So the state is the second column, it
 * is a badge rather than a date, its tooltip is a sentence about what the state
 * means for the people using the app, and it is one of two columns an operator
 * cannot hide. The tiles above the table count the same five states with the
 * same predicates, so the row above and the row below cannot disagree.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Five `count(*)` head requests for the tiles and one bounded `select` plus one
 * `count(*)` for the table, all over the same predicates the filter bar writes
 * into the URL. Nothing on this page is computed by fetching rows in order to
 * count them, and the pager's page count is the database's answer rather than
 * the length of the array on screen.
 *
 * The two loads are settled independently: a tile row that could not be counted
 * costs its own panel and the table still answers "what is live right now".
 */

export const metadata: Metadata = { title: announcementMessages.list.title }
export const dynamic = 'force-dynamic'

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  // Server-side, on every render. Hiding the menu entry is not what protects
  // this page; this line is.
  const session = await requirePermission('announcement.read')
  const params = await searchParams
  const clock = systemClock
  const now = clock.now()
  const canWrite = sessionCan(session, 'announcement.write')

  const state = parseOptionalEnumParam<AnnouncementStateFilter>(
    params,
    ANNOUNCEMENT_PARAMS.state,
    ANNOUNCEMENT_STATE_FILTERS,
  )
  const audience = parseOptionalEnumParam(params, ANNOUNCEMENT_PARAMS.audience, [
    ...ANNOUNCEMENT_AUDIENCES,
  ])
  const locale = parseOptionalEnumParam(params, ANNOUNCEMENT_PARAMS.locale, [
    ...ANNOUNCEMENT_LOCALES,
  ])
  const dismissible = parseOptionalEnumParam<DismissibleFilter>(
    params,
    ANNOUNCEMENT_PARAMS.dismissible,
    DISMISSIBLE_FILTERS,
  )
  const titlePrefix = parseSearchParam(params, ANNOUNCEMENT_PARAMS.search)

  const sort = parseSort(firstOf(params, TABLE_PARAMS.sort), ANNOUNCEMENT_SORT_KEYS)
  const size = parsePageSize(
    firstOf(params, TABLE_PARAMS.pageSize),
    ANNOUNCEMENT_PAGE_SIZES,
    ANNOUNCEMENT_PAGE_SIZE,
  )
  const requested = parseOffsetPageRequest(params, size)
  const page = { page: requested.page, size, offset: (requested.page - 1) * size }

  const filters: AnnouncementListFilters = {
    state,
    audience,
    locale,
    dismissible,
    titlePrefix,
  }

  const [list, states] = await Promise.all([
    attempt(() =>
      listAnnouncements({
        filters,
        sort: toSort(sort),
        page,
        // The same instant the badges are computed against, so the filter and
        // the row it selected can never describe different states.
        nowIso: now.toISOString(),
      }),
    ),
    attempt(() => countAnnouncementStates(clock)),
  ])

  const outcome = readOutcome(params)
  const query = withoutResultParams(flatQuery(params))
  const isFiltered =
    state !== null ||
    audience !== null ||
    locale !== null ||
    dismissible !== null ||
    titlePrefix !== null

  const counts = states.ok ? states.data : null
  const statesError = panelError(states)

  return (
    <>
      <PageHeader
        title={announcementMessages.list.title}
        description={announcementMessages.list.description}
        action={
          canWrite ? (
            <Button asChild size="md" variant="primary">
              <Link href={ANNOUNCEMENT_NEW_PATH}>{announcementMessages.list.newAnnouncement}</Link>
            </Button>
          ) : null
        }
        {...(canWrite ? {} : { meta: announcementMessages.list.noWritePermission })}
      >
        <Filters
          controls={filterControls()}
          values={{
            [ANNOUNCEMENT_PARAMS.state]: state ?? '',
            [ANNOUNCEMENT_PARAMS.audience]: audience ?? '',
            [ANNOUNCEMENT_PARAMS.locale]: locale ?? '',
            [ANNOUNCEMENT_PARAMS.dismissible]: dismissible ?? '',
            [ANNOUNCEMENT_PARAMS.search]: titlePrefix ?? '',
          }}
          resetParams={[TABLE_PARAMS.page]}
        />
      </PageHeader>

      {outcome === null ? null : (
        <ResultBanner outcome={outcome} dismissHref={dismissHref(query)} />
      )}

      <div className="flex flex-col gap-4">
        {statesError === null ? (
          <StatGrid>
            <StatTile
              label={announcementMessages.tiles.draft}
              value={formatNumber(counts?.draft ?? 0)}
              hint={announcementMessages.tiles.draftHint}
              href={tileHref('draft')}
            />
            <StatTile
              label={announcementMessages.tiles.scheduled}
              value={formatNumber(counts?.scheduled ?? 0)}
              hint={announcementMessages.tiles.scheduledHint}
              tone="info"
              href={tileHref('scheduled')}
            />
            <StatTile
              label={announcementMessages.tiles.live}
              value={formatNumber(counts?.live ?? 0)}
              hint={announcementMessages.tiles.liveHint}
              tone="success"
              href={tileHref('live')}
            />
            <StatTile
              label={announcementMessages.tiles.openEnded}
              value={formatNumber(counts?.open_ended ?? 0)}
              hint={announcementMessages.tiles.openEndedHint}
              tone={counts !== null && counts.open_ended > 0 ? 'warning' : 'neutral'}
              href={tileHref('open_ended')}
            />
            <StatTile
              label={announcementMessages.tiles.ended}
              value={formatNumber(counts?.ended ?? 0)}
              hint={announcementMessages.tiles.endedHint}
              href={tileHref('ended')}
            />
          </StatGrid>
        ) : (
          <p
            role="alert"
            className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
          >
            {statesError}
          </p>
        )}

        <AnnouncementTable
          rows={list.ok ? list.data.rows : []}
          total={list.ok ? list.data.total : 0}
          page={list.ok ? list.data.page : page.page}
          pageSize={size}
          sort={sort}
          hiddenColumns={parseColumnVisibility(firstOf(params, TABLE_PARAMS.columns))}
          location={{ path: ANNOUNCEMENTS_PATH, query }}
          error={panelError(list)}
          filtered={isFiltered}
          now={now}
          {...(isFiltered
            ? {
                emptyAction: (
                  <Link
                    href={ANNOUNCEMENTS_PATH}
                    className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:text-ink"
                  >
                    {announcementMessages.list.reset}
                  </Link>
                ),
              }
            : {})}
        />

        <p className="text-[11px] text-faint">{announcementMessages.list.privacyNote}</p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Query string
// ---------------------------------------------------------------------------

function firstOf(params: RawSearchParams, name: string): string | undefined {
  const raw = params[name]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0]
  return undefined
}

/** Every parameter currently set, so a table link never drops a filter. */
function flatQuery(params: RawSearchParams): Readonly<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const first = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined
    if (first !== undefined && first !== '') out[key] = first
  }
  return out
}

function withoutResultParams(
  query: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = { ...query }
  for (const param of Object.values(ANNOUNCEMENT_RESULT_PARAMS)) delete out[param]
  return out
}

function dismissHref(query: Readonly<Record<string, string>>): string {
  const search = new URLSearchParams(query).toString()
  return search === '' ? ANNOUNCEMENTS_PATH : `${ANNOUNCEMENTS_PATH}?${search}`
}

/** A tile is a link into its own filter: the count and the list agree by URL. */
function tileHref(state: AnnouncementStateFilter): string {
  return `${ANNOUNCEMENTS_PATH}?${ANNOUNCEMENT_PARAMS.state}=${state}`
}

function readOutcome(params: RawSearchParams): AnnouncementOutcome | null {
  const raw = firstOf(params, ANNOUNCEMENT_RESULT_PARAMS.outcome)
  if (raw === undefined || !isAnnouncementOutcome(raw)) return null
  return raw
}

/**
 * The sort, narrowed back to the closed set it came from.
 *
 * `parseSort` already refuses anything outside `ANNOUNCEMENT_SORT_KEYS` — the
 * value ends up in an `order by` — and this re-derives the literal type from the
 * same list rather than asserting one, so the two cannot disagree.
 */
function toSort(
  sort: { key: string; direction: 'asc' | 'desc' } | null,
): { key: AnnouncementSortKey; ascending: boolean } | null {
  if (sort === null) return null
  const key = ANNOUNCEMENT_SORT_KEYS.find((candidate) => candidate === sort.key)
  if (key === undefined) return null
  return { key, ascending: sort.direction === 'asc' }
}

// ---------------------------------------------------------------------------
// The filter bar
//
// Every control writes a query parameter the server re-queries from. There is
// no client-side filtering of a list that was already fetched.
// ---------------------------------------------------------------------------

function filterControls(): readonly FilterControl[] {
  return [
    {
      kind: 'select',
      param: ANNOUNCEMENT_PARAMS.state,
      label: announcementMessages.list.stateFilter,
      options: ANNOUNCEMENT_STATE_FILTERS.map((value) => ({
        value,
        label: STATE_LABELS_TR[value],
      })),
    },
    {
      kind: 'select',
      param: ANNOUNCEMENT_PARAMS.audience,
      label: announcementMessages.list.audienceFilter,
      options: ANNOUNCEMENT_AUDIENCES.map((value) => ({
        value,
        label: AUDIENCE_LABELS_TR[value],
      })),
    },
    {
      kind: 'select',
      param: ANNOUNCEMENT_PARAMS.locale,
      label: announcementMessages.list.localeFilter,
      options: ANNOUNCEMENT_LOCALES.map((value) => ({ value, label: LOCALE_LABELS_TR[value] })),
    },
    {
      kind: 'segmented',
      param: ANNOUNCEMENT_PARAMS.dismissible,
      label: announcementMessages.list.dismissibleFilter,
      options: [
        { value: 'yes', label: announcementMessages.values.dismissibleYes },
        { value: 'no', label: announcementMessages.values.dismissibleNo },
      ],
    },
    {
      kind: 'search',
      param: ANNOUNCEMENT_PARAMS.search,
      label: announcementMessages.list.searchFilter,
      placeholder: announcementMessages.list.searchPlaceholder,
    },
  ]
}
