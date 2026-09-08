import { type SourceRef } from '@da/domain'
import { radius, spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Pressable } from './Pressable'
import { Text } from './Text'

const ICON_FOR_TYPE: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  email: 'mail',
  calendar_event: 'event',
  task: 'check-circle-outline',
  capture: 'add-a-photo',
  commitment: 'handshake',
  notification: 'notifications',
  contact: 'person',
  user_input: 'edit-note',
}

export interface SourceChipProps {
  source: SourceRef
  /** Opens the underlying record. Omit only for a source that has no detail view. */
  onPress?: () => void
  testID?: string
}

/**
 * The provenance chip — "Gmail · Ahmet Yılmaz · 08:42".
 *
 * Every AI claim the app renders is accompanied by one of these, and tapping it
 * opens the record the claim came from. That traceability is a product
 * guarantee, so the chip takes a real `SourceRef` rather than free-form text:
 * a screen cannot show a source it does not actually have.
 */
export function SourceChip({ source, onPress, testID }: SourceChipProps) {
  const theme = useTheme()
  const icon = ICON_FOR_TYPE[source.type] ?? 'link'

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.xs,
        paddingVertical: 4,
        borderRadius: radius.chip,
        backgroundColor: theme.colors.surface2,
      }}
    >
      <MaterialIcons name={icon} size={12} color={theme.colors.textTertiary} />
      <Text variant="micro" tone="tertiary" numberOfLines={1}>
        {source.label}
      </Text>
      {onPress ? (
        <MaterialIcons name="chevron-right" size={12} color={theme.colors.textTertiary} />
      ) : null}
    </View>
  )

  if (!onPress) return content

  return (
    <Pressable
      onPress={onPress}
      haptic="none"
      scaleOnPress={false}
      accessibilityLabel={source.label}
      accessibilityRole="link"
      testID={testID}
      // The chip is deliberately short — it sits inline under a card's text —
      // so the touch target is restored with slop rather than by growing the
      // visible box. Overriding minHeight to 0 without it left roughly a 20pt
      // target on a control that appears on every insight card and every
      // assistant citation.
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={{ minHeight: 0, alignSelf: 'flex-start' }}
    >
      {content}
    </Pressable>
  )
}
