import 'server-only'

import { DAY_MS, MINUTE_MS, systemClock, type Clock } from '@da/domain'
import {
  ACTIVE_TICKET_STATUSES,
  FIRST_RESPONSE_SAMPLE_LIMIT,
  FIRST_RESPONSE_WINDOW_DAYS,
  QUEUE_TICKET_STATUSES,
  STATUS_FILTER_ACTIVE,
  STATUS_FILTER_ALL,
  SUBJECT_FAILURE_LIMIT,
  TICKET_AUDIT_LIMIT,
  TICKET_ENTITY_TYPE,
  TICKET_NOTE_LIMIT,
  type TicketCategory,
  type TicketPriority,
  type TicketSortKey,
  type TicketStatus,
  type TicketStatusFilter,
} from '@/components/tickets/contract'
import type {
  AdminRole,
  BoAccountRow,
  BoApprovalRow,
  BoAuditRow,
  BoUserDetailRow,
  SupportNoteTableRow,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketTableRow,
} from '@/lib/db'
import { buildOffsetPage, type OffsetPage, type OffsetPageRequest } from '@/lib/pagination'
import {
  compactFilters,
  countTable,
  countView,
  eqFilter,
  nullFilter,
  prefixFilter,
  queryTable,
  queryTableOne,
  queryView,
  queryViewOne,
  type ViewFilter,
  type ViewOrder,
} from './shared'

/**
 * Every read behind the support queue, in one module.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE MAY REACH, AND WHAT IT MAY NOT
 * ---------------------------------------------------------------------------
 *
 * Two sources, both bounded by `@/lib/db`'s type surface:
 *
 *   - `support_tickets` and `support_notes`, operator-owned tables from
 *     migration 0019. They hold what a user wrote *to support* and what support
 *     wrote back — the ticket itself — and nothing else. `support_tickets`
 *     stores no address at all: `subject_user_id` is the only link to a person,
 *     which is precisely why a ticket cannot become a shadow contact list.
 *   - the `bo_*` views, for everything about the person the ticket is about.
 *     `queryView` accepts only `BoViewName`, and 0017 guarantees those views
 *     have no content column to select, so there is no expression in this file
 *     that could reach a mail body, a calendar entry or an assistant message —
 *     not "does not", *could not*.
 *
 * The redacted address an operator needs in order to confirm they have the
 * right account comes from `bo_users.email_redacted`, joined here by user id at
 * render time and never copied into the ticket.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Counting happens in Postgres. `countTable` issues `count=exact` with
 * `head: true`, so the three queue tiles are three `count(*)`s over the
 * `(status, priority, created_at)` and `due_at` indexes 0019 declares, and no
 * ticket row crosses the wire to produce a number.
 *
 * The one measurement computed in the application is the first-response
 * median, and it says so on screen. `first_response_at - created_at` is not a
 * column, so Postgres cannot order by it and the `ORDER BY … OFFSET n LIMIT 1`
 * trick the approvals module uses for an exact percentile is unavailable. It is
 * measured instead over a bounded newest-first sample and reported beside the
 * exact total, so a partial sample is shown as partial rather than presented as
 * a fact.
 */

// ===========================================================================
// The vocabulary is the database's
//
// `contract.ts` re-declares the three ticket enums because it is imported by
// client components and `@/lib/db` is `server-only`. The aliases below are the
// proof that the two declarations still name the same members: each fails to
// compile the moment one side gains a member the other lacks, which `tsc
// --noEmit` checks on every CI run. They carry no runtime weight.
// ===========================================================================

type Covers<Narrow extends Wide, Wide> = Narrow

export type ConsoleStatusesExist = Covers<TicketStatus, SupportTicketStatus>
export type DatabaseStatusesAreLabelled = Covers<SupportTicketStatus, TicketStatus>
export type ConsolePrioritiesExist = Covers<TicketPriority, SupportTicketPriority>
export type DatabasePrioritiesAreLabelled = Covers<SupportTicketPriority, TicketPriority>
export type ConsoleCategoriesExist = Covers<TicketCategory, SupportTicketCategory>
export type DatabaseCategoriesAreLabelled = Covers<SupportTicketCategory, TicketCategory>

// ===========================================================================
// The columns the queue reads
//
// `body` and `resolution_note` are deliberately absent: a list of forty tickets
// does not need forty ticket bodies, and the narrowed row type below means the
// table physically cannot render one.
// ===========================================================================

const QUEUE_COLUMNS = [
  'id',
  'reference',
  'subject_user_id',
  'status',
  'priority',
  'category',
  'channel',
  'subject',
  'assigned_admin_user_id',
  'due_at',
  'first_response_at',
  'resolved_at',
  'closed_at',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof SupportTicketTableRow)[]

/** One row of the queue: the triage fields, without the correspondence. */
export type TicketListRow = Pick<SupportTicketTableRow, (typeof QUEUE_COLUMNS)[number]>

/** A staff member, as a ticket screen needs to name one. */
export interface TicketAdmin {
  adminUserId: string
  name: string | null
  emailRedacted: string | null
  role: AdminRole
  roleLabel: string
  isActive: boolean
}

/** The person a ticket is about: an id and a mask, never an address. */
export interface TicketSubject {
  userId: string
  emailRedacted: string | null
  emailDomain: string | null
  isDeleted: boolean
}

// ===========================================================================
// The queue
// ===========================================================================

export interface TicketQueueFilters {
  /**
   * `null` is the default queue — open and in progress — rather than "no
   * filter". `'all'` is the explicit every-status view an operator has to ask
   * for, so a shift never opens onto three years of closed tickets.
   */
  status: TicketStatusFilter | null
  priority: TicketPriority | null
  category: TicketCategory | null
  /** An `admin_users.id`, or null for no assignee filter. */
  assignedTo: string | null
  /** True to show only tickets nobody owns. Exclusive with `assignedTo`. */
  unassignedOnly: boolean
  /** A ticket reference prefix, e.g. `DA-0012`. */
  reference: string | null
  /**
   * Set to the render instant to show only tickets whose termin has passed.
   * The instant comes from the injected clock and is passed in rather than read
   * here, so the filter, the tile that counts it and the row highlight all
   * measure the same moment.
   */
  overdueBeforeIso: string | null
  /** Half-open window over `created_at`: `[fromIso, toIso)`. */
  fromIso: string | null
  toIso: string | null
}

export interface TicketQueueSort {
  key: TicketSortKey
  ascending: boolean
}

export interface TicketQueueRequest {
  filters: TicketQueueFilters
  /** Null applies the shift's default order: oldest first. */
  sort: TicketQueueSort | null
  page: OffsetPageRequest
}

function statusFilters(
  status: TicketQueueFilters['status'],
): readonly ViewFilter<SupportTicketTableRow>[] {
  if (status === STATUS_FILTER_ALL) return []
  if (status === STATUS_FILTER_ACTIVE) {
    return [{ column: 'status', op: 'in', value: ACTIVE_TICKET_STATUSES }]
  }
  if (status === null) return [{ column: 'status', op: 'in', value: QUEUE_TICKET_STATUSES }]
  return [{ column: 'status', op: 'eq', value: status }]
}

function queueFilters(filters: TicketQueueFilters): readonly ViewFilter<SupportTicketTableRow>[] {
  return [
    ...statusFilters(filters.status),
    ...compactFilters<SupportTicketTableRow>(
      eqFilter('priority', filters.priority),
      eqFilter('category', filters.category),
      eqFilter('assigned_admin_user_id', filters.assignedTo),
      filters.unassignedOnly ? nullFilter('assigned_admin_user_id', true) : null,
      // The reference is stored upper-case (`DA-001234`). `ilike` is
      // case-insensitive either way, and the pattern is anchored so the
      // comparison can still use `support_tickets_reference_key`.
      prefixFilter('reference', filters.reference),
      // A ticket with no termin is never late: `is_not null` says so
      // explicitly, because `due_at < now` on a null already excludes it and a
      // reader should not have to derive that from SQL's three-valued logic.
      filters.overdueBeforeIso === null ? null : nullFilter('due_at', false),
      filters.overdueBeforeIso === null
        ? null
        : { column: 'due_at', op: 'lt', value: filters.overdueBeforeIso },
      filters.fromIso === null ? null : { column: 'created_at', op: 'gte', value: filters.fromIso },
      // Half-open: a ticket created at exactly `to` belongs to the next window,
      // so two adjacent ranges partition the timeline instead of both claiming
      // the boundary row.
      filters.toIso === null ? null : { column: 'created_at', op: 'lt', value: filters.toIso },
    ),
  ]
}

/**
 * The order the rows come back in.
 *
 * With no explicit sort the queue is oldest-first, which is what a person on
 * shift needs: the ticket that has been waiting longest is the one at the top.
 * Every ordering ends on `id` so two tickets created in the same microsecond
 * cannot swap places between page one and page two.
 */
function queueOrder(sort: TicketQueueSort | null): readonly ViewOrder<SupportTicketTableRow>[] {
  if (sort === null) {
    return [
      { column: 'created_at', ascending: true },
      { column: 'id', ascending: true },
    ]
  }
  return [
    // `due_at` and `first_response_at` are nullable: a ticket with no termin,
    // and one that was never answered, sort last either way — "unknown" is not
    // an extreme of the measurement.
    { column: sort.key, ascending: sort.ascending, nullsFirst: false },
    { column: 'id', ascending: true },
  ]
}

/**
 * One page of the queue, with the exact total behind it.
 *
 * Two statements: a bounded `select` and a `count(*)` over the same filters.
 * The count is what the pager renders, so "Sayfa 3 / 17" is Postgres's answer
 * rather than the length of the array on screen.
 */
export async function listTickets(request: TicketQueueRequest): Promise<OffsetPage<TicketListRow>> {
  const filters = queueFilters(request.filters)
  const [rows, total] = await Promise.all([
    queryTable('support_tickets', {
      columns: QUEUE_COLUMNS,
      filters,
      order: queueOrder(request.sort),
      limit: request.page.size,
      offset: request.page.offset,
    }),
    countTable('support_tickets', filters),
  ])
  return buildOffsetPage<TicketListRow>(rows, total, request.page)
}

// ===========================================================================
// Naming the people on a row
// ===========================================================================

const NO_ADMINS: ReadonlyMap<string, TicketAdmin> = new Map()
const NO_SUBJECTS: ReadonlyMap<string, TicketSubject> = new Map()

/**
 * The staff rows for a set of admin ids, keyed by id.
 *
 * One request for a whole page rather than one per row, and it reads
 * `bo_admin_users` — where another admin's address is already redacted — rather
 * than `admin_users`, whose `email` column is in the clear.
 */
export async function loadTicketAdmins(
  adminUserIds: readonly string[],
): Promise<ReadonlyMap<string, TicketAdmin>> {
  const unique = [...new Set(adminUserIds)]
  if (unique.length === 0) return NO_ADMINS

  const rows = await queryView('bo_admin_users', {
    columns: ['admin_user_id', 'admin_name', 'email_redacted', 'role', 'role_label', 'is_active'],
    filters: [{ column: 'admin_user_id', op: 'in', value: unique }],
    limit: unique.length,
  })

  return new Map(
    rows.map((row) => [
      row.admin_user_id,
      {
        adminUserId: row.admin_user_id,
        name: row.admin_name,
        emailRedacted: row.email_redacted,
        role: row.role,
        roleLabel: row.role_label,
        isActive: row.is_active,
      },
    ]),
  )
}

/**
 * The redacted address for a set of user ids, keyed by id.
 *
 * This is the whole of the identity a ticket screen gets. `support_tickets`
 * stores no address, and this join produces the mask rather than the address,
 * so neither the table nor the URL an operator copies ever holds one.
 */
export async function loadTicketSubjects(
  userIds: readonly string[],
): Promise<ReadonlyMap<string, TicketSubject>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return NO_SUBJECTS

  const rows = await queryView('bo_users', {
    columns: ['user_id', 'email_redacted', 'email_domain', 'is_deleted'],
    filters: [{ column: 'user_id', op: 'in', value: unique }],
    limit: unique.length,
  })

  return new Map(
    rows.map((row) => [
      row.user_id,
      {
        userId: row.user_id,
        emailRedacted: row.email_redacted,
        emailDomain: row.email_domain,
        isDeleted: row.is_deleted,
      },
    ]),
  )
}

/** The assignee ids on a page of rows, with the nulls dropped. */
export function assigneeIdsOf(rows: readonly TicketListRow[]): readonly string[] {
  return rows
    .map((row) => row.assigned_admin_user_id)
    .filter((id): id is string => id !== null && id !== '')
}

/** The subject user ids on a page of rows, with the nulls dropped. */
export function subjectIdsOf(rows: readonly TicketListRow[]): readonly string[] {
  return rows
    .map((row) => row.subject_user_id)
    .filter((id): id is string => id !== null && id !== '')
}

// ===========================================================================
// The tiles
// ===========================================================================

export interface QueueStats {
  /** Tickets whose status is `open`. */
  open: number
  /** Open, in progress or waiting on the user, with nobody's name on them. */
  unassigned: number
  /** Past their termin and still not resolved or closed. */
  overdue: number
}

/**
 * The three counts a shift starts from, each a `count(*)` in Postgres.
 *
 * Deliberately unaffected by whatever the operator has narrowed the list to:
 * these describe the queue, not the current view, and the tiles say so. A tile
 * that silently followed the filters would make "0 gecikmiş" mean two different
 * things on two different screens.
 */
export async function loadQueueStats(clock: Clock = systemClock): Promise<QueueStats> {
  const nowIso = clock.now().toISOString()
  const [open, unassigned, overdue] = await Promise.all([
    countTable('support_tickets', [{ column: 'status', op: 'eq', value: 'open' }]),
    countTable('support_tickets', [
      { column: 'status', op: 'in', value: ACTIVE_TICKET_STATUSES },
      { column: 'assigned_admin_user_id', op: 'is', value: null },
    ]),
    countTable('support_tickets', [
      { column: 'status', op: 'in', value: ACTIVE_TICKET_STATUSES },
      { column: 'due_at', op: 'is_not', value: null },
      { column: 'due_at', op: 'lt', value: nowIso },
    ]),
  ])
  return { open, unassigned, overdue }
}

export interface FirstResponseSummary {
  /** Rows actually measured. */
  sampled: number
  /** Rows that exist in the window, counted by Postgres. */
  total: number
  truncated: boolean
  medianMinutes: number | null
  p90Minutes: number | null
  windowDays: number
}

/**
 * How long the first reply takes, over a bounded window.
 *
 * The duration is `first_response_at - created_at`, which is not a column, so
 * it cannot be ordered in Postgres and the exact-percentile trick used for
 * approval durations is unavailable. The honest alternative is what happens
 * here: the newest N answered tickets in the window are read — two timestamp
 * columns, nothing else — the median and the 90th percentile are computed from
 * them, and the exact population count comes back alongside so the tile can say
 * whether it measured all of it.
 */
export async function loadFirstResponseSummary(
  clock: Clock = systemClock,
): Promise<FirstResponseSummary> {
  const sinceIso = new Date(
    clock.now().getTime() - FIRST_RESPONSE_WINDOW_DAYS * DAY_MS,
  ).toISOString()

  const filters: readonly ViewFilter<SupportTicketTableRow>[] = [
    { column: 'created_at', op: 'gte', value: sinceIso },
    { column: 'first_response_at', op: 'is_not', value: null },
  ]

  const [rows, total] = await Promise.all([
    queryTable('support_tickets', {
      columns: ['created_at', 'first_response_at'],
      filters,
      order: { column: 'first_response_at', ascending: false },
      limit: FIRST_RESPONSE_SAMPLE_LIMIT,
    }),
    countTable('support_tickets', filters),
  ])

  const minutes: number[] = []
  for (const row of rows) {
    const elapsed = responseMinutes(row.created_at, row.first_response_at)
    if (elapsed !== null) minutes.push(elapsed)
  }
  minutes.sort((left, right) => left - right)

  return {
    sampled: rows.length,
    total,
    truncated: total > rows.length,
    medianMinutes: rankOf(minutes, 0.5),
    p90Minutes: rankOf(minutes, 0.9),
    windowDays: FIRST_RESPONSE_WINDOW_DAYS,
  }
}

/** Whole minutes between opening and the first reply, or null when unanswered. */
export function responseMinutes(createdAt: string, firstResponseAt: string | null): number | null {
  if (firstResponseAt === null) return null
  const delta = new Date(firstResponseAt).getTime() - new Date(createdAt).getTime()
  if (!Number.isFinite(delta) || delta < 0) return null
  return Math.round(delta / MINUTE_MS)
}

function rankOf(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))
  return sorted[index] ?? null
}

// ===========================================================================
// One ticket
// ===========================================================================

/** The whole row, correspondence included: this is the ticket itself. */
export async function loadTicket(ticketId: string): Promise<SupportTicketTableRow | null> {
  return queryTableOne('support_tickets', {
    filters: [{ column: 'id', op: 'eq', value: ticketId }],
  })
}

export interface TicketNotes {
  notes: readonly SupportNoteTableRow[]
  /** Exact count from Postgres, so the panel can say what it left out. */
  total: number
  truncated: boolean
}

/**
 * The note thread, oldest last so it reads as a conversation.
 *
 * Read newest-first and reversed here, because "the most recent hundred" is the
 * useful bound on a long-running ticket and PostgREST has no ordering that
 * counts from the end.
 */
export async function loadTicketNotes(ticketId: string): Promise<TicketNotes> {
  const filters: readonly ViewFilter<SupportNoteTableRow>[] = [
    { column: 'ticket_id', op: 'eq', value: ticketId },
  ]
  const [rows, total] = await Promise.all([
    queryTable('support_notes', {
      filters,
      order: [
        { column: 'created_at', ascending: false },
        { column: 'id', ascending: false },
      ],
      limit: TICKET_NOTE_LIMIT,
    }),
    countTable('support_notes', filters),
  ])
  return { notes: [...rows].reverse(), total, truncated: total > rows.length }
}

/**
 * Everything privileged that has happened to this ticket.
 *
 * `bo_audit` rows written by this module's own Server Actions, matched on the
 * `entity_type` / `entity_id` pair they set. It is the ticket's history in the
 * strict sense: nothing here was written by the page that renders it.
 */
export async function loadTicketHistory(ticketId: string): Promise<readonly BoAuditRow[]> {
  return queryView('bo_audit', {
    filters: [
      { column: 'entity_type', op: 'eq', value: TICKET_ENTITY_TYPE },
      { column: 'entity_id', op: 'eq', value: ticketId },
    ],
    order: { column: 'created_at', ascending: false },
    limit: TICKET_AUDIT_LIMIT,
  })
}

// ===========================================================================
// The subject user's operational context
//
// The question a ticket usually is: "is their side actually working?" Every
// answer below is a count, a status or a timestamp from a `bo_*` view. None of
// it is content, and none of it could be.
// ===========================================================================

export interface SubjectContext {
  detail: BoUserDetailRow | null
  accounts: readonly BoAccountRow[]
  /** Recent approvals that failed to execute — states and codes only. */
  failedApprovals: readonly BoApprovalRow[]
  /** Approvals still waiting on the user, counted by Postgres. */
  pendingApprovalCount: number
}

export async function loadSubjectContext(userId: string): Promise<SubjectContext> {
  const [detail, accounts, failedApprovals, pendingApprovalCount] = await Promise.all([
    queryViewOne('bo_user_detail', {
      filters: [{ column: 'user_id', op: 'eq', value: userId }],
    }),
    queryView('bo_accounts', {
      columns: [
        'account_id',
        'provider',
        'status',
        'is_primary',
        'kinds',
        'last_synced_at',
        'last_error_code',
        'last_error_at',
        'sync_error_count',
        'created_at',
      ],
      filters: [{ column: 'user_id', op: 'eq', value: userId }],
      order: [
        { column: 'is_primary', ascending: false },
        { column: 'created_at', ascending: true },
      ],
      limit: 10,
    }),
    queryView('bo_approvals', {
      columns: ['approval_id', 'type', 'status', 'failure_code', 'attempt_count', 'created_at'],
      filters: [
        { column: 'user_id', op: 'eq', value: userId },
        { column: 'status', op: 'eq', value: 'failed' },
      ],
      order: { column: 'created_at', ascending: false },
      limit: SUBJECT_FAILURE_LIMIT,
    }),
    countView('bo_approvals', [
      { column: 'user_id', op: 'eq', value: userId },
      { column: 'status', op: 'eq', value: 'pending' },
    ]),
  ])

  return { detail, accounts, failedApprovals, pendingApprovalCount }
}

// ===========================================================================
// Who a ticket may be assigned to
// ===========================================================================

/**
 * The admins a ticket may be handed to.
 *
 * Not "every admin": only those who actually hold `support.ticket.write`, read
 * from `bo_admin_permissions` — the same view `auth.ts` resolves a session's
 * permissions from — so the picker cannot offer somebody the server would then
 * refuse to let work the ticket. A disabled admin has no rows in that view at
 * all, which is how they drop out of the list without a second filter.
 */
export async function loadAssignableAdmins(): Promise<readonly TicketAdmin[]> {
  const holders = await queryView('bo_admin_permissions', {
    columns: ['admin_user_id'],
    filters: [{ column: 'permission', op: 'eq', value: 'support.ticket.write' }],
    limit: 500,
  })

  const ids = [...new Set(holders.map((row) => row.admin_user_id))]
  if (ids.length === 0) return []

  const rows = await queryView('bo_admin_users', {
    columns: [
      'admin_user_id',
      'admin_name',
      'email_redacted',
      'role',
      'role_rank',
      'role_label',
      'is_active',
    ],
    filters: [
      { column: 'admin_user_id', op: 'in', value: ids },
      { column: 'is_active', op: 'is', value: true },
    ],
    order: [
      { column: 'role_rank', ascending: false },
      { column: 'admin_name', ascending: true, nullsFirst: false },
    ],
    limit: ids.length,
  })

  return rows.map((row) => ({
    adminUserId: row.admin_user_id,
    name: row.admin_name,
    emailRedacted: row.email_redacted,
    role: row.role,
    roleLabel: row.role_label,
    isActive: row.is_active,
  }))
}

// ===========================================================================
// Derivations
// ===========================================================================

/** True when the ticket is past its termin and still somebody's problem. */
export function isOverdue(
  ticket: Pick<TicketListRow, 'due_at' | 'status'>,
  clock: Clock = systemClock,
): boolean {
  if (ticket.due_at === null) return false
  if (!(ACTIVE_TICKET_STATUSES as readonly string[]).includes(ticket.status)) return false
  return new Date(ticket.due_at).getTime() < clock.now().getTime()
}

/** Whole minutes the ticket has been open, from the injected clock. */
export function ageMinutes(createdAt: string, clock: Clock = systemClock): number {
  const delta = clock.now().getTime() - new Date(createdAt).getTime()
  return delta <= 0 ? 0 : Math.round(delta / MINUTE_MS)
}
