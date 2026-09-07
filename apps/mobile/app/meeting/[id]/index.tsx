import { spacing } from '@da/design-tokens'
import { formatTimeRange, formatWeekdayDate } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'
import { Avatar } from '../../../src/components/ui/Avatar'
import { Badge } from '../../../src/components/ui/Badge'
import { Button } from '../../../src/components/ui/Button'
import { Card } from '../../../src/components/ui/Card'
import { Divider, SectionHeader } from '../../../src/components/ui/Layout'
import { Screen } from '../../../src/components/ui/Screen'
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader'
import { ErrorState, SkeletonCard } from '../../../src/components/ui/States'
import { Text } from '../../../src/components/ui/Text'
import { useMeetingPrep } from '../../../src/hooks/queries'
import { useUserContext } from '../../../src/hooks/useUserContext'
import { useI18n, useT } from '../../../src/i18n/I18nProvider'
import { track } from '../../../src/lib/analytics'
import { errorMessageKey, isRetryable } from '../../../src/lib/query-client'
import { useTheme } from '../../../src/theme/ThemeProvider'

/**
 * The two-minute meeting prep.
 *
 * Everything on this screen is derived from mail and calendar the user already
 * has — the agenda comes from the invite, the open items from real commitments.
 * Where there is nothing to say, the section says so rather than inventing
 * plausible-sounding context.
 */
export default function MeetingPrepScreen() {
  const t = useT()
  const { locale } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const { timeZone } = useUserContext()
  const params = useLocalSearchParams<{ id?: string }>()
  const eventId = params.id ?? null

  const query = useMeetingPrep(eventId)
  const prep = query.data ?? null

  useEffect(() => {
    if (prep) track('meeting_prep_opened')
  }, [prep])

  if (query.isLoading && !prep) {
    return (
      <Screen>
        <ScreenHeader title={t('meeting.twoMinuteSummary')} />
        <SkeletonCard />
        <View style={{ height: spacing.sm }} />
        <SkeletonCard />
      </Screen>
    )
  }

  if (!prep) {
    return (
      <Screen>
        <ScreenHeader title={t('meeting.twoMinuteSummary')} />
        <ErrorState
          message={query.isError ? t(errorMessageKey(query.error)) : t('meeting.unavailable')}
          {...(query.isError && isRetryable(query.error)
            ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
            : {})}
        />
      </Screen>
    )
  }

  const start = new Date(prep.event.startsAt)
  const end = new Date(prep.event.endsAt)

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader
        title={t('meeting.twoMinuteSummary')}
        subtitle={`${formatWeekdayDate(start, locale, timeZone)} · ${formatTimeRange(start, end, locale, timeZone)}`}
      />

      <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="h2" accessibilityRole="header">
            {prep.event.title}
          </Text>
          <Card style={{ gap: spacing.xs }}>
            <Badge label={t('common.aiGenerated')} tone="primary" icon="auto-awesome" />
            <Text variant="body">{prep.summary}</Text>
          </Card>
        </View>

        <View>
          <SectionHeader title={t('meeting.prep.agenda')} />
          {prep.agenda.length === 0 ? (
            <Text variant="secondary" tone="tertiary">
              {t('meeting.prep.noAgenda')}
            </Text>
          ) : (
            <Card style={{ gap: spacing.xs }}>
              {prep.agenda.map((item, index) => (
                <View key={item} style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <Text variant="secondary" tone="tertiary" tabular>
                    {index + 1}.
                  </Text>
                  <Text variant="body" style={{ flex: 1 }}>
                    {item}
                  </Text>
                </View>
              ))}
              <Text variant="micro" tone="tertiary">
                {t('meeting.prep.agendaFromInvite')}
              </Text>
            </Card>
          )}
        </View>

        <View>
          <SectionHeader
            title={`${t('meeting.attendees.title')} · ${prep.attendees.length}`}
          />
          <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
            {prep.attendees.map((attendee, index) => (
              <View key={attendee.email}>
                {index > 0 ? <Divider inset={44} /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    gap: spacing.sm,
                    alignItems: 'center',
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Avatar name={attendee.name ?? attendee.email} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>
                      {attendee.name ?? attendee.email}
                    </Text>
                    <Text variant="micro" tone="tertiary" numberOfLines={1}>
                      {[attendee.company, attendee.role].filter(Boolean).join(' · ') ||
                        attendee.email}
                    </Text>
                  </View>
                  {attendee.isVip ? (
                    <Badge label={t('person.header.vip')} tone="warning" icon="star" />
                  ) : attendee.lastContactAt === null ? (
                    <Badge label={t('meeting.attendees.firstMeeting')} tone="info" />
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        </View>

        <View>
          <SectionHeader title={t('meeting.prep.openItems')} />
          {prep.openCommitments.length === 0 ? (
            <Text variant="secondary" tone="tertiary">
              {t('meeting.prep.noOpenItems')}
            </Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {prep.openCommitments.map((commitment) => (
                <Card
                  key={commitment.id}
                  onPress={() => router.push(`/commitment/${commitment.id}`)}
                  accessibilityLabel={commitment.text}
                  style={{ gap: spacing.xxs }}
                >
                  <Text variant="body">{commitment.text}</Text>
                  <Text variant="micro" tone="tertiary">
                    {t(`commitment.direction.${commitment.direction}`)}
                  </Text>
                </Card>
              ))}
            </View>
          )}
        </View>

        {prep.suggestedQuestions.length > 0 ? (
          <View>
            <SectionHeader title={t('meeting.prep.questions')} />
            <Card style={{ gap: spacing.xs }}>
              {prep.suggestedQuestions.map((question) => (
                <View key={question} style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <MaterialIcons
                    name="help-outline"
                    size={16}
                    color={theme.colors.textTertiary}
                    style={{ marginTop: 2 }}
                  />
                  <Text variant="body" style={{ flex: 1 }}>
                    {question}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {prep.relatedThreadIds.length > 0 ? (
          <View>
            <SectionHeader title={t('meeting.prep.lastEmails')} />
            <View style={{ gap: spacing.xs }}>
              {prep.relatedThreadIds.slice(0, 5).map((threadId) => (
                <Button
                  key={threadId}
                  label={t('email.actions.openOriginal')}
                  onPress={() => router.push(`/thread/${threadId}`)}
                  variant="ghost"
                  size="sm"
                  testID={`prep-thread-${threadId}`}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: spacing.xs }}>
          <Button
            label={t('meeting.action.addNote')}
            onPress={() => router.push(`/meeting/${prep.eventId}/note`)}
            variant="tonal"
            fullWidth
            testID="prep-add-note"
          />
          <Button
            label={t('meeting.action.regenerate')}
            onPress={() => void query.refetch()}
            variant="ghost"
            size="sm"
            fullWidth
            loading={query.isFetching}
            testID="prep-regenerate"
          />
        </View>
      </View>
    </Screen>
  )
}
