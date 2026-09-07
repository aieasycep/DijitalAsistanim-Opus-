import type { TodayFeed } from '@da/api-client'
import { formatTime } from '@da/i18n'
import type { Locale } from '@da/domain'
import { Platform } from 'react-native'
import { DaWidgetNative } from '../../../modules/da-native'
import { reportError } from '../error-reporting'

/**
 * The home-screen widget's data.
 *
 * The widget renders a snapshot the app writes; it never fetches. A widget has
 * no session, so a widget-triggered request would either be unauthenticated or
 * would need a copy of the user's token in a place the app cannot lock — the
 * snapshot avoids both.
 *
 * Everything in the snapshot is already on the user's own home screen, so the
 * lock-screen privacy rule applies: the item titles are the same short lines
 * the app shows, never a mail body.
 */

export interface WidgetItem {
  title: string
  subtitle: string | null
  importance: 'critical' | 'high' | 'normal' | 'low'
  /** Deep-link path inside the app, e.g. `thread/<id>`. */
  path: string
}

export interface WidgetSnapshot {
  greeting: string
  headline: string
  priorityCount: number
  items: WidgetItem[]
  nextEventTitle: string | null
  nextEventTime: string | null
  followUpCount: number
  /** Seconds since the epoch, matching the Swift `Date` decoding. */
  updatedAt: number
  emptyLabel: string
}

export function widgetAvailable(): boolean {
  return DaWidgetNative !== null
}

/** Build the snapshot from the same feed the Today tab renders. */
export function buildSnapshot(input: {
  feed: TodayFeed
  locale: Locale
  timeZone: string
  greeting: string
  headline: string
  emptyLabel: string
  now: Date
}): WidgetSnapshot {
  const open = input.feed.insights.filter(
    (insight) => insight.completedAt === null && insight.dismissedAt === null,
  )

  const nextEvent = input.feed.events
    .filter((event) => new Date(event.startsAt).getTime() >= input.now.getTime())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]

  return {
    greeting: input.greeting,
    headline: input.headline,
    priorityCount: open.length,
    items: open.slice(0, 4).map((insight) => ({
      title: insight.title,
      subtitle: insight.reasonImportant,
      importance: insight.importance,
      path: insight.source
        ? `${insight.source.type === 'email' ? 'thread' : 'today'}/${insight.source.id}`
        : 'today',
    })),
    nextEventTitle: nextEvent?.title ?? null,
    nextEventTime: nextEvent
      ? formatTime(new Date(nextEvent.startsAt), input.locale, input.timeZone)
      : null,
    followUpCount: input.feed.followUps.filter((followUp) => followUp.status === 'waiting').length,
    updatedAt: Math.floor(input.now.getTime() / 1000),
    emptyLabel: input.emptyLabel,
  }
}

export function writeSnapshot(snapshot: WidgetSnapshot): void {
  if (!DaWidgetNative) return
  try {
    DaWidgetNative.setSnapshot(JSON.stringify(snapshot))
  } catch (error) {
    reportError(error, { scope: 'widget:writeSnapshot', extra: { platform: Platform.OS } })
  }
}

/** Called on sign-out and on account deletion: the widget must go blank too. */
export function clearSnapshot(): void {
  if (!DaWidgetNative) return
  try {
    DaWidgetNative.clearSnapshot()
  } catch (error) {
    reportError(error, { scope: 'widget:clearSnapshot' })
  }
}
