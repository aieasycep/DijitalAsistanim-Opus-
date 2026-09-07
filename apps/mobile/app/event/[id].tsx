import { spacing } from '@da/design-tokens'
import { systemClock } from '@da/domain'
import { formatTimeRange, formatWeekdayDate } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Linking, View } from 'react-native'
import { Avatar } from '../../src/components/ui/Avatar'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Divider, SectionHeader } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { useEvent } from '../../src/hooks/queries'
import { useFeatureGate } from '../../src/hooks/useEntitlements'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'
import { useTheme } from '../../src/theme/ThemeProvider'

const RSVP_LABEL = {
  accepted: 'calendar.rsvp.accepted',
  declined: 'calendar.rsvp.declined',
  tentative: 'calendar.rsvp.tentative',
  needs_action: 'calendar.rsvp.needsAction',
} as const

const RESPONSE_TONE = {
  accepted: 'success',
  declined: 'critical',
  tentative: 'warning',
  needs_action: 'neutral',
} as const

/**
 * One event.
 *
 * Read-only by design: joining, preparing and note-taking are all here, but the
 * event itself can only be changed through an approval, so this screen has no
 * edit affordance that would imply otherwise.
 */
export default function EventScreen() {
  const t = useT()
  const { locale } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const gate = useFeatureGate()
  const { timeZone } = useUserContext()
  const params = useLocalSearchParams<{ id?: string; join?: string }>()
  const eventId = params.id ?? null

  const query = useEvent(eventId)
  const event = query.data ?? null

  // A deep link from a notification can ask to join immediately.
  useEffect(() => {
    if (params.join === '1' && event?.conferenceUrl) {
      void Linking.openURL(event.conferenceUrl)
    }
  }, [params.join, event?.conferenceUrl])

  if (query.isLoading && !event) {
    return (
      <Screen>
        <ScreenHeader title={t('meeting.title')} />
        <SkeletonCard />
      </Screen>
    )
  }

  if (!event) {
    return (
      <Screen>
        <ScreenHeader title={t('meeting.title')} />
        <ErrorState
          message={query.isError ? t(errorMessageKey(query.error)) : t('errors.not_found')}
          {...(query.isError && isRetryable(query.error)
            ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
            : {})}
        />
      </Screen>
    )
  }

  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  const minutesUntil = Math.round((start.getTime() - systemClock.now().getTime()) / 60_000)
  const isPast = end.getTime() < systemClock.now().getTime()
  const externalAttendees = event.attendees.filter((attendee) => !attendee.isSelf)

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('meeting.title')} />

      <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
        <View style={{ gap: spacing.xxs }}>
          {event.status === 'tentative' ? (
            <Badge label={t('common.state.pending')} tone="warning" />
          ) : null}
          <Text variant="h2" accessibilityRole="header">
            {event.title}
          </Text>
          <Text variant="body" tone="secondary">
            {formatWeekdayDate(start, locale, timeZone)} ·{' '}
            {event.isAllDay ? t('calendar.event.allDay') : formatTimeRange(start, end, locale, timeZone)}
          </Text>
          {!isPast && minutesUntil >= 0 && minutesUntil <= 120 ? (
            <Text variant="secondary" tone="primary">
              {minutesUntil <= 1
                ? t('meeting.startsNow')
                : t('calendar.event.startsIn', { duration: minutesUntil })}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
          {event.conferenceUrl ? (
            <Button
              label={t('meeting.action.join')}
              onPress={() => void Linking.openURL(event.conferenceUrl as string)}
              size="sm"
              leading={<MaterialIcons name="videocam" size={16} color={theme.colors.onPrimary} />}
              testID="event-join"
            />
          ) : null}
          {isPast ? (
            <Button
              label={t('meeting.action.addNote')}
              onPress={() => router.push(`/meeting/${event.id}/note`)}
              variant="tonal"
              size="sm"
              testID="event-note"
            />
          ) : (
            <Button
              label={t('meeting.action.generatePrep')}
              onPress={gate('meeting_prep', () => router.push(`/meeting/${event.id}`))}
              variant="tonal"
              size="sm"
              testID="event-prep"
            />
          )}
          {event.externalUrl ? (
            <Button
              label={t('meeting.action.openInvite')}
              onPress={() => void WebBrowser.openBrowserAsync(event.externalUrl as string)}
              variant="ghost"
              size="sm"
              testID="event-open-invite"
            />
          ) : null}
        </View>

        {event.location ? (
          <Card style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <MaterialIcons name="place" size={18} color={theme.colors.textSecondary} />
            <Text variant="body" style={{ flex: 1 }}>
              {event.location}
            </Text>
          </Card>
        ) : null}

        {event.description ? (
          <Card>
            <Text variant="secondary" tone="secondary">
              {event.description}
            </Text>
          </Card>
        ) : null}

        <View>
          <SectionHeader title={t('meeting.attendees.title')} />
          {externalAttendees.length === 0 ? (
            <Text variant="secondary" tone="tertiary">
              {t('meeting.attendees.unknown')}
            </Text>
          ) : (
            <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
              {externalAttendees.map((attendee, index) => (
                <View key={attendee.email}>
                  {index > 0 ? <Divider inset={44} /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <Avatar name={attendee.name ?? attendee.email} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text variant="body" numberOfLines={1}>
                        {attendee.name ?? attendee.email}
                      </Text>
                      <Text variant="micro" tone="tertiary" numberOfLines={1}>
                        {attendee.isOrganizer ? t('calendar.event.organizer') : attendee.email}
                      </Text>
                    </View>
                    <Badge
                      label={t(RSVP_LABEL[attendee.responseStatus])}
                      tone={RESPONSE_TONE[attendee.responseStatus]}
                    />
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>
      </View>
    </Screen>
  )
}
