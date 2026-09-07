import { gradients, spacing } from '@da/design-tokens'
import {
  type Insight,
  type InsightAction,
  HOUR_MS,
  MINUTE_MS,
  comparePriority,
  systemClock,
} from '@da/domain'
import { formatWeekdayDate } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { CommitmentCard } from '../../src/components/cards/CommitmentCard'
import { FollowUpCard } from '../../src/components/cards/FollowUpCard'
import { InsightCard } from '../../src/components/cards/InsightCard'
import { LifeEventCard } from '../../src/components/cards/LifeEventCard'
import { MeetingCard } from '../../src/components/cards/MeetingCard'
import { BriefingHero } from '../../src/components/today/BriefingHero'
import { TodayHeader } from '../../src/components/today/TodayHeader'
import { ApprovalBanner } from '../../src/components/today/ApprovalBanner'
import { Button } from '../../src/components/ui/Button'
import { EmptyState, ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { SectionHeader } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { Text } from '../../src/components/ui/Text'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'
import { track } from '../../src/lib/analytics'
import { useApprovalFlow } from '../../src/hooks/useApprovalFlow'
import { useEntitlements, useFeatureGate } from '../../src/hooks/useEntitlements'
import { useInsightActions } from '../../src/hooks/useInsightActions'
import { useTodayFeed } from '../../src/hooks/queries'
import { useWidgetSync } from '../../src/hooks/useWidgetSync'
import { useUserContext } from '../../src/hooks/useUserContext'

/**
 * Today — the app's home.
 *
 * The screen's whole job is subtraction: it shows the handful of things that
 * matter and nothing else. Sections that have no content are omitted rather
 * than rendered empty, so a quiet day looks quiet instead of looking broken.
 */
export default function TodayScreen() {
  const t = useT()
  const { locale, plural } = useI18n()
  const router = useRouter()
  const { timeZone, givenName } = useUserContext()
  const { can } = useEntitlements()
  const gate = useFeatureGate()
  const { isDeciding } = useApprovalFlow()
  const { runAction, isRunning } = useInsightActions()
  const [refreshing, setRefreshing] = useState(false)

  const query = useTodayFeed()
  const now = systemClock.now()

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await query.refetch()
    } finally {
      setRefreshing(false)
    }
  }, [query])

  const feed = query.data
  const greeting = t(greetingKey(now, timeZone), { name: givenName ?? '' })

  // The home-screen widget renders a snapshot of exactly this feed.
  useWidgetSync(feed, greeting)

  const priorities = useMemo<Insight[]>(() => {
    if (!feed) return []
    return feed.insights
      .filter((insight) => !insight.dismissedAt)
      .map((insight) => ({ ...insight, receivedAt: insight.createdAt }))
      .sort((a, b) =>
        comparePriority(
          { priorityScore: a.priorityScore, receivedAt: a.createdAt },
          { priorityScore: b.priorityScore, receivedAt: b.createdAt },
        ),
      )
  }, [feed])

  const openInsights = useMemo(
    () => priorities.filter((insight) => !insight.completedAt),
    [priorities],
  )

  const upcomingEvents = useMemo(() => {
    if (!feed) return []
    return feed.events
      .filter((event) => new Date(event.endsAt).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  }, [feed, now])

  const openCommitments = useMemo(
    () => feed?.commitments.filter((c) => c.status === 'open' || c.status === 'overdue') ?? [],
    [feed],
  )

  const handleInsightAction = useCallback(
    (insight: Insight) => (action: InsightAction) => {
      track('insight_opened')
      void runAction(insight, action)
    },
    [runAction],
  )

  const openSource = useCallback(
    (insight: Insight) => () => {
      const source = insight.source
      if (!source) return
      if (source.type === 'email') router.push(`/thread/${source.id}`)
      else if (source.type === 'calendar_event') router.push(`/event/${source.id}`)
      else if (source.type === 'capture') router.push(`/capture?id=${source.id}`)
      else if (source.type === 'contact') router.push(`/person/${source.id}`)
    },
    [router],
  )

  // ── Loading ──────────────────────────────────────────────────────────────
  if (query.isLoading && !feed) {
    return (
      <Screen scroll bottomInset={spacing.xxl}>
        <TodayHeader
          greeting={greeting}
          dateLabel={formatWeekdayDate(now, locale, timeZone)}
          onOpenSearch={() => router.push('/search')}
          onOpenProfile={() => router.push('/settings')}
          onOpenCapture={() => router.push('/capture')}
        />
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </Screen>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (query.isError && !feed) {
    return (
      <Screen scroll={false}>
        <TodayHeader
          greeting={greeting}
          dateLabel={formatWeekdayDate(now, locale, timeZone)}
          onOpenSearch={() => router.push('/search')}
          onOpenProfile={() => router.push('/settings')}
          onOpenCapture={() => router.push('/capture')}
        />
        <ErrorState
          message={t(errorMessageKey(query.error))}
          {...(isRetryable(query.error)
            ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
            : {})}
        />
      </Screen>
    )
  }

  const pendingApprovals = feed?.pendingApprovals ?? []
  const lifeEvents = feed?.lifeEvents.filter((e) => e.status === 'active') ?? []
  const followUps = feed?.followUps.filter((f) => f.status === 'waiting') ?? []

  const isQuietDay =
    openInsights.length === 0 &&
    upcomingEvents.length === 0 &&
    openCommitments.length === 0 &&
    followUps.length === 0 &&
    lifeEvents.length === 0

  return (
    <Screen scroll onRefresh={onRefresh} refreshing={refreshing} bottomInset={spacing.xxl}>
      <TodayHeader
        greeting={greeting}
        dateLabel={formatWeekdayDate(now, locale, timeZone)}
        onOpenSearch={() => router.push('/search')}
        onOpenProfile={() => router.push('/settings')}
        onOpenCapture={() => router.push('/capture')}
      />

      <BriefingHero
        briefing={feed?.briefing ?? null}
        priorityCount={openInsights.length}
        gradient={gradients.dawn}
        onOpen={() => router.push('/briefing/morning')}
        onListen={gate('voice_briefing', () => router.push('/briefing/morning?listen=1'))}
        canListen={can('voice_briefing')}
      />

      {pendingApprovals.length > 0 ? (
        <ApprovalBanner
          count={pendingApprovals.length}
          onOpen={() => router.push('/approvals')}
          busy={isDeciding}
        />
      ) : null}

      {isQuietDay ? (
        <EmptyState
          icon="wb-sunny"
          title={t('empty.noImportantEmail')}
          description={t('empty.today.allClearHint')}
          actionLabel={t('today.action.planDay')}
          onAction={() => router.push('/(tabs)/flow')}
        />
      ) : null}

      {openInsights.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader
            title={t('today.section.priorities')}
            actionLabel={t('common.action.seeAll')}
            onAction={() => router.push('/(tabs)/flow')}
          />
          <View style={{ gap: spacing.sm }}>
            {openInsights.slice(0, 5).map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onAction={handleInsightAction(insight)}
                onOpenSource={insight.source ? openSource(insight) : undefined}
                onPress={insight.source ? openSource(insight) : undefined}
                testID={`insight-${insight.id}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {upcomingEvents.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader
            title={t('today.section.schedule')}
            actionLabel={t('common.action.seeAll')}
            onAction={() => router.push('/(tabs)/plan')}
          />
          <View style={{ gap: spacing.sm }}>
            {upcomingEvents.slice(0, 3).map((event) => {
              const minutesUntil = Math.round(
                (new Date(event.startsAt).getTime() - now.getTime()) / MINUTE_MS,
              )
              return (
                <MeetingCard
                  key={event.id}
                  event={event}
                  timeZone={timeZone}
                  minutesUntil={minutesUntil}
                  onPress={() => router.push(`/event/${event.id}`)}
                  onPrepare={gate('meeting_prep', () => router.push(`/meeting/${event.id}`))}
                  {...(event.conferenceUrl
                    ? { onJoin: () => router.push(`/event/${event.id}?join=1`) }
                    : {})}
                  testID={`event-${event.id}`}
                />
              )
            })}
          </View>
        </View>
      ) : null}

      {followUps.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader
            title={t('today.section.waitingOnOthers')}
            actionLabel={t('common.action.seeAll')}
            onAction={() => router.push('/followups')}
          />
          <View style={{ gap: spacing.sm }}>
            {followUps.slice(0, 2).map((followUp) => (
              <FollowUpCard
                key={followUp.id}
                followUp={followUp}
                subject={followUp.recipientName ?? followUp.recipientEmail}
                now={now}
                onDraftNudge={() => router.push(`/thread/${followUp.threadId}?nudge=1`)}
                onRemindTomorrow={() => router.push(`/thread/${followUp.threadId}?remind=1`)}
                onClose={() => router.push('/followups')}
                onOpenThread={() => router.push(`/thread/${followUp.threadId}`)}
                testID={`followup-${followUp.id}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {openCommitments.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader
            title={t('today.section.expectedFromYou')}
            actionLabel={t('common.action.seeAll')}
            onAction={() => router.push('/commitment')}
          />
          <View style={{ gap: spacing.sm }}>
            {openCommitments.slice(0, 3).map((commitment) => (
              <CommitmentCard
                key={commitment.id}
                commitment={commitment}
                timeZone={timeZone}
                now={now}
                onComplete={() => router.push(`/commitment/${commitment.id}`)}
                onSnooze={() => router.push(`/commitment/${commitment.id}`)}
                onOpenSource={() => router.push(`/commitment/${commitment.id}`)}
                testID={`commitment-${commitment.id}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {lifeEvents.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title={t('today.section.personal')} />
          <View style={{ gap: spacing.sm }}>
            {lifeEvents.slice(0, 4).map((event) => (
              <LifeEventCard
                key={event.id}
                event={event}
                timeZone={timeZone}
                now={now}
                onPress={() => router.push(`/life/${event.id}`)}
                onOpenSource={() => router.push(`/life/${event.id}`)}
                {...(event.trackingUrl
                  ? { onTrack: () => router.push(`/life/${event.id}?open=1`) }
                  : {})}
                testID={`life-${event.id}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* A single honest footer line rather than an infinite feed: the product
          promise is that Today ends. */}
      <View style={{ marginTop: spacing.xxl, alignItems: 'center', gap: spacing.xs }}>
        <MaterialIcons name="check-circle-outline" size={18} color="#9B978E" />
        <Text variant="micro" tone="tertiary" center>
          {plural('mail.summary.scanned', feed?.briefing?.stats?.emailsAnalyzed ?? 0)}
        </Text>
        <Button
          label={t('today.action.reviewAll')}
          onPress={() => router.push('/(tabs)/flow')}
          variant="ghost"
          size="sm"
        />
      </View>

      {isRunning ? null : null}
    </Screen>
  )
}

/** Morning until 12:00, afternoon until 18:00, evening after — in the user's zone. */
function greetingKey(now: Date, timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now),
  )
  if (Number.isNaN(hour)) return 'today.greeting.morning'
  if (hour < 12) return 'today.greeting.morning'
  if (hour < 18) return 'today.greeting.afternoon'
  return 'today.greeting.evening'
}

export const TODAY_REFRESH_INTERVAL_MS = HOUR_MS
