import 'server-only'

import { isAppError } from '@da/domain'
import {
  HEALTH_TARGETS,
  PLATFORM_SECRETS,
  healthTargetSpec,
  isHealthTarget,
  type EffectiveHealth,
  type HealthTarget,
  type HealthTargetSpec,
  type SecretGroup,
} from '@/components/health/contract'
import { countView, extremeOf, queryView, type BoSystemHealthRow } from '@/lib/db'
import { healthFailureMessage } from '@/lib/messages/health'

/**
 * Every read behind the system-health screens.
 *
 * ---------------------------------------------------------------------------
 * A STATUS IS A ROW, OR IT IS NOTHING
 * ---------------------------------------------------------------------------
 *
 * Nothing in this file computes a verdict. `bo_system_health` collapses
 * `system_health_checks` to the latest row per target and carries the 24-hour
 * window beside it, and 0019's own constraints already make an unmeasured
 * "operational" impossible to insert. What this module does is the one piece of
 * reading the view cannot do for itself: decide that a *missing* row and a
 * *stale* row are both "nobody knows", rather than letting either fall through
 * to something that renders green.
 *
 * `is_stale` is the whole reason that matters. A probe that stopped running
 * keeps its last answer in the table forever; rendering that answer would put a
 * green dot on a page consulted during an incident, describing a platform
 * nobody has measured since Tuesday.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE SCHEDULED-JOB NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * pg_cron keeps its schedule and its run history in the `cron` schema, which no
 * `bo_*` view exposes and which `queryView` therefore cannot name. So this
 * module does not claim to know when a job last ran. It reads what each job
 * *leaves behind* — the newest sync run, the newest expired approval, the
 * newest expired export, today's briefing and notification totals — every one
 * of them an `ORDER BY … LIMIT 1` or a `count(*)` in Postgres, and every one of
 * them a fact rather than an inference. For the two jobs whose output no view
 * records, the answer is "ölçülemiyor", which is true.
 *
 * ---------------------------------------------------------------------------
 * WHAT NEVER CROSSES THIS FILE
 * ---------------------------------------------------------------------------
 *
 * No user content, by construction: `queryView` accepts only `BoViewName`, and
 * every column touched here is a count, a state, a timestamp or an error code
 * that has already passed through `bo_error_code()`. And no secret value:
 * `loadPlatformSecretState()` compares an environment variable against
 * `undefined` and returns a boolean — the value is never bound to a name, never
 * copied and never returned.
 */

// ===========================================================================
// Failure as a value
// ===========================================================================

/**
 * A query result that carries its own failure, so one dead panel renders an
 * error instead of an empty one. On this page in particular the difference
 * matters more than anywhere else: "no dependency is unhealthy" and "the health
 * query failed" must never look the same.
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; message: string }

export async function settle<T>(run: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, message: healthFailureMessage(isAppError(error) ? error.code : 'unknown') }
  }
}

// ===========================================================================
// Dependency status
// ===========================================================================

export type { EffectiveHealth }

export interface DependencyStatus {
  /** `system_health_checks.target`. */
  readonly target: string
  /** True when the console itself can probe this target. */
  readonly declared: boolean
  /** The probe specification, for a declared target. */
  readonly spec: HealthTargetSpec | null
  /** The latest measurement, or null when nothing has ever checked this. */
  readonly measurement: BoSystemHealthRow | null
  readonly effective: EffectiveHealth
}

/**
 * How many rows the health list will read at most.
 *
 * `bo_system_health` holds one row per distinct target — the console's seven
 * plus whatever a cron probe or a webhook has written — so this is a ceiling on
 * a naturally tiny set, not a page size. If a deployment ever exceeds it the
 * list is bounded rather than unbounded, which is the safe direction.
 */
export const HEALTH_TARGET_LIMIT = 200

function effectiveHealthOf(row: BoSystemHealthRow | null): EffectiveHealth {
  if (row === null) return 'unmeasured'
  // A probe that stopped running is unobserved, never its last green answer.
  if (row.is_stale) return 'unmeasured'
  return row.status
}

/**
 * Every dependency, roster first, with its latest measurement.
 *
 * One query. The roster's seven appear whether or not the table has a row for
 * them — a target nobody has ever checked has to be visible, because its
 * absence is exactly what an operator needs to see — and any additional target
 * found in the table is appended, so a probe written by a cron job or a webhook
 * is never silently hidden by the console's own list.
 */
export async function loadDependencyStatus(): Promise<readonly DependencyStatus[]> {
  const rows = await queryView('bo_system_health', {
    order: { column: 'target', ascending: true },
    limit: HEALTH_TARGET_LIMIT,
  })

  const byTarget = new Map<string, BoSystemHealthRow>(rows.map((row) => [row.target, row]))

  const declared: DependencyStatus[] = HEALTH_TARGETS.map((target: HealthTarget) => {
    const measurement = byTarget.get(target) ?? null
    return {
      target,
      declared: true,
      spec: healthTargetSpec(target),
      measurement,
      effective: effectiveHealthOf(measurement),
    }
  })

  const extra: DependencyStatus[] = rows
    .filter((row) => !isHealthTarget(row.target))
    .map((row) => ({
      target: row.target,
      declared: false,
      spec: null,
      measurement: row,
      effective: effectiveHealthOf(row),
    }))

  return [...declared, ...extra]
}

export interface HealthSummary {
  readonly tracked: number
  readonly operational: number
  readonly degraded: number
  readonly down: number
  /** Never measured, measured too long ago, or measured to no verdict. */
  readonly unmeasured: number
  /** The newest measurement across every target, or null when there is none. */
  readonly lastCheckedAt: string | null
}

/**
 * The tile row, folded from the rows already loaded.
 *
 * Counted in JavaScript rather than with five `count=exact` requests, and
 * deliberately: the input is one row per dependency — seven of them on this
 * platform — already in memory. Issuing five more round trips to re-count a
 * seven-element array would be slower and no more true.
 */
export function summarise(statuses: readonly DependencyStatus[]): HealthSummary {
  let operational = 0
  let degraded = 0
  let down = 0
  let unmeasured = 0
  let lastCheckedAt: string | null = null

  for (const status of statuses) {
    const checkedAt = status.measurement?.checked_at ?? null
    if (checkedAt !== null && (lastCheckedAt === null || checkedAt > lastCheckedAt)) {
      lastCheckedAt = checkedAt
    }
    switch (status.effective) {
      case 'operational':
        operational += 1
        break
      case 'degraded':
        degraded += 1
        break
      case 'down':
        down += 1
        break
      default:
        // `unknown` and `unmeasured` are the same tile: neither is a claim that
        // anything is healthy.
        unmeasured += 1
        break
    }
  }

  return {
    tracked: statuses.length,
    operational,
    degraded,
    down,
    unmeasured,
    lastCheckedAt,
  }
}

// ===========================================================================
// Scheduled work — what each job left behind
// ===========================================================================

export interface SyncEvidence {
  /** The newest `sync_states.last_run_at` in the platform. */
  readonly lastRunAt: string | null
  /** Sync states the view marks stalled. */
  readonly stalled: number
}

export interface BriefingEvidence {
  /** The newest `for_date` in `bo_briefing_health`, Istanbul days. */
  readonly briefingDate: string | null
  readonly briefingReady: number
  readonly briefingFailed: number
  /** The newest `delivery_date` in `bo_notification_health`. */
  readonly notificationDate: string | null
  readonly notificationSent: number
  readonly notificationFailed: number
}

export interface ApprovalEvidence {
  /** When the expiry job last moved an approval to `expired`. */
  readonly lastExpiredAt: string | null
  /** Approvals past their deadline that are still pending — the real signal. */
  readonly overdue: number
}

export interface ExportEvidence {
  /** When the cleanup last moved an export to `expired`. */
  readonly lastExpiredAt: string | null
  /** Exports whose window has closed but that still read `ready`. */
  readonly staleReady: number
}

export interface ScheduledJobEvidence {
  readonly sync: SyncEvidence
  readonly briefing: BriefingEvidence
  readonly approval: ApprovalEvidence
  readonly export: ExportEvidence
}

/**
 * How many pre-aggregated daily rows to read to find the newest day.
 *
 * `bo_briefing_health` is keyed by `(for_date, kind)` and
 * `bo_notification_health` by `(delivery_date, category)`, so one day is a
 * handful of rows. Twenty is several days' worth: enough that the newest day is
 * always complete inside the window, small enough to stay a bounded read.
 */
const DAILY_ROW_LIMIT = 20

/** Sums the rows belonging to the newest key in an already-sorted list. */
function newestDay<Row>(
  rows: readonly Row[],
  key: (row: Row) => string,
): { day: string | null; rows: readonly Row[] } {
  const first = rows[0]
  if (first === undefined) return { day: null, rows: [] }
  const day = key(first)
  return { day, rows: rows.filter((row) => key(row) === day) }
}

/**
 * The real traces the six scheduled jobs leave.
 *
 * Eight bounded reads, run concurrently. Six of them are `ORDER BY … LIMIT 1`
 * or `count(*)` in Postgres; the two daily ones read a few dozen pre-aggregated
 * rows to find the newest complete day.
 */
export async function loadScheduledJobEvidence(): Promise<ScheduledJobEvidence> {
  const [
    lastSyncRun,
    stalledSync,
    briefingDays,
    notificationDays,
    lastExpiredApproval,
    overdueApprovals,
    lastExpiredExport,
    staleReadyExports,
  ] = await Promise.all([
    extremeOf('bo_sync_health', {
      column: 'last_run_at',
      ascending: false,
      columns: ['last_run_at'],
    }),
    countView('bo_sync_health', [{ column: 'is_stalled', op: 'is', value: true }]),
    queryView('bo_briefing_health', {
      columns: ['for_date', 'ready_count', 'failed_count'],
      order: { column: 'for_date', ascending: false },
      limit: DAILY_ROW_LIMIT,
    }),
    queryView('bo_notification_health', {
      columns: ['delivery_date', 'sent_count', 'failed_count'],
      order: { column: 'delivery_date', ascending: false },
      limit: DAILY_ROW_LIMIT,
    }),
    extremeOf('bo_approvals', {
      column: 'updated_at',
      ascending: false,
      columns: ['updated_at'],
      filters: [{ column: 'status', op: 'eq', value: 'expired' }],
    }),
    // `is_overdue` is `expires_at < now() and status = 'pending'` in the view:
    // an approval the expiry job should already have closed. A non-zero count
    // here is what "da_approval_expiry is not running" actually looks like.
    countView('bo_approvals', [{ column: 'is_overdue', op: 'is', value: true }]),
    extremeOf('bo_privacy_requests', {
      column: 'updated_at',
      ascending: false,
      columns: ['updated_at'],
      filters: [{ column: 'status', op: 'eq', value: 'expired' }],
    }),
    // A download link whose window has closed but whose row still says `ready`
    // is precisely the state `da_export_cleanup` exists to remove.
    countView('bo_privacy_requests', [
      { column: 'status', op: 'eq', value: 'ready' },
      { column: 'is_expired', op: 'is', value: true },
    ]),
  ])

  const briefing = newestDay(briefingDays, (row) => row.for_date)
  const notification = newestDay(notificationDays, (row) => row.delivery_date)

  return {
    sync: {
      lastRunAt: lastSyncRun?.last_run_at ?? null,
      stalled: stalledSync,
    },
    briefing: {
      briefingDate: briefing.day,
      briefingReady: briefing.rows.reduce((total, row) => total + row.ready_count, 0),
      briefingFailed: briefing.rows.reduce((total, row) => total + row.failed_count, 0),
      notificationDate: notification.day,
      notificationSent: notification.rows.reduce((total, row) => total + row.sent_count, 0),
      notificationFailed: notification.rows.reduce((total, row) => total + row.failed_count, 0),
    },
    approval: {
      lastExpiredAt: lastExpiredApproval?.updated_at ?? null,
      overdue: overdueApprovals,
    },
    export: {
      lastExpiredAt: lastExpiredExport?.updated_at ?? null,
      staleReady: staleReadyExports,
    },
  }
}

// ===========================================================================
// Configuration, as presence and nothing else
// ===========================================================================

export interface SecretState {
  /** The variable's name. */
  readonly variable: string
  readonly group: SecretGroup
  readonly required: boolean
  /** Whether the server has a non-empty value. Never the value. */
  readonly configured: boolean
  /** The alias the value was found under, when it was not the primary name. */
  readonly resolvedAlias: string | null
}

/**
 * True when a variable holds something. The value is compared and discarded
 * inside this function; it is never returned, logged or stored.
 */
function isPresent(name: string): boolean {
  const value = process.env[name]
  return value !== undefined && value.trim() !== ''
}

/**
 * The platform's integration secrets, as presence flags.
 *
 * The specification is explicit and this function is the whole implementation
 * of it: a name, a boolean, nothing else. There is no code path here that can
 * return a value, a prefix, a length or a fingerprint, because none of those is
 * ever computed.
 *
 * Synchronous and dependency-free, so a page renders it without a round trip —
 * and `server-only` at the top of this module is what keeps `process.env` out
 * of a client bundle.
 */
export function loadPlatformSecretState(): readonly SecretState[] {
  return PLATFORM_SECRETS.map((spec) => {
    const primary = isPresent(spec.variable)
    const alias = primary ? null : (spec.aliases?.find((name) => isPresent(name)) ?? null)
    return {
      variable: spec.variable,
      group: spec.group,
      required: spec.required,
      configured: primary || alias !== null,
      resolvedAlias: alias,
    }
  })
}

/** How many required variables are missing. The one number worth a tile. */
export function countMissingRequired(states: readonly SecretState[]): number {
  return states.filter((state) => state.required && !state.configured).length
}
