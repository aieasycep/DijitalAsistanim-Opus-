import { spacing } from '@da/design-tokens'
import type { Insight, InsightAction } from '@da/domain'
import { MaterialIcons } from '@expo/vector-icons'
import { View } from 'react-native'
import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { Pressable } from '../ui/Pressable'
import { SourceChip } from '../ui/SourceChip'
import { Text } from '../ui/Text'

const ICON_FOR_ACTION: Record<InsightAction['kind'], keyof typeof MaterialIcons.glyphMap> = {
  open_source: 'open-in-new',
  draft_reply: 'edit-note',
  create_task: 'check-circle-outline',
  add_to_calendar: 'event',
  set_reminder: 'notifications',
  prepare_meeting: 'auto-awesome',
  mark_done: 'check-circle',
  track_shipment: 'local-shipping',
  open_person: 'person',
  dismiss: 'close',
}

export interface InsightCardProps {
  insight: Insight
  /**
   * Invoked for whichever action the user tapped. Required: an action row that
   * cannot do anything must not be rendered, so the card takes the handler
   * rather than deciding for itself whether the buttons work.
   */
  onAction: (action: InsightAction) => void
  onOpenSource?: (() => void) | undefined
  onPress?: (() => void) | undefined
  testID?: string
}

/**
 * The priority card that carries the Today screen.
 *
 * Three things are non-negotiable and therefore structural: the importance
 * badge names its level in words as well as colour, the source chip is always
 * rendered when a source exists, and every action button comes from the
 * insight's own action list so there is never a button without a handler.
 */
export function InsightCard({
  insight,
  onAction,
  onOpenSource,
  onPress,
  testID,
}: InsightCardProps) {
  const theme = useTheme()
  const t = useT()
  const isDone = Boolean(insight.completedAt)

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={insight.title}
      testID={testID}
      style={{ gap: spacing.xs, opacity: isDone ? 0.6 : 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {insight.importance === 'critical' ? (
          <Badge label={t('common.importance.critical')} tone="critical" icon="priority-high" />
        ) : null}
        {insight.dueAt ? (
          <Badge label={t('common.deadline')} tone="warning" icon="flag" />
        ) : null}
        {isDone ? (
          <Badge label={t('common.done')} tone="success" icon="check-circle" />
        ) : null}
      </View>

      <Text variant="h3" numberOfLines={3}>
        {insight.title}
      </Text>

      {insight.detail ? (
        <Text variant="secondary" tone="secondary" numberOfLines={3}>
          {insight.detail}
        </Text>
      ) : null}

      {insight.reasonImportant ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 6,
            backgroundColor: theme.colors.primarySoft,
            padding: spacing.xs,
            borderRadius: 10,
          }}
        >
          <MaterialIcons name="auto-awesome" size={13} color={theme.colors.primaryOnSoft} />
          <Text variant="micro" tone="primary" style={{ flex: 1, letterSpacing: 0 }}>
            {insight.reasonImportant}
          </Text>
        </View>
      ) : null}

      {insight.source ? <SourceChip source={insight.source} onPress={onOpenSource} /> : null}

      {insight.actions.length > 0 && !isDone ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.xs,
            marginTop: spacing.xxs,
          }}
        >
          {insight.actions.map((action) => (
            <Pressable
              key={`${action.kind}:${action.label}`}
              onPress={() => onAction(action)}
              accessibilityLabel={action.label}
              haptic="light"
              style={{
                minHeight: 36,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: spacing.xs,
                borderRadius: 10,
                backgroundColor: theme.colors.surface2,
              }}
              pressedStyle={{ backgroundColor: theme.colors.hairline }}
            >
              <MaterialIcons
                name={ICON_FOR_ACTION[action.kind]}
                size={14}
                color={theme.colors.textSecondary}
              />
              <Text variant="micro" tone="secondary" style={{ letterSpacing: 0 }}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

