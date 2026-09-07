import { spacing } from '@da/design-tokens'
import type { EmailCategory, EmailThread, Importance } from '@da/domain'
import { formatTime } from '@da/i18n'
import { type MaterialIcons } from '@expo/vector-icons'
import { View } from 'react-native'
import { useI18n, useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Avatar } from '../ui/Avatar'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'

const CATEGORY_BADGE: Partial<
  Record<EmailCategory, { tone: BadgeTone; icon: keyof typeof MaterialIcons.glyphMap; key: string }>
> = {
  security: { tone: 'critical', icon: 'shield', key: 'mail.category.security' },
  deadline: { tone: 'warning', icon: 'flag', key: 'mail.category.deadline' },
  waiting_for_user: {
    tone: 'warning',
    icon: 'schedule-send',
    key: 'mail.category.waiting_for_user',
  },
  waiting_for_other: {
    tone: 'neutral',
    icon: 'hourglass-empty',
    key: 'mail.category.waiting_for_other',
  },
  meeting: { tone: 'info', icon: 'event', key: 'mail.category.meeting' },
  payment: { tone: 'neutral', icon: 'receipt-long', key: 'mail.category.payment' },
  travel: { tone: 'info', icon: 'flight', key: 'mail.category.travel' },
  shipment: { tone: 'neutral', icon: 'local-shipping', key: 'mail.category.shipment' },
  action_required: { tone: 'primary', icon: 'bolt', key: 'mail.category.action_required' },
}

export interface EmailCardProps {
  thread: EmailThread
  /** Display name of the counterparty, resolved by the caller from contacts. */
  senderName: string
  onPress: () => void
  /** The user's zone, so the timestamp reads as their wall clock. */
  timeZone: string
  isVip?: boolean
  testID?: string
}

/**
 * A thread row in the Flow feed and Mail Intelligence.
 *
 * The AI summary leads and the raw subject follows, because the product's
 * promise is that you read the summary instead of the mail. The subject is
 * still shown — a summary you cannot check against its source is not something
 * to act on.
 */
export function EmailCard({
  thread,
  senderName,
  onPress,
  timeZone,
  isVip = false,
  testID,
}: EmailCardProps) {
  const theme = useTheme()
  const t = useT()
  const { locale } = useI18n()
  const badge = CATEGORY_BADGE[thread.category]
  const time = formatTime(new Date(thread.lastMessageAt), locale, timeZone)

  const importanceLabel: Record<Importance, string> = {
    critical: t('common.importance.critical'),
    high: t('common.importance.high'),
    normal: t('common.importance.normal'),
    low: t('common.importance.low'),
  }

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${senderName}. ${thread.summary ?? thread.subject}. ${
        importanceLabel[thread.importance]
      }`}
      testID={testID}
      style={{ gap: spacing.xs }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Avatar name={senderName} size={36} isVip={isVip} />

        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text
              variant="bodyStrong"
              numberOfLines={1}
              style={{ flex: 1, fontWeight: thread.isRead ? '500' : '600' }}
            >
              {senderName}
            </Text>
            <Text variant="micro" tone="tertiary" tabular>
              {time}
            </Text>
            {!thread.isRead ? (
              <View
                accessible={false}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: theme.colors.primary,
                }}
              />
            ) : null}
          </View>

          <Text variant="secondary" tone="secondary" numberOfLines={1}>
            {thread.subject}
          </Text>
        </View>
      </View>

      {thread.summary ? (
        <Text variant="body" numberOfLines={3}>
          {thread.summary}
        </Text>
      ) : null}

      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}
      >
        {thread.importance === 'critical' ? (
          <Badge label={importanceLabel.critical} tone="critical" icon="priority-high" />
        ) : null}
        {badge ? <Badge label={t(badge.key)} tone={badge.tone} icon={badge.icon} /> : null}
        {thread.requiresUserAction ? (
          <Badge label={t('mail.categories.awaitingYou')} tone="primary" icon="reply" />
        ) : null}
        {thread.messageCount > 1 ? (
          <Text variant="micro" tone="tertiary" tabular>
            {t('mail.thread.messages', { count: thread.messageCount })}
          </Text>
        ) : null}
      </View>
    </Card>
  )
}
