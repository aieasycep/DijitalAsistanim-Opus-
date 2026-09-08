/**
 * The wire contract between the support queue's routes, its forms and its
 * Server Actions.
 *
 * A `'use server'` module may export nothing but async functions, and a client
 * form cannot import from one without dragging the action's module graph —
 * and with it `@/lib/db` and the service-role key — across the client
 * boundary. So every name both sides have to agree on lives here, in a plain
 * module with no imports at all: route paths, query parameters, form field
 * names, the vocabulary the enums use, and the tokens an action reports back.
 * Getting one of these strings wrong is then a type error rather than a form
 * that silently posts a field nobody reads.
 *
 * The four enum vocabularies below mirror the Postgres enums `support_ticket_status`,
 * `support_ticket_priority`, `support_ticket_category` and the `channel` check
 * constraint in migration 0019. They are re-declared rather than imported
 * because `@/lib/db` is `server-only`; `@/lib/queries/tickets.ts` carries a
 * compile-time proof that the two declarations still name the same members, so
 * a member added to the database without being added here fails `tsc`.
 */

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** The queue. Requires `support.ticket.read`. */
export const SUPPORT_PATH = '/support'

/** One ticket. Requires `support.ticket.read`. */
export function ticketPath(ticketId: string): string {
  return `${SUPPORT_PATH}/${ticketId}`
}

/** Where a Server Action may send an operator back to. Checked, not trusted. */
export const TICKET_RETURN_PREFIX = SUPPORT_PATH

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_user',
  'resolved',
  'closed',
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_CATEGORIES = [
  'account',
  'integration',
  'sync',
  'billing',
  'ai_quality',
  'notification',
  'privacy',
  'other',
] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

export const TICKET_CHANNELS = ['in_app', 'email', 'store_review', 'internal', 'phone'] as const
export type TicketChannel = (typeof TICKET_CHANNELS)[number]

/**
 * The ticket is still somebody's problem.
 *
 * The same three members migration 0019 uses in `support_tickets_open_due_idx`
 * and in `bo_support_ticket_stats.overdue_count`, so "overdue" means the same
 * thing on this screen as it does in the database's own aggregate.
 */
export const ACTIVE_TICKET_STATUSES = ['open', 'in_progress', 'waiting_user'] as const

/** The default queue: what a person starting a shift has to work through. */
export const QUEUE_TICKET_STATUSES = ['open', 'in_progress'] as const

/**
 * The working statuses an operator may move a ticket between directly.
 * `resolved` is reached through the resolve action, which demands a resolution
 * note; leaving `resolved` or `closed` is reached through reopen.
 */
export const WORKING_TICKET_STATUSES = ['open', 'in_progress', 'waiting_user'] as const

/** Statuses a ticket can be reopened from. */
export const REOPENABLE_TICKET_STATUSES = ['resolved', 'closed'] as const

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value)
}

export function isTicketPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value)
}

export function isTicketCategory(value: string): value is TicketCategory {
  return (TICKET_CATEGORIES as readonly string[]).includes(value)
}

export function isActiveStatus(status: TicketStatus): boolean {
  return (ACTIVE_TICKET_STATUSES as readonly string[]).includes(status)
}

export function isReopenable(status: TicketStatus): boolean {
  return (REOPENABLE_TICKET_STATUSES as readonly string[]).includes(status)
}

// ---------------------------------------------------------------------------
// Queue query string
//
// English, like the route segments and like the table kit's own `page`, `size`,
// `sort` and `cols`. A screen whose parameters were half Turkish and half
// English would be a screen where nobody remembers which half a name is in.
// ---------------------------------------------------------------------------

export const TICKET_PARAMS = {
  status: 'status',
  priority: 'priority',
  category: 'category',
  assignee: 'assignee',
  reference: 'ref',
  /** Termin. Absent means no termin filter; `overdue` means only late ones. */
  due: 'due',
  /**
   * Opening-time window. Absent means no date filter at all, which is the
   * queue's default on purpose: a window applied by default would hide an open
   * ticket from three weeks ago from the person whose job is to answer it.
   */
  window: 'window',
} as const

/** Explicit "every status", as against the absent parameter's default queue. */
export const STATUS_FILTER_ALL = 'all'

/** Every status that still needs somebody: the three in `ACTIVE_TICKET_STATUSES`. */
export const STATUS_FILTER_ACTIVE = 'active'

/**
 * What the status control may be set to: a single status, the whole active
 * queue, or everything. The absent parameter is the shift default and is not a
 * member, because "no choice" and "every status" must not be the same value.
 */
export const TICKET_STATUS_FILTERS = [
  ...TICKET_STATUSES,
  STATUS_FILTER_ACTIVE,
  STATUS_FILTER_ALL,
] as const
export type TicketStatusFilter = (typeof TICKET_STATUS_FILTERS)[number]

export function isTicketStatusFilter(value: string): value is TicketStatusFilter {
  return (TICKET_STATUS_FILTERS as readonly string[]).includes(value)
}

/** The only value the termin filter takes. */
export const DUE_FILTER_OVERDUE = 'overdue'
export const TICKET_DUE_FILTERS = [DUE_FILTER_OVERDUE] as const
export type TicketDueFilter = (typeof TICKET_DUE_FILTERS)[number]

/** Assignee filter sentinels. Anything else must be an `admin_users.id`. */
export const ASSIGNEE_ME = 'me'
export const ASSIGNEE_UNASSIGNED = 'none'

/**
 * The columns the queue may be ordered by.
 *
 * A closed set, because the value lands in an `order by`. Every member is a
 * real column of `support_tickets`; age and time-to-first-response are derived
 * from `created_at` and `first_response_at` and are sorted through those.
 */
export const TICKET_SORT_KEYS = [
  'reference',
  'status',
  'priority',
  'category',
  'created_at',
  'updated_at',
  'due_at',
  'first_response_at',
] as const
export type TicketSortKey = (typeof TICKET_SORT_KEYS)[number]

/** Rows per page. Server-side; the browser is never handed the queue. */
export const TICKET_PAGE_SIZE = 25
export const TICKET_PAGE_SIZES = [25, 50, 100] as const

/** Notes rendered on a detail page before the panel says it truncated. */
export const TICKET_NOTE_LIMIT = 100

/** Audit rows rendered in the ticket's history panel. */
export const TICKET_AUDIT_LIMIT = 30

/** Recent failed approvals shown in the subject user's operational context. */
export const SUBJECT_FAILURE_LIMIT = 5

/** Window and ceiling for the sampled first-response measurement. */
export const FIRST_RESPONSE_WINDOW_DAYS = 30
export const FIRST_RESPONSE_SAMPLE_LIMIT = 500

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export const TICKET_FIELDS = {
  ticketId: 'ticketId',
  returnTo: 'returnTo',
  reason: 'reason',
  assignee: 'assignee',
  status: 'status',
  priority: 'priority',
  noteBody: 'noteBody',
  noteVisibility: 'noteVisibility',
} as const

export const NOTE_VISIBILITIES = ['internal', 'user'] as const
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number]

export function isNoteVisibility(value: string): value is NoteVisibility {
  return (NOTE_VISIBILITIES as readonly string[]).includes(value)
}

/** Unassigning posts this in the assignee field. */
export const ASSIGNEE_NONE = 'none'

/**
 * The console's floor for a written justification, mirroring `MIN_REASON_LENGTH`
 * in `@/lib/admin-action`, which is `server-only` and cannot be imported into a
 * module a form needs. The server is the authority: a reason this constant lets
 * through but the server does not comes back as a field error, never as a
 * silent success.
 */
export const TICKET_REASON_MIN = 10

/** Matches `MAX_REASON_LENGTH` in `@/lib/permissions`, which the trail slices to. */
export const TICKET_REASON_MAX = 280

/** A note has to be a sentence a later reader can use. */
export const NOTE_MIN_LENGTH = 3
export const NOTE_MAX_LENGTH = 4000

/** A resolution note doubles as the audit reason, so it carries that floor. */
export const RESOLUTION_MIN_LENGTH = TICKET_REASON_MIN
export const RESOLUTION_MAX_LENGTH = TICKET_REASON_MAX

// ---------------------------------------------------------------------------
// What an action reports back
//
// Only tokens from this list and a ticket reference travel in the URL. No
// database message, no provider text, nothing an operator or a user typed.
// ---------------------------------------------------------------------------

export const TICKET_RESULT_PARAMS = {
  outcome: 'result',
  reference: 'ticket',
} as const

export const TICKET_OUTCOMES = [
  'assigned',
  'unassigned',
  'status_changed',
  'priority_changed',
  'note_added',
  'resolved',
  'reopened',
  /** The ticket already looked like that; nothing was written. */
  'noop',
  /** The transition is not available from the ticket's current state. */
  'ineligible',
  'invalid',
  'notfound',
  'forbidden',
  'rate_limited',
  'failed',
  /** The change landed and the audit row did not. */
  'audit_failed',
] as const

export type TicketOutcome = (typeof TICKET_OUTCOMES)[number]

export function isTicketOutcome(value: string): value is TicketOutcome {
  return (TICKET_OUTCOMES as readonly string[]).includes(value)
}

/** Outcomes that mean the ticket actually changed. */
export function isAppliedOutcome(outcome: TicketOutcome): boolean {
  return (
    outcome === 'assigned' ||
    outcome === 'unassigned' ||
    outcome === 'status_changed' ||
    outcome === 'priority_changed' ||
    outcome === 'note_added' ||
    outcome === 'resolved' ||
    outcome === 'reopened'
  )
}

// ---------------------------------------------------------------------------
// The audit vocabulary
//
// `admin.` on purpose. `audit_logs_enforce_accountability()` in 0019 treats
// every action in that namespace as sensitive and refuses the insert unless it
// names an acting admin and carries a written reason — so these six actions are
// accountable by the database's rule rather than by this module remembering to
// be. The names are also what `/audit` filters on.
// ---------------------------------------------------------------------------

export const TICKET_AUDIT_ACTIONS = {
  assigned: 'admin.ticket_assigned',
  statusChanged: 'admin.ticket_status_changed',
  priorityChanged: 'admin.ticket_priority_changed',
  noteAdded: 'admin.ticket_note_added',
  resolved: 'admin.ticket_resolved',
  reopened: 'admin.ticket_reopened',
} as const

export type TicketAuditAction = (typeof TICKET_AUDIT_ACTIONS)[keyof typeof TICKET_AUDIT_ACTIONS]

/** `entity_type` on every audit row this module writes. */
export const TICKET_ENTITY_TYPE = 'support_ticket'
