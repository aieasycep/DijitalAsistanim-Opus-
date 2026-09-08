import { describe, expect, it } from 'vitest'
import {
  CHECK_OUTCOMES,
  HEALTH_PATH,
  HEALTH_RESULT_PARAMS,
  HEALTH_RETURN_PATHS,
  HEALTH_TARGETS,
  HEALTH_TARGET_SPECS,
  PLATFORM_SECRETS,
  SCHEDULED_JOBS,
  effectiveHealthOf,
  firstParam,
  healthTargetSpec,
  isAnsweringStatus,
  isCheckOutcome,
  isHealthTarget,
  latencyVerdict,
  withoutResult,
  type EffectiveHealth,
  type HealthMeasurement,
} from '../contract.ts'
import { healthLabel, healthTone, observerLabel, windowOf } from '../presentation.ts'
import {
  UNMEASURED_LABEL,
  healthStatusHints,
  healthStatusLabels,
} from '../../../lib/messages/health.ts'

/**
 * The system-health area, and the one rule it exists to hold.
 *
 * A status page is consulted at 02:00 with a customer on the phone, and the
 * single most expensive thing it can do is show a green tick nobody observed.
 * So the first two blocks below do not test a mapping, they test a claim:
 * **nothing but a fresh measurement that answered inside its threshold may ever
 * render as healthy.** Everything else — a missing row, a stale row, a stored
 * `unknown` — is "bilinmiyor", and grey is not a pale green.
 */

const STORED_STATUSES = ['operational', 'degraded', 'down', 'unknown'] as const

function measurement(
  status: (typeof STORED_STATUSES)[number],
  isStale: boolean,
): HealthMeasurement {
  return { status, is_stale: isStale }
}

describe('effectiveHealthOf — a target nothing has measured is never green', () => {
  it('reports a target with no row at all as unmeasured', () => {
    expect(effectiveHealthOf(null)).toBe('unmeasured')
  })

  it('reports a stale row as unmeasured whatever it last said', () => {
    for (const status of STORED_STATUSES) {
      expect(effectiveHealthOf(measurement(status, true))).toBe('unmeasured')
    }
  })

  it('is the staleness flag that decides, not the stored verdict', () => {
    // The boundary, both sides of it, on the one status where getting it wrong
    // is dangerous: the same row reads healthy while it is fresh and reads
    // "nobody knows" the moment the view marks it too old to believe.
    expect(effectiveHealthOf(measurement('operational', false))).toBe('operational')
    expect(effectiveHealthOf(measurement('operational', true))).toBe('unmeasured')
  })

  it('passes a fresh row through without reinterpreting it', () => {
    for (const status of STORED_STATUSES) {
      expect(effectiveHealthOf(measurement(status, false))).toBe(status)
    }
  })

  it('admits exactly one input that can end up green, over the whole table', () => {
    const inputs: (HealthMeasurement | null)[] = [null]
    for (const status of STORED_STATUSES) {
      inputs.push(measurement(status, false), measurement(status, true))
    }

    const green = inputs.filter((input) => effectiveHealthOf(input) === 'operational')
    expect(green).toEqual([{ status: 'operational', is_stale: false }])
  })

  it('never invents a verdict the database could not have stored', () => {
    const allowed: readonly EffectiveHealth[] = [...STORED_STATUSES, 'unmeasured']
    for (const status of STORED_STATUSES) {
      for (const stale of [true, false]) {
        expect(allowed).toContain(effectiveHealthOf(measurement(status, stale)))
      }
    }
  })
})

describe('the tone and the label carry the same rule', () => {
  it('has exactly one success tone, and it is not on either unknown state', () => {
    const green = Object.entries(healthTone).filter(([, tone]) => tone === 'success')
    expect(green).toEqual([['operational', 'success']])
    expect(healthTone.unknown).toBe('neutral')
    expect(healthTone.unmeasured).toBe('neutral')
  })

  it('says "bilinmiyor" for both kinds of silence', () => {
    expect(healthLabel('unmeasured')).toBe(UNMEASURED_LABEL)
    expect(healthLabel('unknown')).toBe(healthStatusLabels.unknown)
    expect(healthLabel('unmeasured')).toBe(healthLabel('unknown'))
  })

  it('still names the three verdicts apart', () => {
    expect(healthLabel('operational')).toBe('Sağlıklı')
    expect(healthLabel('degraded')).toBe('Yavaş')
    expect(healthLabel('down')).toBe('Erişilemiyor')
  })

  it('has a Turkish hint for every stored status', () => {
    for (const status of STORED_STATUSES) {
      expect(healthStatusHints[status].length).toBeGreaterThan(0)
    }
  })
})

describe("latencyVerdict — the threshold is the target's own", () => {
  it('calls a round trip at the threshold healthy, and one past it slow', () => {
    expect(latencyVerdict(800, 800)).toBe('operational')
    expect(latencyVerdict(801, 800)).toBe('degraded')
    expect(latencyVerdict(0, 800)).toBe('operational')
  })

  it("judges the console's own database read hardest", () => {
    const database = healthTargetSpec('database')
    for (const spec of HEALTH_TARGET_SPECS) {
      expect(database.degradedMs).toBeLessThanOrEqual(spec.degradedMs)
    }
    // 1200 ms is healthy for a model provider on another continent and slow for
    // the read path every other panel on the page depends on.
    expect(latencyVerdict(1_200, database.degradedMs)).toBe('degraded')
    expect(latencyVerdict(1_200, healthTargetSpec('model_provider').degradedMs)).toBe('operational')
  })
})

describe('isAnsweringStatus — a 5xx is not an answer', () => {
  it('accepts every status that proves the front door replied', () => {
    for (const status of [200, 301, 401, 404, 405, 429, 499]) {
      expect(isAnsweringStatus(status)).toBe(true)
    }
  })

  it('refuses a server error and refuses no status at all', () => {
    for (const status of [500, 502, 503, 0, -1]) {
      expect(isAnsweringStatus(status)).toBe(false)
    }
  })
})

describe('the roster', () => {
  it('has a probe specification for every target and no orphans', () => {
    expect(HEALTH_TARGET_SPECS.map((spec) => spec.id)).toEqual([...HEALTH_TARGETS])
    for (const target of HEALTH_TARGETS) {
      expect(healthTargetSpec(target).degradedMs).toBeGreaterThan(0)
    }
  })

  it('throws rather than inventing a threshold for a target it does not know', () => {
    expect(() => healthTargetSpec('nothing_like_this' as never)).toThrow(/no probe specification/)
  })

  it('recognises its own members and nothing else', () => {
    expect(isHealthTarget('database')).toBe(true)
    expect(isHealthTarget('Database')).toBe(false)
    expect(isHealthTarget('')).toBe(false)
  })

  it('measures the database with a real query and the rest by reachability', () => {
    expect(healthTargetSpec('database').probe).toBe('query')
    for (const spec of HEALTH_TARGET_SPECS) {
      if (spec.id !== 'database') expect(spec.probe).toBe('reachability')
    }
  })
})

describe('the 24-hour strip', () => {
  it('reports an empty window as no samples rather than as a full green bar', () => {
    expect(windowOf({ sample_count_24h: 0, degraded_count_24h: 0, down_count_24h: 0 })).toEqual({
      samples: 0,
      healthy: 0,
      degraded: 0,
      down: 0,
      flapping: false,
    })
  })

  it('derives healthy as the remainder, because the view has no such column', () => {
    expect(windowOf({ sample_count_24h: 10, degraded_count_24h: 2, down_count_24h: 1 })).toEqual({
      samples: 10,
      healthy: 7,
      degraded: 2,
      down: 1,
      flapping: true,
    })
  })

  it('calls a window with one verdict in it steady', () => {
    const steady = windowOf({ sample_count_24h: 96, degraded_count_24h: 0, down_count_24h: 0 })
    expect(steady.healthy).toBe(96)
    expect(steady.flapping).toBe(false)
  })

  it('never lets the buckets exceed the sample count, however the counts arrive', () => {
    const window = windowOf({ sample_count_24h: 5, degraded_count_24h: 9, down_count_24h: 9 })
    expect(window.healthy + window.degraded + window.down).toBe(window.samples)
    expect(window.healthy).toBeGreaterThanOrEqual(0)
  })

  it('ignores negative counts rather than producing a negative bar', () => {
    const window = windowOf({ sample_count_24h: -4, degraded_count_24h: -1, down_count_24h: -1 })
    expect(window).toEqual({ samples: 0, healthy: 0, degraded: 0, down: 0, flapping: false })
  })
})

describe('observers and outcomes', () => {
  it('names the probes the console knows and passes an unknown one through', () => {
    expect(observerLabel('manual')).toBe('Elle')
    expect(observerLabel('cron')).toBe('Zamanlanmış')
    // A probe written by something the console has never heard of is shown by
    // its own name rather than hidden behind "diğer".
    expect(observerLabel('some_other_prober')).toBe('some_other_prober')
  })

  it('recognises its own outcome tokens and nothing else', () => {
    for (const outcome of CHECK_OUTCOMES) expect(isCheckOutcome(outcome)).toBe(true)
    expect(isCheckOutcome('recorded ')).toBe(false)
    expect(isCheckOutcome('ok')).toBe(false)
  })
})

describe('query-string helpers', () => {
  it('reads the first value of a repeated parameter and nothing from an absent one', () => {
    expect(firstParam({ sonuc: 'recorded' }, 'sonuc')).toBe('recorded')
    expect(firstParam({ sonuc: ['recorded', 'partial'] }, 'sonuc')).toBe('recorded')
    expect(firstParam({ sonuc: [] }, 'sonuc')).toBeNull()
    expect(firstParam({}, 'sonuc')).toBeNull()
  })

  it('strips every result parameter so a refresh does not re-announce a check', () => {
    const query = new URLSearchParams({
      [HEALTH_RESULT_PARAMS.outcome]: 'recorded',
      [HEALTH_RESULT_PARAMS.target]: 'database',
      [HEALTH_RESULT_PARAMS.checked]: '7',
      keep: 'this',
    })
    expect(withoutResult(HEALTH_PATH, query)).toBe(`${HEALTH_PATH}?keep=this`)
  })

  it('returns the bare path when nothing survives the strip', () => {
    const query = new URLSearchParams({ [HEALTH_RESULT_PARAMS.outcome]: 'partial' })
    expect(withoutResult(HEALTH_PATH, query)).toBe(HEALTH_PATH)
  })

  it('only ever returns to a page this module declared', () => {
    expect(HEALTH_RETURN_PATHS).toContain(HEALTH_PATH)
    for (const path of HEALTH_RETURN_PATHS) expect(path.startsWith('/health')).toBe(true)
  })
})

describe('the scheduled-job roster is a declaration, not a claim', () => {
  it('says "no evidence" for the jobs whose output no view records', () => {
    const unmeasurable = SCHEDULED_JOBS.filter((job) => job.evidence === 'none').map(
      (job) => job.id,
    )
    expect(unmeasurable).toEqual(['da_follow_up_detection', 'da_retention_cleanup'])
  })

  it('gives every job a five-field cron expression and a way to run', () => {
    for (const job of SCHEDULED_JOBS) {
      expect(job.cron.split(' ')).toHaveLength(5)
      expect(job.edgeFunction !== null || job.sqlFallback !== null).toBe(true)
    }
  })
})

describe('the platform secret registry carries names and nothing else', () => {
  it('holds no value-shaped field on any entry', () => {
    for (const spec of PLATFORM_SECRETS) {
      expect(Object.keys(spec).sort()).toEqual(
        spec.aliases === undefined
          ? ['group', 'required', 'variable']
          : ['aliases', 'group', 'required', 'variable'],
      )
    }
  })

  it('names each variable once', () => {
    const names = PLATFORM_SECRETS.map((spec) => spec.variable)
    expect(new Set(names).size).toBe(names.length)
  })

  it("leaves the console's own six to `secretInventory`, which knows their fallbacks", () => {
    const names = PLATFORM_SECRETS.map((spec) => spec.variable)
    expect(names).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(names).not.toContain('BACKOFFICE_HASH_SALT')
  })
})
