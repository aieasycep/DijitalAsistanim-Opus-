import { radius, spacing } from '@da/design-tokens'
import type { FollowUp } from '@da/domain'
import { HOUR_MS } from '@da/domain'
import { View } from 'react-native'
import { useI18n, useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Pressable } from '../ui/Pressable'
import { Text } from '../ui/Text'

export interface FollowUpCardProps {
  followUp: FollowUp
  subject: string
  now: Date
  onDraftNudge: () => void
  onRemindTomorrow: () => void
  onClose: () => void
  onOpenThread: () => void
  busy?: boolean
  testID?: string
}

/**
 * "Henüz dönüş gelmedi." — a thread the user sent that has gone quiet.
 *
 * All three actions are offered together and none of them sends anything: the
 * nudge action produces a draft that still has to go through an approval.
 *
 * Opening the thread is the summary's tap target rather than the whole card's,
 * so the three buttons stay outside it: iOS collapses an `accessible` subtree
 * into one element, and nested there they would be unreachable by VoiceOver.
 */
export function FollowUpCard({
  followUp,
  subject,
  now,
  onDraftNudge,
  onRemindTomorrow,
  onClose,
  onOpenThread,
  busy = false,
  testID,
}: FollowUpCardProps) {
  const t = useT()
  const theme = useTheme()
  const { plural } = useI18n()

  const silentHours = Math.max(
    0,
    Math.floor((now.getTime() - new Date(followUp.sentAt).getTime()) / HOUR_MS),
  )
  const silentDays = Math.floor(silentHours / 24)

  return (
    <Card style={{ gap: spacing.xs }}>
      <Pressable
        onPress={onOpenThread}
        accessibilityLabel={`${followUp.recipientName ?? followUp.recipientEmail}. ${subject}`}
        testID={testID}
        haptic="light"
        style={{ gap: spacing.xs }}
        pressedStyle={{ backgroundColor: theme.colors.surface2, borderRadius: radius.cardSm }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Avatar name={followUp.recipientName ?? followUp.recipientEmail} size={36} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {followUp.recipientName ?? followUp.recipientEmail}
            </Text>
            <Text variant="secondary" tone="secondary" numberOfLines={1}>
              {subject}
            </Text>
          </View>
        </View>

        <View
          style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Badge label={t('followup.noReplyYet')} tone="warning" icon="schedule-send" />
          <Text variant="micro" tone="tertiary" tabular>
            {silentDays >= 1
              ? plural('followup.card.waitingFor', silentDays)
              : plural('followup.card.waitingFor', silentHours)}
          </Text>
        </View>
      </Pressable>

      <View style={{ gap: spacing.xs }}>
        <Button
          label={t('followup.action.nudgeDraft')}
          onPress={onDraftNudge}
          variant="tonal"
          size="sm"
          loading={busy}
          fullWidth
        />
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Button
            label={t('followup.action.remindMe')}
            onPress={onRemindTomorrow}
            variant="neutral"
            size="sm"
            style={{ flex: 1 }}
          />
          <Button
            label={t('followup.action.markResolved')}
            onPress={onClose}
            variant="neutral"
            size="sm"
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Card>
  )
}
