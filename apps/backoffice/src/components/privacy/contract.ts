import { EXPORT_STATUSES, type ExportStatus } from '@da/domain'

/**
 * The wire contract between the privacy routes, their forms and their Server
 * Actions.
 *
 * A `'use server'` module may export nothing but async functions, and a client
 * form cannot import from one without dragging the action's module graph — and
 * with it `@/lib/db` and the service-role key — into the browser bundle. So the
 * strings both sides have to agree on live here, in a plain module either side
 * may import. Getting one wrong is then a type error rather than a form that
 * silently posts a field nobody reads.
 */

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const PRIVACY_PATH = '/privacy'
export const PRIVACY_REQUESTS_PATH = '/privacy/requests'
export const PRIVACY_RETENTION_PATH = '/privacy/retention'

/** Redirect allowlist for every Server Action in this area. */
export const PRIVACY_RETURN_PATHS = [
  PRIVACY_PATH,
  PRIVACY_REQUESTS_PATH,
  PRIVACY_RETENTION_PATH,
] as const

export type PrivacyReturnPath = (typeof PRIVACY_RETURN_PATHS)[number]

export function userDetailHref(userId: string): string {
  return `/users/${userId}`
}

// ---------------------------------------------------------------------------
// The statutory clock
//
// KVKK m.13 gives the controller 30 days to answer a data subject request, and
// GDPR Art. 12(3) gives one month. The product promises the shorter of the two,
// so every deadline on these pages is measured against 30 days from the moment
// the request row was written.
//
// The same 30 days is also `data_export_requests`' fixed retention window
// (0012, `cleanup_expired_retention`), which means a request that reaches the
// deadline is not merely late — the nightly sweep deletes it. That is why the
// pages treat the last week before the deadline as the actionable state rather
// than treating the deadline itself as a soft target.
// ---------------------------------------------------------------------------

export const STATUTORY_DAYS = 30

/** Days before the deadline at which a request starts being called urgent. */
export const DUE_SOON_DAYS = 7

/**
 * How long an unfinished export may sit before it counts as stuck.
 *
 * `data-export-request` builds the archive inside the request that created the
 * row, so a row still in `requested` or `processing` hours later did not fail
 * slowly — it died mid-build and nothing will ever move it again.
 */
export const STUCK_HOURS = 6

/** The retention sweep's schedule, from migration 0014 (`15 3 * * *` UTC). */
export const SWEEP_INTERVAL_HOURS = 24

/** Grace on top of the interval before a missing sweep is called late. */
export const SWEEP_GRACE_HOURS = 3

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

/** Rows on the dashboard's deadline board. */
export const BOARD_SIZE = 8

/** Rows per page in the full request queue. */
export const REQUEST_PAGE_SIZE = 25

/** Sweep runs listed on the retention page. */
export const SWEEP_RUN_LIMIT = 14

/** Deletion events listed on the dashboard. */
export const DELETION_EVENT_LIMIT = 8

/** Accounts carrying a deletion mark listed on the dashboard. */
export const DELETION_MARK_LIMIT = 5

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/** The dashboard's window selector. */
export const PRIVACY_PARAMS = {
  window: 'aralik',
} as const

/** Filters and paging on the request queue. */
export const QUEUE_PARAMS = {
  status: 'durum',
  deadline: 'sure',
  page: 'sayfa',
} as const

/** What a Server Action reports back through the URL. */
export const PRIVACY_RESULT_PARAMS = {
  outcome: 'sonuc',
  request: 'sonucTalep',
} as const

export const PRIVACY_WINDOW_KEYS = ['7g', '30g', '90g'] as const
export type PrivacyWindowKey = (typeof PRIVACY_WINDOW_KEYS)[number]

export const PRIVACY_WINDOW_DAYS: Readonly<Record<PrivacyWindowKey, number>> = {
  '7g': 7,
  '30g': 30,
  '90g': 90,
}

export const DEFAULT_PRIVACY_WINDOW: PrivacyWindowKey = '30g'

export function isPrivacyWindowKey(value: string): value is PrivacyWindowKey {
  return (PRIVACY_WINDOW_KEYS as readonly string[]).includes(value)
}

/**
 * Where a request sits against its statutory deadline.
 *
 * `gecikmis` — past 30 days. `yaklasan` — inside the last week before it.
 * `normal` — everything else. The three are mutually exclusive and cover every
 * request, so a filtered queue plus the other two always sums to the whole.
 */
export const DEADLINE_BUCKETS = ['gecikmis', 'yaklasan', 'normal'] as const
export type DeadlineBucket = (typeof DEADLINE_BUCKETS)[number]

export function isDeadlineBucket(value: string): value is DeadlineBucket {
  return (DEADLINE_BUCKETS as readonly string[]).includes(value)
}

export function isExportStatus(value: string): value is ExportStatus {
  return (EXPORT_STATUSES as readonly string[]).includes(value)
}

/** Statuses that mean the user is still waiting for an answer. */
export const OPEN_EXPORT_STATUSES = ['requested', 'processing'] as const

/** Statuses a re-run order may be filed against. */
export const RERUNNABLE_EXPORT_STATUSES = ['requested', 'processing', 'failed'] as const

export function isRerunnableStatus(value: string): boolean {
  return (RERUNNABLE_EXPORT_STATUSES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// The re-run order
// ---------------------------------------------------------------------------

/** Fields the re-run form posts. */
export const RERUN_FIELDS = {
  requestId: 'talepId',
  returnTo: 'donus',
  reason: 'gerekce',
} as const

/** Fields the refresh form posts. */
export const REFRESH_FIELDS = {
  returnTo: 'donus',
} as const

/**
 * The audit action a re-run order writes, and the entity it names.
 *
 * Both are token-shaped so `bo_identifier()` passes them through unchanged and
 * `/denetim` can render them; anything with whitespace or an `@` would be
 * dropped by the view, which is exactly the protection that keeps prose out of
 * the trail.
 */
export const RERUN_AUDIT_ACTION = 'privacy.export_rerun_ordered'
export const RERUN_ENTITY_TYPE = 'data_export'

/**
 * Two orders on the same request inside this many minutes are treated as one.
 *
 * A second operator picking up the same ticket should be told an order already
 * stands rather than doubling it, because each order is a full archive rebuild
 * of somebody's mailbox.
 */
export const RERUN_DEDUPE_MINUTES = 60

export const RERUN_OUTCOMES = [
  'ordered',
  'duplicate',
  'ineligible',
  'notfound',
  'invalid',
  'forbidden',
  'failed',
] as const

export type RerunOutcome = (typeof RERUN_OUTCOMES)[number]

export function isRerunOutcome(value: string): value is RerunOutcome {
  return (RERUN_OUTCOMES as readonly string[]).includes(value)
}

/** The one outcome that means an order was actually filed. */
export function isOrderedOutcome(outcome: RerunOutcome): boolean {
  return outcome === 'ordered'
}

/**
 * Reason bounds, mirroring `isValidReason` in `@/lib/audit`.
 *
 * Repeated rather than imported because `@/lib/audit` is server-only and the
 * form enforcing them in the browser is a client component. The server re-checks
 * with the real function, so this pair is a courtesy to the operator and never
 * the actual gate.
 */
export const MIN_REASON_LENGTH = 3
export const MAX_REASON_LENGTH = 280
