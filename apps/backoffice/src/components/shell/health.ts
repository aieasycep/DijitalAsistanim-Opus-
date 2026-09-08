import 'server-only'

import { cache } from 'react'
import { queryView, type BoSystemHealthRow } from '@/lib/db'

/**
 * The one number the toolbar shows: is anything broken right now?
 *
 * ---------------------------------------------------------------------------
 * A STALE PROBE IS NOT A HEALTHY ONE
 * ---------------------------------------------------------------------------
 *
 * `bo_system_health.is_stale` is the whole point of this function. A probe that
 * stopped running keeps its last answer in the table forever, and rendering
 * that answer would put a green dot in the toolbar of a console watching a
 * platform nobody has measured since Tuesday. So a stale row counts as
 * unobserved, never as its last reading, and the toolbar says "ölçüm yok"
 * rather than "sağlıklı".
 *
 * The same rule runs one level down in the database: 0019 refuses to insert an
 * `operational` row with no latency and a `down` row with no error code, so an
 * unmeasured green cannot exist to be read in the first place.
 *
 * ---------------------------------------------------------------------------
 * AND NEITHER IS AN OUTAGE OF THE CONSOLE'S OWN
 * ---------------------------------------------------------------------------
 *
 * If the query itself fails, the indicator says so. It does not fall through to
 * "operational", and it does not take the shell down with it: the toolbar is
 * rendered on every page, and a health check that can throw is a health check
 * that can 500 the entire console.
 */

export type HealthOverall = 'operational' | 'degraded' | 'down' | 'unknown' | 'unavailable'

export interface HealthSummary {
  readonly overall: HealthOverall
  /** Targets currently reported down, excluding stale rows. */
  readonly down: number
  readonly degraded: number
  /** Targets whose last probe is too old to believe. */
  readonly stale: number
  /** Targets that have never produced a usable reading. */
  readonly unknown: number
  readonly total: number
  /** The most recent probe across all targets, or null when there is none. */
  readonly lastCheckedAt: string | null
}

const UNAVAILABLE: HealthSummary = Object.freeze({
  overall: 'unavailable',
  down: 0,
  degraded: 0,
  stale: 0,
  unknown: 0,
  total: 0,
  lastCheckedAt: null,
})

async function load(): Promise<HealthSummary> {
  let rows: readonly BoSystemHealthRow[]
  try {
    rows = await queryView('bo_system_health', {
      columns: ['target', 'status', 'checked_at', 'is_stale'],
      order: { column: 'checked_at', ascending: false },
      // One row per target; the view already collapses the probe history.
      limit: 200,
    })
  } catch {
    // Deliberately swallowed and reported as a state rather than rethrown: the
    // toolbar renders above every page, including the ones an operator would
    // use to diagnose this exact failure.
    return UNAVAILABLE
  }

  if (rows.length === 0) {
    return { ...UNAVAILABLE, overall: 'unknown' }
  }

  let down = 0
  let degraded = 0
  let stale = 0
  let unknown = 0
  let lastCheckedAt: string | null = null

  for (const row of rows) {
    if (lastCheckedAt === null || row.checked_at > lastCheckedAt) lastCheckedAt = row.checked_at
    if (row.is_stale) {
      stale += 1
      continue
    }
    if (row.status === 'down') down += 1
    else if (row.status === 'degraded') degraded += 1
    else if (row.status === 'unknown') unknown += 1
  }

  const overall: HealthOverall =
    down > 0
      ? 'down'
      : degraded > 0
        ? 'degraded'
        : stale > 0 || unknown > 0 || stale + unknown === rows.length
          ? 'unknown'
          : 'operational'

  return { overall, down, degraded, stale, unknown, total: rows.length, lastCheckedAt }
}

/** Memoised per request: the layout and a page may both ask. */
export const loadHealthSummary: () => Promise<HealthSummary> = cache(load)
