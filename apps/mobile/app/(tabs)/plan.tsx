import type { DayPlan, PlanConflict, PlanSuggestion } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { systemClock, toIsoDate, type CalendarEvent } from '@da/domain'
import { formatTimeRange, formatWeekdayDate, splitDuration } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CommitmentCard } from '../../src/components/cards/CommitmentCard'
import { MeetingCard } from '../../src/components/cards/MeetingCard'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { SegmentedControl } from '../../src/components/ui/Controls'
import { Divider, SectionHeader } from '../../src/components/ui/Layout'
import { EmptyState, ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Screen } from '../../src/components/ui/Screen'
import { Text } from '../../src/components/ui/Text'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { useApprovalFlow } from '../../src/hooks/useApprovalFlow'
import {
  useAccounts,
  useCommitments,
  usePlanDay,
  usePlanSuggestions,
  usePlanWeek,
} from '../../src/hooks/queries'
import { useEntitlements, useFeatureGate } from '../../src/hooks/useEntitlements'
import { useUserContext } from '../../src/hooks/useUserContext'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'

type Range = 'day' | 'week'

/** The load line under the header. Each level has its own sentence. */
const LOAD_KEYS = {
  light: 'plan.day.loadLight',
  moderate: 'plan.day.loadModerate',
  heavy: 'plan.day.loadHeavy',
} as const

/**
 * Plan — the day and the week.
 *
 * Suggestions are real gaps on the calendar, not advice. Acting on one opens
 * an approval rather than writing to the calendar directly, so the plan can
 * propose without ever silently rearranging someone's day.
 */
export default function PlanScreen() {
  const t = useT()
  const { locale, plural } = useI18n()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { timeZone } = useUserContext()
  const gate = useFeatureGate()
  const { can } = useEntitlements()
  const { proposeAndReview, isProposing, error: proposeError } = useApprovalFlow()

  const [range, setRange] = useState<Range>('day')
  const [refreshing, setRefreshing] = useState(false)

  const now = systemClock.now()
  const today = toIsoDate(now, timeZone)

  const dayQuery = usePlanDay(today)
  const weekQuery = usePlanWeek(today)
  const suggestionsQuery = usePlanSuggestions(today)
  const commitmentsQuery = useCommitments()
  const accountsQuery = useAccounts()

  /**
   * The calendar a focus block would land on.
   *
   * An approval payload needs a real account id. This screen used to send an
   * empty string and let the approval screen "resolve it later" — nothing
   * resolved it, the payload failed validation before it left the device, and
   * the rejected promise was dropped, so the button silently did nothing.
   */
  const calendarAccountId = useMemo<string | null>(() => {
    const usable = (accountsQuery.data ?? []).filter(
      (account) => account.status === 'connected' && account.kinds.includes('calendar'),
    )
    return (usable.find((account) => account.isPrimary) ?? usable[0])?.id ?? null
  }, [accountsQuery.data])

  /** Only once the accounts are known — a pending query is not an answer. */
  const noCalendarAccount = accountsQuery.isSuccess && calendarAccountId === null

  const isLoading = range === 'day' ? dayQuery.isLoading : weekQuery.isLoading
  const isError = range === 'day' ? dayQuery.isError : weekQuery.isError
  const error = range === 'day' ? dayQuery.error : weekQuery.error

  // A `WeekPlan` is a list of `DayPlan`s, so both ranges reduce to the same
  // shape and the rest of the screen never has to branch again.
  const days = useMemo<DayPlan[]>(() => {
    if (range === 'day') return dayQuery.data ? [dayQuery.data] : []
    return weekQuery.data?.days ?? []
  }, [range, dayQuery.data, weekQuery.data])

  const hasData = days.length > 0

  const refetch = useCallback(async () => {
    await (range === 'day' ? dayQuery.refetch() : weekQuery.refetch())
  }, [range, dayQuery, weekQuery])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([refetch(), suggestionsQuery.refetch()])
    } finally {
      setRefreshing(false)
    }
  }, [refetch, suggestionsQuery])

  const conflicts = useMemo<PlanConflict[]>(() => days.flatMap((day) => day.conflicts), [days])
  const eventCount = useMemo(
    () => days.reduce((total, day) => total + day.events.length, 0),
    [days],
  )

  const proposeFocusBlock = useCallback(
    (suggestion: PlanSuggestion, connectedAccountId: string) => {
      if (!suggestion.startsAt || !suggestion.endsAt) return
      void proposeAndReview({
        type: 'calendar_create',
        what: t('plan.action.addFocusBlock'),
        why: t(suggestion.messageKey, suggestion.values),
        discriminator: `plan-suggestion:${suggestion.id}`,
        payload: {
          kind: 'calendar_create',
          connectedAccountId,
          title: t('plan.timeline.focus'),
          description: null,
          location: null,
          startsAt: suggestion.startsAt,
          endsAt: suggestion.endsAt,
          timeZone,
          attendees: [],
        },
      })
    },
    [proposeAndReview, t, timeZone],
  )

  const header = (
    <View style={{ paddingTop: insets.top + spacing.xs, gap: spacing.sm }}>
      <View>
        <Text variant="h1" accessibilityRole="header">
          {t('plan.title')}
        </Text>
        <Text variant="secondary" tone="tertiary">
          {formatWeekdayDate(now, locale, timeZone)}
        </Text>
      </View>
      <SegmentedControl<Range>
        options={[
          { value: 'day', label: t('plan.range.day') },
          { value: 'week', label: t('plan.range.week') },
        ]}
        value={range}
        onChange={setRange}
        testID="plan-range"
      />
    </View>
  )

  if (isLoading && !hasData) {
    return (
      <Screen scroll bottomInset={spacing.xxl}>
        {header}
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </Screen>
    )
  }

  if (isError && !hasData) {
    return (
      <Screen scroll={false}>
        {header}
        <ErrorState
          message={t(errorMessageKey(error))}
          {...(isRetryable(error)
            ? { retryLabel: t('common.action.retry'), onRetry: () => void refetch() }
            : {})}
        />
      </Screen>
    )
  }

  const commitments = (commitmentsQuery.data ?? []).filter(
    (commitment) => commitment.status === 'open' || commitment.status === 'overdue',
  )
  const suggestions = suggestionsQuery.data ?? []
  const dayLoad = range === 'day' ? (days[0]?.load ?? null) : null
  const longestFree = dayLoad ? splitDuration(dayLoad.longestFreeBlockMinutes) : null

  return (
    <Screen scroll onRefresh={onRefresh} refreshing={refreshing} bottomInset={spacing.xxl}>
      {header}

      {dayLoad ? (
        <Card style={{ marginTop: spacing.lg, gap: spacing.xxs }}>
          <Text variant="bodyStrong">{t(LOAD_KEYS[dayLoad.level])}</Text>
          <Text variant="secondary" tone="secondary">
            {t('plan.day.meetingHours', {
              hours: (dayLoad.bookedMinutes / 60).toFixed(1),
            })}
          </Text>
          {longestFree && dayLoad.longestFreeBlockMinutes > 0 ? (
            <Text variant="secondary" tone="secondary">
              {t('plan.day.focusHours', { hours: longestFree.hours || 1 })}
            </Text>
          ) : (
            <Text variant="secondary" tone="secondary">
              {t('plan.day.noBuffer')}
            </Text>
          )}
        </Card>
      ) : null}

      {conflicts.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          <SectionHeader title={t('calendar.conflict.title')} />
          <Card tone="warning" style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <MaterialIcons name="error-outline" size={18} color="#9A6300" />
              <Text variant="bodyStrong" tone="warning" style={{ flex: 1 }}>
                {plural('calendar.conflict.count', conflicts.length)}
              </Text>
            </View>
            <Button
              label={t('calendar.conflict.resolve')}
              onPress={() => router.push('/plan/conflicts')}
              variant="tonal"
              size="sm"
              testID="plan-conflicts"
            />
          </Card>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title={t('today.section.schedule')} />
        {eventCount === 0 ? (
          <EmptyState
            icon="event-available"
            title={t('empty.noMeeting')}
            description={t('empty.noMeetingHint')}
          />
        ) : (
          <View style={{ gap: spacing.lg }}>
            {days
              .filter((day) => day.events.length > 0)
              .map((day) => (
                <View key={day.date} style={{ gap: spacing.sm }}>
                  {range === 'week' ? (
                    <Text variant="caption" tone="tertiary">
                      {formatWeekdayDate(new Date(`${day.date}T12:00:00Z`), locale, timeZone)}
                    </Text>
                  ) : null}
                  {day.events.map((event: CalendarEvent) => {
                    const minutesUntil = Math.round(
                      (new Date(event.startsAt).getTime() - now.getTime()) / 60_000,
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
                        testID={`plan-event-${event.id}`}
                      />
                    )
                  })}
                </View>
              ))}
          </View>
        )}
      </View>

      {range === 'day' && suggestions.length > 0 ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <SectionHeader title={t('plan.suggestion.title')} />

          {noCalendarAccount ? (
            <Card tone="critical" style={{ gap: spacing.xs }}>
              <Text variant="secondary" tone="critical">
                {t('onboarding.connect.skipWarning')}
              </Text>
              <Button
                label={t('settings.integrations.addAccount')}
                onPress={() => router.push('/settings/accounts')}
                variant="tonal"
                size="sm"
                testID="plan-connect-calendar"
              />
            </Card>
          ) : null}

          {proposeError ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t(errorMessageKey(proposeError))}
              </Text>
            </Card>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            {suggestions.map((suggestion) => {
              // A block can only be proposed once it has real instants; the
              // calendar it would land on is checked alongside it below.
              const schedulable =
                suggestion.kind === 'focus_block' &&
                suggestion.startsAt !== null &&
                suggestion.endsAt !== null
              return (
                <Card
                  key={suggestion.id}
                  proposed
                  style={{ gap: spacing.xs }}
                  testID={`plan-suggestion-${suggestion.id}`}
                >
                  <Badge label={t('common.aiGenerated')} tone="primary" icon="auto-awesome" />
                  <Text variant="h3">{t(suggestion.messageKey, suggestion.values)}</Text>
                  {suggestion.startsAt && suggestion.endsAt ? (
                    <Text variant="secondary" tone="secondary">
                      {formatTimeRange(
                        new Date(suggestion.startsAt),
                        new Date(suggestion.endsAt),
                        locale,
                        timeZone,
                      )}
                      {suggestion.minutes === null
                        ? ''
                        : ` · ${plural('calendar.freeBlock.minutes', suggestion.minutes)}`}
                    </Text>
                  ) : null}
                  {schedulable && calendarAccountId !== null ? (
                    <Button
                      label={t('plan.action.addFocusBlock')}
                      onPress={() => proposeFocusBlock(suggestion, calendarAccountId)}
                      variant="tonal"
                      size="sm"
                      loading={isProposing}
                      testID={`plan-suggestion-accept-${suggestion.id}`}
                    />
                  ) : suggestion.relatedEventId ? (
                    <Button
                      label={t('common.action.open')}
                      onPress={() => router.push(`/event/${suggestion.relatedEventId}`)}
                      variant="tonal"
                      size="sm"
                      testID={`plan-suggestion-open-${suggestion.id}`}
                    />
                  ) : null}
                </Card>
              )
            })}
          </View>
        </View>
      ) : null}

      {commitments.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader
            title={t('commitment.title')}
            actionLabel={t('common.action.seeAll')}
            onAction={() => router.push('/commitment')}
          />
          <View style={{ gap: spacing.sm }}>
            {commitments.slice(0, 5).map((commitment) => (
              <CommitmentCard
                key={commitment.id}
                commitment={commitment}
                timeZone={timeZone}
                now={now}
                onComplete={() => router.push(`/commitment/${commitment.id}`)}
                onSnooze={() => router.push(`/commitment/${commitment.id}`)}
                onOpenSource={() => router.push(`/commitment/${commitment.id}`)}
                testID={`plan-commitment-${commitment.id}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {!can('advanced_planning') ? (
        <View style={{ marginTop: spacing.xl }}>
          <Divider />
          <Card style={{ marginTop: spacing.md, gap: spacing.xs }}>
            <Text variant="h3">{t('paywall.lock.title')}</Text>
            <Text variant="secondary" tone="secondary">
              {t('paywall.lock.body')}
            </Text>
            <Button
              label={t('paywall.cta.subscribe')}
              onPress={() => router.push('/paywall?source=advanced_planning')}
              variant="tonal"
              size="sm"
              testID="plan-paywall"
            />
          </Card>
        </View>
      ) : null}
    </Screen>
  )
}
