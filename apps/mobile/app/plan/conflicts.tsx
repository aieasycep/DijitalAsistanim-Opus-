import { spacing } from '@da/design-tokens'
import { systemClock, toIsoDate } from '@da/domain'
import { formatTimeRange } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Divider } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { EmptyState, ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { usePlanWeek } from '../../src/hooks/queries'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'
import { useTheme } from '../../src/theme/ThemeProvider'

/**
 * Calendar conflicts for the week.
 *
 * Resolving one means changing an event, which is an external write — so every
 * route out of this screen leads to the event itself, where the change goes
 * through an approval like any other.
 */
export default function ConflictsScreen() {
  const t = useT()
  const { locale, plural } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const { timeZone } = useUserContext()

  const today = toIsoDate(systemClock.now(), timeZone)
  const query = usePlanWeek(today)

  const days = query.data?.days ?? []

  // A conflict names the events it is about, not a time range: `detectConflicts`
  // reports which meetings clash and by how much, and the sentence itself comes
  // from `messageKey` + `values`. The range shown below is therefore derived
  // from the events involved rather than sent alongside them.
  const conflicts = days.flatMap((day) =>
    day.conflicts.map((conflict) => {
      const events = day.events.filter((event) => conflict.eventIds.includes(event.id))
      const starts = events.map((event) => new Date(event.startsAt).getTime())
      const ends = events.map((event) => new Date(event.endsAt).getTime())
      const span =
        events.length > 0
          ? { from: new Date(Math.min(...starts)), to: new Date(Math.max(...ends)) }
          : null
      return { conflict, events, span }
    }),
  )

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('calendar.conflict.title')} />

      {query.isLoading && days.length === 0 ? (
        <SkeletonCard />
      ) : query.isError && days.length === 0 ? (
        <ErrorState
          message={t(errorMessageKey(query.error))}
          {...(isRetryable(query.error)
            ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
            : {})}
        />
      ) : conflicts.length === 0 ? (
        <EmptyState
          icon="event-available"
          title={t('empty.calendar.title')}
          description={t('empty.calendar.week')}
        />
      ) : (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text variant="secondary" tone="secondary">
            {plural('calendar.conflict.count', conflicts.length)}
          </Text>

          {conflicts.map(({ conflict, events, span }) => (
            <Card
              key={`${conflict.kind}-${conflict.eventIds.join('-')}`}
              tone="warning"
              style={{ gap: spacing.xs }}
              testID={`conflict-${conflict.eventIds[0] ?? 'unknown'}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <MaterialIcons name="error-outline" size={18} color={theme.colors.warningText} />
                <Text variant="bodyStrong" tone="warning" style={{ flex: 1 }}>
                  {t(conflict.messageKey, conflict.values)}
                </Text>
              </View>
              {span ? (
                <Text variant="micro" tone="warning">
                  {formatTimeRange(span.from, span.to, locale, timeZone)}
                </Text>
              ) : null}

              <View style={{ gap: spacing.xs }}>
                {events.map((event, index) => (
                  <View key={event.id}>
                    {index > 0 ? <Divider /> : null}
                    <Button
                      label={event.title}
                      onPress={() => router.push(`/event/${event.id}`)}
                      variant="neutral"
                      size="sm"
                      fullWidth
                      testID={`conflict-event-${event.id}`}
                    />
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  )
}
