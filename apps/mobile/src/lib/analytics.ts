import {
  type AnalyticsEvent,
  type AnalyticsProperties,
  findAnalyticsViolations,
} from '@da/domain'
import { env } from './env'

/**
 * Privacy-safe analytics.
 *
 * Two guarantees:
 *   1. With no `EXPO_PUBLIC_POSTHOG_KEY` configured the adapter is a no-op —
 *      the app never blocks on, or fails because of, a missing analytics key.
 *   2. Every payload is checked against the forbidden-key and free-text rules
 *      before it leaves the device. A violating event is dropped whole rather
 *      than scrubbed, because a half-redacted payload is still something
 *      somebody has to audit later.
 */

export interface AnalyticsAdapter {
  capture(event: AnalyticsEvent, properties?: AnalyticsProperties): void
  identify(userId: string): void
  reset(): void
  readonly enabled: boolean
}

const noopAdapter: AnalyticsAdapter = {
  capture: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
  enabled: false,
}

interface QueuedEvent {
  event: string
  properties: AnalyticsProperties
  timestamp: string
}

/**
 * A tiny batching HTTP adapter rather than the PostHog SDK: the SDK pulls in
 * session recording and autocapture, both of which would see screen contents.
 * Sending only the events we explicitly name is the whole point.
 */
function createPostHogAdapter(apiKey: string, host: string): AnalyticsAdapter {
  let distinctId: string | null = null
  let queue: QueuedEvent[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  const flush = (): void => {
    if (queue.length === 0 || !distinctId) return
    const batch = queue
    queue = []
    void fetch(`${host}/batch/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        batch: batch.map((e) => ({
          event: e.event,
          properties: { ...e.properties, distinct_id: distinctId },
          timestamp: e.timestamp,
        })),
      }),
    }).catch(() => {
      // Analytics must never surface an error to the user or retry forever.
    })
  }

  const scheduleFlush = (): void => {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, 5_000)
  }

  return {
    enabled: true,
    capture(event, properties = {}) {
      const violations = findAnalyticsViolations(properties)
      if (violations.length > 0) {
        if (__DEV__) {
          console.error(
            `[analytics] dropped "${event}" — forbidden properties: ${violations
              .map((v) => `${v.key} (${v.reason})`)
              .join(', ')}`,
          )
        }
        return
      }
      queue.push({ event, properties, timestamp: new Date(Date.now()).toISOString() })
      if (queue.length >= 20) flush()
      else scheduleFlush()
    },
    identify(userId) {
      distinctId = userId
      flush()
    },
    reset() {
      distinctId = null
      queue = []
    },
  }
}

let adapter: AnalyticsAdapter = noopAdapter

export function initAnalytics(): AnalyticsAdapter {
  if (!env.posthogKey) return noopAdapter
  adapter = createPostHogAdapter(env.posthogKey, env.posthogHost)
  return adapter
}

export function analytics(): AnalyticsAdapter {
  return adapter
}

/** Convenience wrapper so screens read `track('insight_opened', { ... })`. */
export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  adapter.capture(event, properties)
}
