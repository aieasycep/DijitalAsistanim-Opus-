import { gradients, spacing } from '@da/design-tokens'
import {
  type FollowUp,
  type Insight,
  type InsightAction,
  AppError,
  HOUR_MS,
  MINUTE_MS,
  comparePriority,
  nextWorkingDay,
  systemClock,
} from '@da/domain'
import { formatWeekdayDate } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
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
import { Card } from '../../src/components/ui/Card'
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
import { useInvalidateAfterWrite, useTodayFeed } from '../../src/hooks/queries'
import { useWidgetSync } from '../../src/hooks/useWidgetSync'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useApi } from '../../src/providers/AppProviders'

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
  const api = useApi()
  const invalidate = useInvalidateAfterWrite()
  const { timeZone, givenName } = useUserContext()
  const { can } = useEntitlements()
  const gate = useFeatureGate()
  const { isDeciding, proposeAndReview } = useApprovalFlow()
  const {
    runAction,
    runningInsightId,
    error: insightError,
    clearError: clearInsightError,
  } = useInsightActions()
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

  /**
   * Chasing a silent thread, from Today.
   *
   * All three buttons used to push a query parameter at the thread screen —
   * `?nudge=1`, `?remind=1` — which that screen has never read, so the card's
   * whole action row was decoration. They now run the same writes the
   * follow-ups screen runs.
   *
   * The nudge is drafted and then handed straight to the approval card, which
   * shows the subject and body and lets the user edit both before approving.
   * Nothing is sent by tapping the button.
   */
  const nudge = useMutation({
    mutationFn: async (followUp: FollowUp) => {
      // A reply leaves from the mailbox that holds the thread; an empty or
      // guessed account id fails `emailSendPayloadSchema` before the request
      // is ever made.
      const [draft, thread] = await Promise.all([
        api.followUps.nudgeDraft(followUp.id),
        api.threads.get(followUp.threadId),
      ])
      if (!thread) {
        throw new AppError('not_found', { detail: `thread ${followUp.threadId}` })
      }
      return proposeAndReview({
        type: 'email_send',
        what: t('followup.nudge.title'),
        why: t('followup.card.sentTo', {
          name: followUp.recipientName ?? followUp.recipientEmail,
        }),
        sourceType: 'email',
        sourceId: followUp.threadId,
        discriminator: `nudge:${followUp.id}`,
        payload: {
          kind: 'email_send',
          connectedAccountId: thread.connectedAccountId,
          threadId: followUp.threadId,
          inReplyToMessageId: followUp.messageId,
          to: [followUp.recipientEmail],
          cc: [],
          subject: draft.subject,
          body: draft.body,
          tone: 'professional',
        },
      })
    },
    onSuccess: invalidate,
  })

  const snooze = useMutation({
    // "Remind me" means the start of the next working day — the domain's rule,
    // so a Friday afternoon nudge is not due again on Saturday.
    mutationFn: (followUpId: string) =>
      api.followUps.snooze(followUpId, nextWorkingDay(now, timeZone).toISOString()),
    onSuccess: invalidate,
  })

  const close = useMutation({
    mutationFn: (followUpId: string) => api.followUps.close(followUpId),
    onSuccess: invalidate,
  })

  const followUpError = nudge.error ?? snooze.error ?? close.error
  const followUpBusy = nudge.isPending || snooze.isPending || close.isPending

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
  // Both live statuses: drafting a nudge moves the row to `nudged`, and a card
  // that disappears the moment you act on it reads as a bug, not as progress.
  const followUps =
    feed?.followUps.filter((f) => f.status === 'waiting' || f.status === 'nudged') ?? []

  /**
   * Where the hero goes.
   *
   * The briefing screen is a single route parameterised by a query param — see
   * `targetToRoute` in `src/lib/deep-links.ts`. `/briefing/morning` has no file
   * behind it, so the app's primary call to action used to land on the router's
   * unmatched-route screen. The kind is the briefing's own, so an evening hero
   * opens the evening briefing rather than the morning one.
   */
  const briefingKind = feed?.briefing?.kind ?? 'morning'
  const briefingRoute = `/briefing?kind=${briefingKind}`

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
        onOpen={() => router.push(briefingRoute)}
        onListen={gate('voice_briefing', () => router.push(`${briefingRoute}&listen=1`))}
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
            {openInsights.slice(0, 5).map((insight) => {
              // A quick action can create an approval or write to the row, so
              // the card it was tapped on is dimmed and inert until it settles
              // rather than accepting a second tap that would stack a duplicate.
              const pending = runningInsightId === insight.id
              return (
                <View
                  key={insight.id}
                  pointerEvents={pending ? 'none' : 'auto'}
                  style={{ opacity: pending ? 0.5 : 1 }}
                >
                  <InsightCard
                    insight={insight}
                    onAction={handleInsightAction(insight)}
                    onOpenSource={insight.source ? openSource(insight) : undefined}
                    onPress={insight.source ? openSource(insight) : undefined}
                    testID={`insight-${insight.id}`}
                  />
                </View>
              )
            })}

            {/* A failed quick action used to be reported to the error service
                and to nobody else, so the button simply appeared to do nothing. */}
            {insightError ? (
              <Card tone="critical" style={{ gap: spacing.xs }}>
                <Text variant="secondary" tone="critical">
                  {t(errorMessageKey(insightError))}
                </Text>
                <Button
                  label={t('errors.action.dismiss')}
                  onPress={clearInsightError}
                  variant="ghost"
                  size="sm"
                  testID="insight-action-error-dismiss"
                />
              </Card>
            ) : null}
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
                onDraftNudge={() => nudge.mutate(followUp)}
                onRemindTomorrow={() => snooze.mutate(followUp.id)}
                onClose={() => close.mutate(followUp.id)}
                onOpenThread={() => router.push(`/thread/${followUp.threadId}`)}
                busy={followUpBusy}
                testID={`followup-${followUp.id}`}
              />
            ))}

            {followUpError ? (
              <Card tone="critical">
                <Text variant="secondary" tone="critical">
                  {t(errorMessageKey(followUpError))}
                </Text>
              </Card>
            ) : null}
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
