import { spacing } from '@da/design-tokens'
import type { CalendarEvent } from '@da/domain'
import { formatTimeRange } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { View } from 'react-native'
import { useI18n, useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { IconTile } from '../ui/Layout'
import { Text } from '../ui/Text'

export interface MeetingCardProps {
  event: CalendarEvent
  timeZone: string
  onPress: () => void
  /** Opens Meeting Prep. Omitted on the free plan, where the feature is gated. */
  onPrepare?: (() => void) | undefined
  /** Opens the conference URL. Only passed when the event actually has one. */
  onJoin?: (() => void) | undefined
  /** Minutes until it starts; negative once it has begun. */
  minutesUntil: number | null
  testID?: string
}

/**
 * A meeting on Today and Plan.
 *
 * "Starts in N minutes" is only rendered when the caller supplies a real
 * `minutesUntil`; nothing here derives a countdown from the clock, so a card
 * rendered from cached data cannot silently claim a meeting is imminent.
 */
export function MeetingCard({
  event,
  timeZone,
  onPress,
  onPrepare,
  onJoin,
  minutesUntil,
  testID,
}: MeetingCardProps) {
  const theme = useTheme()
  const t = useT()
  const { locale, plural } = useI18n()

  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  const range = event.isAllDay
    ? t('calendar.event.allDay')
    : formatTimeRange(start, end, locale, timeZone)

  const others = event.attendees.filter((a) => !a.isSelf)
  const inProgress = minutesUntil !== null && minutesUntil <= 0
  const imminent = minutesUntil !== null && minutesUntil > 0 && minutesUntil <= 30

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${event.title}. ${range}`}
      testID={testID}
      style={{ gap: spacing.xs }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <IconTile icon="event" tone={imminent || inProgress ? 'primary' : 'neutral'} />

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" numberOfLines={2}>
            {event.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="secondary" tone="secondary" tabular>
              {range}
            </Text>
            {event.location ? (
              <>
                <Text variant="secondary" tone="tertiary">
                  ·
                </Text>
                <Text variant="secondary" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                  {event.location}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </View>

      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}
      >
        {inProgress ? (
          <Badge label={t('calendar.event.inProgress')} tone="primary" icon="play-circle" />
        ) : null}
        {imminent && minutesUntil !== null ? (
          <Badge
            label={plural('calendar.event.startsIn', minutesUntil)}
            tone="warning"
            icon="schedule"
          />
        ) : null}
        {others.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="group" size={13} color={theme.colors.textTertiary} />
            <Text variant="micro" tone="tertiary" tabular>
              {plural('calendar.event.attendeeCount', others.length)}
            </Text>
          </View>
        ) : null}
      </View>

      {onPrepare || onJoin ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xxs }}>
          {onPrepare ? (
            <Button
              label={t('meeting.action.generatePrep')}
              onPress={onPrepare}
              variant="tonal"
              size="sm"
              style={{ flex: 1 }}
            />
          ) : null}
          {onJoin ? (
            <Button
              label={t('meeting.action.join')}
              onPress={onJoin}
              variant="neutral"
              size="sm"
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  )
}
