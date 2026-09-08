import type { BadgeTone } from '@/components/ui/Badge'
import { healthMessages, healthStatusLabels, UNMEASURED_LABEL } from '@/lib/messages/health'
import type { EffectiveHealth } from './contract'

/**
 * How a health verdict is rendered, decided once.
 *
 * ---------------------------------------------------------------------------
 * GREY IS NOT A PALE GREEN
 * ---------------------------------------------------------------------------
 *
 * There are four tones here and only one of them is green. `unmeasured` and
 * `unknown` are both `neutral` — deliberately colourless — because "nobody has
 * checked this" is not a mild version of "this is fine", and a status page that
 * blurs the two is the one thing this page must never do. An operator scanning
 * the column during an incident should be able to see, without reading a word,
 * which rows are claims and which rows are silence.
 *
 * Everything in this module is pure and imports nothing that reaches the
 * database, so a Client Component may use it as freely as a Server one.
 */

export const healthTone: Readonly<Record<EffectiveHealth, BadgeTone>> = Object.freeze({
  operational: 'success',
  degraded: 'warning',
  down: 'critical',
  unknown: 'neutral',
  unmeasured: 'neutral',
})

export function healthLabel(effective: EffectiveHealth): string {
  return effective === 'unmeasured' ? UNMEASURED_LABEL : healthStatusLabels[effective]
}

/**
 * The share of the last 24 hours spent in each verdict.
 *
 * `sample_count_24h` counts every probe row in the window and the other two
 * count the unhealthy ones, so healthy is the remainder — computed here rather
 * than stored, because the view has no `operational_count_24h` and inventing
 * one in SQL would mean a second definition of "healthy".
 *
 * A window with no samples returns zeroes and the strip renders as "ölçüm yok",
 * never as a full green bar.
 */
export interface HealthWindow {
  readonly samples: number
  readonly healthy: number
  readonly degraded: number
  readonly down: number
  /** True when the window holds more than one verdict — a flap, not a state. */
  readonly flapping: boolean
}

export function windowOf(row: {
  sample_count_24h: number
  degraded_count_24h: number
  down_count_24h: number
}): HealthWindow {
  const samples = Math.max(0, row.sample_count_24h)
  const degraded = Math.min(samples, Math.max(0, row.degraded_count_24h))
  const down = Math.min(samples - degraded, Math.max(0, row.down_count_24h))
  const healthy = Math.max(0, samples - degraded - down)
  // Three buckets, and more than one of them occupied means the target changed
  // its mind inside the window. That is exactly the case a single status light
  // hides, and the reason this strip exists.
  const occupied = [healthy, degraded, down].filter((count) => count > 0).length
  return { samples, healthy, degraded, down, flapping: occupied > 1 }
}

/** The Turkish name of the probe that wrote a row. Unknown values pass through. */
export function observerLabel(observedBy: string): string {
  return healthMessages.observers[observedBy] ?? observedBy
}
