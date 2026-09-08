import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ASSIGNEE_ME,
  ASSIGNEE_UNASSIGNED,
  DUE_FILTER_OVERDUE,
  QueueTiles,
  STATUS_FILTER_ACTIVE,
  STATUS_FILTER_ALL,
  SUPPORT_PATH,
  TICKET_CATEGORIES,
  TICKET_DUE_FILTERS,
  TICKET_PAGE_SIZE,
  TICKET_PAGE_SIZES,
  TICKET_PARAMS,
  TICKET_PRIORITIES,
  TICKET_RESULT_PARAMS,
  TICKET_SORT_KEYS,
  TICKET_STATUS_FILTERS,
  TicketQueueTable,
  TicketResultBanner,
  adminLabel,
  isTicketOutcome,
  panelError,
  type TicketOutcome,
  type TicketSortKey,
  type TicketStatusFilter,
} from '@/components/tickets'
import {
  Filters,
  PageHeader,
  TABLE_PARAMS,
  parseColumnVisibility,
  parsePageSize,
  parseSort,
  type FilterControl,
} from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { messages } from '@/lib/messages'
import {
  ticketCategoryLabels,
  ticketMessages,
  ticketPriorityLabels,
  ticketStatusLabels,
} from '@/lib/messages/tickets'
import { parseOffsetPageRequest } from '@/lib/pagination'
import {
  TIME_WINDOWS,
  attempt,
  parseOptionalEnumParam,
  parseSearchParam,
  parseUuidParam,
  type RawSearchParams,
  type TimeWindow,
  resolveWindow,
} from '@/lib/queries/shared'
import {
  assigneeIdsOf,
  listTickets,
  loadAssignableAdmins,
  loadFirstResponseSummary,
  loadQueueStats,
  loadTicketAdmins,
  loadTicketSubjects,
  subjectIdsOf,
  type TicketAdmin,
  type TicketQueueFilters,
  type TicketQueueSort,
  type TicketSubject,
} from '@/lib/queries/tickets'

/**
 * The support queue.
 *
 * ---------------------------------------------------------------------------
 * THE DEFAULT VIEW IS A DECISION
 * ---------------------------------------------------------------------------
 *
 * Open and in progress, oldest first, overdue in red. That is what somebody
 * starting a shift needs on screen without touching a control, and every part
 * of it is deliberate: closed tickets are excluded so the page is not three
 * years of history; the order is oldest-first because the ticket that has
 * waited longest is the one to answer; and there is no date filter at all by
 * default, because a seven-day window would quietly hide an open ticket from
 * three weeks ago from the only person looking for it.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * The rows and the total are one bounded `select` and one `count(*)` over the
 * same filters, so the pager's "Sayfa 3 / 17" is the database's answer rather
 * than the length of the array on screen. Three of the tiles are `count(*)`s
 * over the whole queue; the fourth is a sampled median and says so underneath.
 * Nothing on this page is computed by fetching rows in order to count them.
 *
 * The loads are settled independently, so a view that is slow or missing costs
 * its own panel and the rest of the page still answers the shift's questions.
 *
 * ---------------------------------------------------------------------------
 * PRIVACY
 * ---------------------------------------------------------------------------
 *
 * `support_tickets` holds no address. The masked address in the user column is
 * joined in from `bo_users` for the rows on this page only, so neither the
 * table, the URL nor a screenshot of it carries an address. Nothing here can
 * reach mail, calendar or assistant content: the query module has no expression
 * that could.
 */

export const metadata: Metadata = { title: ticketMessages.queue.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

export default async function SupportQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  // Server-side, on every render. Hiding the menu entry is not what protects
  // this page; this line is.
  const session = await requirePermission('support.ticket.read')
  const params = await searchParams
  const clock = systemClock
  const now = clock.now()

  const status = parseOptionalEnumParam<TicketStatusFilter>(
    params,
    TICKET_PARAMS.status,
    TICKET_STATUS_FILTERS,
  )
  const priority = parseOptionalEnumParam(params, TICKET_PARAMS.priority, TICKET_PRIORITIES)
  const category = parseOptionalEnumParam(params, TICKET_PARAMS.category, TICKET_CATEGORIES)
  const due = parseOptionalEnumParam(params, TICKET_PARAMS.due, TICKET_DUE_FILTERS)
  const timeWindow = parseOptionalEnumParam(params, TICKET_PARAMS.window, TIME_WINDOWS)
  const reference = normaliseReference(parseSearchParam(params, TICKET_PARAMS.reference))
  const assignee = resolveAssignee(params, session.adminUserId)

  const sort = parseSort(firstOf(params, TABLE_PARAMS.sort), TICKET_SORT_KEYS)
  const size = parsePageSize(
    firstOf(params, TABLE_PARAMS.pageSize),
    TICKET_PAGE_SIZES,
    TICKET_PAGE_SIZE,
  )
  // The page number is clamped by the shared parser; the size is the one the
  // picker actually offers, so the pager's arithmetic and the query agree.
  const requested = parseOffsetPageRequest(params, size)
  const page = { page: requested.page, size, offset: (requested.page - 1) * size }

  const filters: TicketQueueFilters = {
    status,
    priority,
    category,
    assignedTo: assignee.adminUserId,
    unassignedOnly: assignee.unassignedOnly,
    reference,
    overdueBeforeIso: due === DUE_FILTER_OVERDUE ? now.toISOString() : null,
    fromIso: timeWindow === null ? null : resolveWindow(timeWindow, clock).fromIso,
    toIso: null,
  }

  const queueSort = toQueueSort(sort)

  const [queue, stats, firstResponse, assignable] = await Promise.all([
    attempt(() => listTickets({ filters, sort: queueSort, page })),
    attempt(() => loadQueueStats(clock)),
    attempt(() => loadFirstResponseSummary(clock)),
    // The people the assignee filter can name. A failed load leaves the "bana
    // atanan" and "atanmamış" options working rather than removing the control.
    attempt(() => loadAssignableAdmins()),
  ])

  const rows = queue.ok ? queue.data.rows : []

  // Two lookups for the whole page rather than one per row, and both return a
  // mask or a display name — never an address.
  const [admins, subjects] = await Promise.all([
    attempt(() => loadTicketAdmins(assigneeIdsOf(rows))),
    attempt(() => loadTicketSubjects(subjectIdsOf(rows))),
  ])

  const outcome = readOutcome(params)
  // Every link and every filter change drops the previous action's answer, so
  // a banner cannot outlive the state it was describing.
  const query = withoutResultParams(flatQuery(params))
  const isFiltered =
    status !== null ||
    priority !== null ||
    category !== null ||
    due !== null ||
    timeWindow !== null ||
    reference !== null ||
    assignee.raw !== null

  return (
    <>
      <PageHeader
        title={ticketMessages.queue.title}
        description={ticketMessages.queue.description}
        {...(timeWindow === null ? { meta: ticketMessages.queue.windowNote } : {})}
      >
        <Filters
          controls={filterControls(assignable.ok ? assignable.data : [])}
          values={query}
          resetParams={[TABLE_PARAMS.page, 'cursor']}
        />
      </PageHeader>

      {outcome === null ? null : (
        <TicketResultBanner
          outcome={outcome.outcome}
          reference={outcome.reference}
          dismissHref={dismissHref(query)}
        />
      )}

      <div className="flex flex-col gap-4">
        <QueueTiles
          stats={stats.ok ? stats.data : null}
          statsError={panelError(stats)}
          firstResponse={firstResponse.ok ? firstResponse.data : null}
          firstResponseError={panelError(firstResponse)}
        />

        <TicketQueueTable
          rows={rows}
          admins={admins.ok ? admins.data : EMPTY_ADMINS}
          subjects={subjects.ok ? subjects.data : EMPTY_SUBJECTS}
          total={queue.ok ? queue.data.total : 0}
          page={queue.ok ? queue.data.page : page.page}
          pageSize={size}
          sort={sort}
          hiddenColumns={parseColumnVisibility(firstOf(params, TABLE_PARAMS.columns))}
          location={{ path: SUPPORT_PATH, query }}
          error={panelError(queue)}
          filtered={isFiltered}
          {...(isFiltered
            ? {
                emptyAction: (
                  <Link
                    href={SUPPORT_PATH}
                    className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:text-ink"
                  >
                    {ticketMessages.queue.reset}
                  </Link>
                ),
              }
            : {})}
          clock={clock}
        />

        <p className="text-[11px] text-faint">{ticketMessages.queue.privacyNote}</p>
      </div>
    </>
  )
}

/** Stand-ins for a lookup that failed. The table renders its own fallbacks. */
const EMPTY_ADMINS: ReadonlyMap<string, TicketAdmin> = new Map<string, TicketAdmin>()
const EMPTY_SUBJECTS: ReadonlyMap<string, TicketSubject> = new Map<string, TicketSubject>()

// ---------------------------------------------------------------------------
// Query string
// ---------------------------------------------------------------------------

function firstOf(params: RawSearchParams, name: string): string | undefined {
  const raw = params[name]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0]
  return undefined
}

/**
 * Every parameter currently on the page, flattened.
 *
 * The table's sort, page and column links are built from this, so a link never
 * drops a filter it does not know about — and the filter bar is built from it
 * too, so changing a filter never drops the sort.
 */
function flatQuery(params: RawSearchParams): Readonly<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const first = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined
    if (first !== undefined && first !== '') out[key] = first
  }
  return out
}

/** The query with the last action's answer removed. */
function withoutResultParams(
  query: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = { ...query }
  for (const param of Object.values(TICKET_RESULT_PARAMS)) delete out[param]
  return out
}

function dismissHref(query: Readonly<Record<string, string>>): string {
  const search = new URLSearchParams(query).toString()
  return search === '' ? SUPPORT_PATH : `${SUPPORT_PATH}?${search}`
}

function readOutcome(
  params: RawSearchParams,
): { outcome: TicketOutcome; reference: string | null } | null {
  const raw = firstOf(params, TICKET_RESULT_PARAMS.outcome)
  if (raw === undefined || !isTicketOutcome(raw)) return null
  return { outcome: raw, reference: firstOf(params, TICKET_RESULT_PARAMS.reference) ?? null }
}

/**
 * The sort, narrowed back to the closed set it came from.
 *
 * `parseSort` already refuses anything outside `TICKET_SORT_KEYS` — the value
 * ends up in an `order by` — and this re-derives the literal type from the same
 * list rather than asserting one, so the two can never disagree.
 */
function toQueueSort(
  sort: { key: string; direction: 'asc' | 'desc' } | null,
): TicketQueueSort | null {
  if (sort === null) return null
  const key: TicketSortKey | undefined = TICKET_SORT_KEYS.find(
    (candidate) => candidate === sort.key,
  )
  if (key === undefined) return null
  return { key, ascending: sort.direction === 'asc' }
}

/** References are stored upper-case; an operator types them either way. */
function normaliseReference(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim().toUpperCase()
  return trimmed === '' ? null : trimmed
}

/**
 * The assignee filter, resolved.
 *
 * `me` becomes the caller's own `admin_users.id` on the server, so the filter
 * follows whoever is signed in rather than freezing an id into a shared link.
 */
function resolveAssignee(
  params: RawSearchParams,
  currentAdminUserId: string,
): { adminUserId: string | null; unassignedOnly: boolean; raw: string | null } {
  const raw = firstOf(params, TICKET_PARAMS.assignee) ?? null
  if (raw === null || raw === '') return { adminUserId: null, unassignedOnly: false, raw: null }
  if (raw === ASSIGNEE_ME) {
    return { adminUserId: currentAdminUserId, unassignedOnly: false, raw }
  }
  if (raw === ASSIGNEE_UNASSIGNED) {
    return { adminUserId: null, unassignedOnly: true, raw }
  }
  // Anything else has to be a real admin id. A malformed value filters on
  // nothing rather than reaching PostgREST.
  const uuid = parseUuidParam(params, TICKET_PARAMS.assignee)
  return { adminUserId: uuid, unassignedOnly: false, raw: uuid === null ? null : raw }
}

// ---------------------------------------------------------------------------
// The filter bar
//
// Every control writes a query parameter the server re-queries from. There is
// no client-side filtering of a list that was already fetched, and no control
// that only looks like it does something.
// ---------------------------------------------------------------------------

const WINDOW_LABELS: Readonly<Record<TimeWindow, string>> = Object.freeze({
  '24h': messages.range.last24h,
  '7d': messages.range.last7d,
  '30d': messages.range.last30d,
  '90d': messages.range.last90d,
})

function filterControls(assignable: readonly TicketAdmin[]): readonly FilterControl[] {
  return [
    {
      kind: 'select',
      param: TICKET_PARAMS.status,
      label: ticketMessages.queue.statusFilter,
      // The empty value is the shift default, not "every status" — so it is
      // labelled as what it actually shows.
      allLabel: ticketMessages.queue.statusDefault,
      options: TICKET_STATUS_FILTERS.map((value) => ({
        value,
        label: statusFilterLabel(value),
      })),
    },
    {
      kind: 'select',
      param: TICKET_PARAMS.priority,
      label: ticketMessages.queue.priorityFilter,
      options: TICKET_PRIORITIES.map((value) => ({ value, label: ticketPriorityLabels[value] })),
    },
    {
      kind: 'select',
      param: TICKET_PARAMS.category,
      label: ticketMessages.queue.categoryFilter,
      options: TICKET_CATEGORIES.map((value) => ({ value, label: ticketCategoryLabels[value] })),
    },
    {
      kind: 'select',
      param: TICKET_PARAMS.assignee,
      label: ticketMessages.queue.assigneeFilter,
      options: [
        { value: ASSIGNEE_ME, label: ticketMessages.queue.assigneeMine },
        { value: ASSIGNEE_UNASSIGNED, label: ticketMessages.queue.assigneeUnassigned },
        // Only admins who actually hold `support.ticket.write`, from
        // `bo_admin_permissions` — a filter cannot name somebody who could not
        // have been given the ticket in the first place.
        ...assignable.map((admin) => ({
          value: admin.adminUserId,
          label: adminLabel(admin),
        })),
      ],
    },
    {
      kind: 'select',
      param: TICKET_PARAMS.due,
      label: ticketMessages.columns.due,
      options: TICKET_DUE_FILTERS.map((value) => ({
        value,
        label: ticketMessages.values.overdue,
      })),
    },
    {
      kind: 'select',
      param: TICKET_PARAMS.window,
      label: ticketMessages.queue.windowFilter,
      allLabel: ticketMessages.queue.windowAll,
      options: TIME_WINDOWS.map((value) => ({ value, label: WINDOW_LABELS[value] })),
    },
    {
      kind: 'search',
      param: TICKET_PARAMS.reference,
      label: ticketMessages.queue.referenceFilter,
      placeholder: ticketMessages.queue.referencePlaceholder,
    },
  ]
}

function statusFilterLabel(value: TicketStatusFilter): string {
  if (value === STATUS_FILTER_ACTIVE) return ticketMessages.queue.statusActive
  if (value === STATUS_FILTER_ALL) return ticketMessages.queue.statusAll
  return ticketStatusLabels[value]
}
