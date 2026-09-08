import { AUTO_REFRESH_OPTIONS, type AutoRefreshKey } from './contract'

/**
 * The auto-refresh the "second monitor" case actually needs.
 *
 * When the operator picks an interval, the page emits a `refresh` meta tag and
 * the browser reloads the URL — filters, window and all — on that cadence. React
 * hoists the tag into the document head. Choosing "Kapalı" renders nothing, so
 * the option genuinely turns the behaviour off rather than setting a very long
 * timer.
 *
 * A meta tag rather than a timer in a client component: a reload re-runs the
 * Server Component and every `bo_*` query behind it, which is the entire point.
 * A client-side interval would have to re-fetch data the browser is not allowed
 * to reach.
 */
export function AutoRefreshMeta({ interval }: { interval: AutoRefreshKey }) {
  const seconds = AUTO_REFRESH_OPTIONS[interval]
  if (seconds <= 0) return null
  return <meta httpEquiv="refresh" content={String(seconds)} />
}
