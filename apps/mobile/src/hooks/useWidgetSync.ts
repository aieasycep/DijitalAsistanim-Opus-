import type { TodayFeed } from '@da/api-client'
import { systemClock } from '@da/domain'
import { useEffect, useRef } from 'react'
import { useI18n, useT } from '../i18n/I18nProvider'
import { buildSnapshot, widgetAvailable, writeSnapshot } from '../lib/native/widget'
import { useUserContext } from './useUserContext'

/**
 * Keep the home-screen widget in step with Today.
 *
 * The snapshot is rewritten whenever the feed changes, and only then: writing
 * on every render would reload the widget's timeline constantly, which iOS
 * budgets and eventually throttles. The comparison is on the feed's own
 * `generatedAt` plus the open-insight count, both of which change exactly when
 * the widget's content would.
 */
export function useWidgetSync(feed: TodayFeed | undefined, greeting: string): void {
  const t = useT()
  const { locale } = useI18n()
  const { timeZone } = useUserContext()
  const lastSignature = useRef<string | null>(null)

  useEffect(() => {
    if (!feed || !widgetAvailable()) return

    const open = feed.insights.filter(
      (insight) => insight.completedAt === null && insight.dismissedAt === null,
    )
    const signature = `${feed.generatedAt}:${open.length}:${locale}`
    if (signature === lastSignature.current) return
    lastSignature.current = signature

    writeSnapshot(
      buildSnapshot({
        feed,
        locale,
        timeZone,
        greeting,
        headline: feed.briefing?.headline ?? greeting,
        emptyLabel: t('widgets.today.empty'),
        now: systemClock.now(),
      }),
    )
  }, [feed, greeting, locale, t, timeZone])
}
